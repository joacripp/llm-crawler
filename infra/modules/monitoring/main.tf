locals {
  prefix = "${var.project}-${var.environment}"

  # Resource names follow the pattern from other modules
  lambda_functions = {
    crawler   = "${local.prefix}-crawler"
    consumer  = "${local.prefix}-consumer"
    generator = "${local.prefix}-generator"
    monitor   = "${local.prefix}-monitor"
  }

  sqs_queues = {
    jobs      = "${local.prefix}-crawl-jobs"
    pages     = "${local.prefix}-crawl-pages"
    completed = "${local.prefix}-crawl-completed"
  }

  sqs_dlqs = {
    jobs      = "${local.prefix}-crawl-jobs-dlq"
    pages     = "${local.prefix}-crawl-pages-dlq"
    completed = "${local.prefix}-crawl-completed-dlq"
  }

  ecs_cluster = local.prefix
  ecs_service = "${local.prefix}-api"
  alb_name    = "${local.prefix}-api"
  tg_name     = "${local.prefix}-api"
  rds_id      = local.prefix
  redis_id    = local.prefix
}

# ---------------------------------------------------------------------------
# SNS Topic for alarms
# ---------------------------------------------------------------------------
resource "aws_sns_topic" "alerts" {
  name = "${local.prefix}-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# ---------------------------------------------------------------------------
# DLQ Alarms — any message in a DLQ means something is permanently failing
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "dlq_not_empty" {
  for_each = local.sqs_dlqs

  alarm_name          = "${each.value}-not-empty"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  alarm_description   = "DLQ ${each.value} has messages — a Lambda is permanently failing"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    QueueName = each.value
  }
}

# ---------------------------------------------------------------------------
# Lambda error alarms
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = local.lambda_functions

  alarm_name          = "${each.value}-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "Lambda ${each.value} has >5 errors in 10 minutes"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    FunctionName = each.value
  }
}

# ---------------------------------------------------------------------------
# ECS task count alarm
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "ecs_no_running_tasks" {
  alarm_name          = "${local.ecs_service}-no-running-tasks"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "RunningTaskCount"
  namespace           = "ECS/ContainerInsights"
  period              = 60
  statistic           = "Minimum"
  threshold           = 1
  alarm_description   = "ECS service ${local.ecs_service} has 0 running tasks"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    ClusterName = local.ecs_cluster
    ServiceName = local.ecs_service
  }
}
