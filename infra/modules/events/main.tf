resource "aws_cloudwatch_event_bus" "main" {
  name = "${var.project}-${var.environment}-events"
}

resource "aws_cloudwatch_event_rule" "page_crawled" {
  name           = "${var.project}-${var.environment}-page-crawled"
  event_bus_name = aws_cloudwatch_event_bus.main.name

  event_pattern = jsonencode({
    source      = ["llm-crawler"]
    detail-type = ["page.crawled"]
  })
}

resource "aws_cloudwatch_event_target" "page_crawled_to_sqs" {
  rule           = aws_cloudwatch_event_rule.page_crawled.name
  event_bus_name = aws_cloudwatch_event_bus.main.name
  target_id      = "crawl-pages-queue"
  arn            = var.crawl_pages_queue_arn
}

resource "aws_cloudwatch_event_rule" "job_completed" {
  name           = "${var.project}-${var.environment}-job-completed"
  event_bus_name = aws_cloudwatch_event_bus.main.name

  event_pattern = jsonencode({
    source      = ["llm-crawler"]
    detail-type = ["job.completed"]
  })
}

resource "aws_cloudwatch_event_target" "job_completed_to_sqs" {
  rule           = aws_cloudwatch_event_rule.job_completed.name
  event_bus_name = aws_cloudwatch_event_bus.main.name
  target_id      = "crawl-completed-queue"
  arn            = var.crawl_completed_queue_arn
}

# Allow EventBridge to send to SQS
resource "aws_sqs_queue_policy" "pages_allow_eventbridge" {
  queue_url = var.crawl_pages_queue_url

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "events.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = var.crawl_pages_queue_arn
      Condition = { ArnEquals = { "aws:SourceArn" = aws_cloudwatch_event_rule.page_crawled.arn } }
    }]
  })
}

resource "aws_sqs_queue_policy" "completed_allow_eventbridge" {
  queue_url = var.crawl_completed_queue_url

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "events.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = var.crawl_completed_queue_arn
      Condition = { ArnEquals = { "aws:SourceArn" = aws_cloudwatch_event_rule.job_completed.arn } }
    }]
  })
}
