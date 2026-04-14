# IAM role shared by all Lambdas
resource "aws_iam_role" "lambda" {
  name = "${var.project}-${var.environment}-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "lambda" {
  name = "${var.project}-${var.environment}-lambda-policy"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes",
          "sqs:SendMessage"
        ]
        Resource = [var.crawl_jobs_queue_arn, var.crawl_pages_queue_arn, var.crawl_completed_queue_arn]
      },
      {
        Effect   = "Allow"
        Action   = ["events:PutEvents"]
        Resource = ["arn:aws:events:*:*:event-bus/${var.event_bus_name}"]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject"]
        Resource = ["arn:aws:s3:::${var.results_bucket}/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = ["arn:aws:logs:*:*:*"]
      },
      {
        Effect   = "Allow"
        Action   = ["ec2:CreateNetworkInterface", "ec2:DescribeNetworkInterfaces", "ec2:DeleteNetworkInterface"]
        Resource = ["*"]
      }
    ]
  })
}

# Crawler Lambda (container image — includes Playwright + Chromium)
resource "aws_ecr_repository" "crawler" {
  name                 = "${var.project}-${var.environment}-crawler"
  image_tag_mutability = "MUTABLE"
  force_delete         = true
}

resource "aws_lambda_function" "crawler" {
  function_name = "${var.project}-${var.environment}-crawler"
  role          = aws_iam_role.lambda.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.crawler.repository_url}:latest"
  timeout       = 900  # 15 minutes
  memory_size   = 3008 # Chromium needs significant memory for page rendering

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [var.lambda_security_group_id]
  }

  environment {
    variables = {
      EVENT_BUS_NAME = var.event_bus_name
    }
  }
}

resource "aws_lambda_event_source_mapping" "crawler_sqs" {
  event_source_arn = var.crawl_jobs_queue_arn
  function_name    = aws_lambda_function.crawler.arn
  batch_size       = 1
}

# Consumer Lambda
resource "aws_lambda_function" "consumer" {
  function_name = "${var.project}-${var.environment}-consumer"
  role          = aws_iam_role.lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 60
  memory_size   = 256

  filename         = "${path.module}/placeholder.zip"
  source_code_hash = filebase64sha256("${path.module}/placeholder.zip")

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [var.lambda_security_group_id]
  }

  environment {
    variables = {
      DATABASE_URL = var.database_url
      REDIS_URL    = var.redis_url
    }
  }
}

resource "aws_lambda_event_source_mapping" "consumer_sqs" {
  event_source_arn       = var.crawl_pages_queue_arn
  function_name          = aws_lambda_function.consumer.arn
  batch_size             = 10
  function_response_types = ["ReportBatchItemFailures"]
}

# Generator Lambda
resource "aws_lambda_function" "generator" {
  function_name = "${var.project}-${var.environment}-generator"
  role          = aws_iam_role.lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 300
  memory_size   = 512

  filename         = "${path.module}/placeholder.zip"
  source_code_hash = filebase64sha256("${path.module}/placeholder.zip")

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [var.lambda_security_group_id]
  }

  environment {
    variables = {
      DATABASE_URL = var.database_url
      REDIS_URL    = var.redis_url
      S3_BUCKET    = var.results_bucket
    }
  }
}

resource "aws_lambda_event_source_mapping" "generator_sqs" {
  event_source_arn = var.crawl_completed_queue_arn
  function_name    = aws_lambda_function.generator.arn
  batch_size       = 1
}

# Monitor Lambda (cron)
resource "aws_lambda_function" "monitor" {
  function_name = "${var.project}-${var.environment}-monitor"
  role          = aws_iam_role.lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 60
  memory_size   = 256

  filename         = "${path.module}/placeholder.zip"
  source_code_hash = filebase64sha256("${path.module}/placeholder.zip")

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [var.lambda_security_group_id]
  }

  environment {
    variables = {
      DATABASE_URL           = var.database_url
      JOBS_QUEUE_URL         = var.crawl_jobs_queue_url
      COMPLETED_QUEUE_URL    = var.crawl_completed_queue_url
      MAX_INVOCATIONS        = "10"
      STALE_THRESHOLD_MINUTES = "3"
    }
  }
}

resource "aws_cloudwatch_event_rule" "monitor_cron" {
  name                = "${var.project}-${var.environment}-monitor-cron"
  schedule_expression = "rate(2 minutes)"
}

resource "aws_cloudwatch_event_target" "monitor_cron" {
  rule = aws_cloudwatch_event_rule.monitor_cron.name
  arn  = aws_lambda_function.monitor.arn
}

resource "aws_lambda_permission" "monitor_cron" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.monitor.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.monitor_cron.arn
}
