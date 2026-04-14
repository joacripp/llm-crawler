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

# ---------------------------------------------------------------------------
# Dashboard 1: Operations Overview
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_dashboard" "operations" {
  dashboard_name = "${local.prefix}-operations"
  dashboard_body = jsonencode({
    widgets = [
      # Row 1: Queue backlog + DLQ depth + Max queue age
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 8
        height = 6
        properties = {
          title   = "Queue Backlog"
          view    = "singleValue"
          region  = var.aws_region
          metrics = [
            for name, queue in local.sqs_queues : [
              "AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", queue, { label = name }
            ]
          ]
          period = 60
        }
      },
      {
        type   = "metric"
        x      = 8
        y      = 0
        width  = 8
        height = 6
        properties = {
          title   = "DLQ Depth (should be 0)"
          view    = "singleValue"
          region  = var.aws_region
          metrics = [
            for name, dlq in local.sqs_dlqs : [
              "AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", dlq, { label = "${name} DLQ" }
            ]
          ]
          period = 60
        }
      },
      {
        type   = "metric"
        x      = 16
        y      = 0
        width  = 8
        height = 6
        properties = {
          title   = "Max Queue Age (seconds)"
          view    = "singleValue"
          region  = var.aws_region
          metrics = [
            for name, queue in local.sqs_queues : [
              "AWS/SQS", "ApproximateAgeOfOldestMessage", "QueueName", queue, { label = name }
            ]
          ]
          period = 60
        }
      },
      # Row 2: Lambda errors + throttles
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title   = "Lambda Errors"
          view    = "timeSeries"
          stacked = true
          region  = var.aws_region
          metrics = [
            for name, fn in local.lambda_functions : [
              "AWS/Lambda", "Errors", "FunctionName", fn, { label = name, stat = "Sum" }
            ]
          ]
          period = 60
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title   = "Lambda Throttles"
          view    = "timeSeries"
          region  = var.aws_region
          metrics = [
            for name, fn in local.lambda_functions : [
              "AWS/Lambda", "Throttles", "FunctionName", fn, { label = name, stat = "Sum" }
            ]
          ]
          period = 60
        }
      },
      # Row 3: ECS tasks + API 5xx + API latency
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 6
        height = 6
        properties = {
          title   = "ECS Running Tasks"
          view    = "singleValue"
          region  = var.aws_region
          metrics = [
            ["ECS/ContainerInsights", "RunningTaskCount", "ClusterName", local.ecs_cluster, "ServiceName", local.ecs_service, { label = "tasks" }]
          ]
          period = 60
        }
      },
      {
        type   = "metric"
        x      = 6
        y      = 12
        width  = 9
        height = 6
        properties = {
          title   = "API 5xx Errors"
          view    = "timeSeries"
          region  = var.aws_region
          metrics = [
            ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", local.alb_name, { label = "5xx", stat = "Sum" }]
          ]
          period = 60
        }
      },
      {
        type   = "metric"
        x      = 15
        y      = 12
        width  = 9
        height = 6
        properties = {
          title   = "API Latency (seconds)"
          view    = "timeSeries"
          region  = var.aws_region
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", local.alb_name, { label = "p50", stat = "p50" }],
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", local.alb_name, { label = "p90", stat = "p90" }],
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", local.alb_name, { label = "p99", stat = "p99" }]
          ]
          period = 60
        }
      },
      # Row 4: RDS connections + Redis connections
      {
        type   = "metric"
        x      = 0
        y      = 18
        width  = 12
        height = 6
        properties = {
          title   = "RDS Connections"
          view    = "timeSeries"
          region  = var.aws_region
          metrics = [
            ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", local.rds_id, { label = "connections" }]
          ]
          period = 60
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 18
        width  = 12
        height = 6
        properties = {
          title   = "Redis Connections"
          view    = "timeSeries"
          region  = var.aws_region
          metrics = [
            ["AWS/ElastiCache", "CurrConnections", "CacheClusterId", "${local.redis_id}-001", { label = "connections" }]
          ]
          period = 60
        }
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# Dashboard 2: Job Pipeline Deep Dive
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_dashboard" "pipeline" {
  dashboard_name = "${local.prefix}-pipeline"
  dashboard_body = jsonencode({
    widgets = [
      # Row 1: Queue age + Queue depth
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "Queue Age (seconds) — growing = consumer can't keep up"
          view    = "timeSeries"
          region  = var.aws_region
          metrics = [
            for name, queue in local.sqs_queues : [
              "AWS/SQS", "ApproximateAgeOfOldestMessage", "QueueName", queue, { label = name }
            ]
          ]
          period = 60
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "Queue Depth (visible + in-flight)"
          view    = "timeSeries"
          stacked = true
          region  = var.aws_region
          metrics = concat(
            [for name, queue in local.sqs_queues : ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", queue, { label = "${name} visible" }]],
            [for name, queue in local.sqs_queues : ["AWS/SQS", "ApproximateNumberOfMessagesNotVisible", "QueueName", queue, { label = "${name} in-flight" }]]
          )
          period = 60
        }
      },
      # Row 2: Lambda durations
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 8
        height = 6
        properties = {
          title   = "Crawler Duration (ms)"
          view    = "timeSeries"
          region  = var.aws_region
          metrics = [
            ["AWS/Lambda", "Duration", "FunctionName", local.lambda_functions.crawler, { label = "p50", stat = "p50" }],
            ["AWS/Lambda", "Duration", "FunctionName", local.lambda_functions.crawler, { label = "p90", stat = "p90" }],
            ["AWS/Lambda", "Duration", "FunctionName", local.lambda_functions.crawler, { label = "max", stat = "Maximum" }]
          ]
          period = 300
        }
      },
      {
        type   = "metric"
        x      = 8
        y      = 6
        width  = 8
        height = 6
        properties = {
          title   = "Consumer Duration (ms)"
          view    = "timeSeries"
          region  = var.aws_region
          metrics = [
            ["AWS/Lambda", "Duration", "FunctionName", local.lambda_functions.consumer, { label = "p50", stat = "p50" }],
            ["AWS/Lambda", "Duration", "FunctionName", local.lambda_functions.consumer, { label = "p90", stat = "p90" }]
          ]
          period = 300
        }
      },
      {
        type   = "metric"
        x      = 16
        y      = 6
        width  = 8
        height = 6
        properties = {
          title   = "Generator Duration (ms)"
          view    = "timeSeries"
          region  = var.aws_region
          metrics = [
            ["AWS/Lambda", "Duration", "FunctionName", local.lambda_functions.generator, { label = "p50", stat = "p50" }],
            ["AWS/Lambda", "Duration", "FunctionName", local.lambda_functions.generator, { label = "p90", stat = "p90" }]
          ]
          period = 300
        }
      },
      # Row 3: Concurrent executions + EventBridge + Monitor
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 8
        height = 6
        properties = {
          title   = "Lambda Concurrent Executions"
          view    = "timeSeries"
          region  = var.aws_region
          metrics = [
            for name, fn in local.lambda_functions : [
              "AWS/Lambda", "ConcurrentExecutions", "FunctionName", fn, { label = name, stat = "Maximum" }
            ]
          ]
          period = 60
        }
      },
      {
        type   = "metric"
        x      = 8
        y      = 12
        width  = 8
        height = 6
        properties = {
          title   = "EventBridge Matched Events"
          view    = "timeSeries"
          region  = var.aws_region
          metrics = [
            ["AWS/Events", "MatchedEvents", "RuleName", "${local.prefix}-page-crawled", { label = "page.crawled", stat = "Sum" }],
            ["AWS/Events", "MatchedEvents", "RuleName", "${local.prefix}-job-completed", { label = "job.completed", stat = "Sum" }]
          ]
          period = 60
        }
      },
      {
        type   = "metric"
        x      = 16
        y      = 12
        width  = 8
        height = 6
        properties = {
          title   = "Monitor Invocations (every 2 min)"
          view    = "timeSeries"
          region  = var.aws_region
          metrics = [
            ["AWS/Lambda", "Invocations", "FunctionName", local.lambda_functions.monitor, { label = "invocations", stat = "Sum" }]
          ]
          period = 120
        }
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# Dashboard 3: Database & Cache
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_dashboard" "database" {
  dashboard_name = "${local.prefix}-database"
  dashboard_body = jsonencode({
    widgets = [
      # Row 1: RDS CPU + Memory + IOPS
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 8
        height = 6
        properties = {
          title   = "RDS CPU %"
          view    = "timeSeries"
          region  = var.aws_region
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", local.rds_id, { label = "CPU" }]
          ]
          period = 300
        }
      },
      {
        type   = "metric"
        x      = 8
        y      = 0
        width  = 8
        height = 6
        properties = {
          title   = "RDS Freeable Memory (bytes)"
          view    = "timeSeries"
          region  = var.aws_region
          metrics = [
            ["AWS/RDS", "FreeableMemory", "DBInstanceIdentifier", local.rds_id, { label = "free memory" }]
          ]
          period = 300
        }
      },
      {
        type   = "metric"
        x      = 16
        y      = 0
        width  = 8
        height = 6
        properties = {
          title   = "RDS IOPS"
          view    = "timeSeries"
          region  = var.aws_region
          metrics = [
            ["AWS/RDS", "ReadIOPS", "DBInstanceIdentifier", local.rds_id, { label = "read" }],
            ["AWS/RDS", "WriteIOPS", "DBInstanceIdentifier", local.rds_id, { label = "write" }]
          ]
          period = 300
        }
      },
      # Row 2: RDS connections + Free storage
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title   = "RDS Connections"
          view    = "timeSeries"
          region  = var.aws_region
          metrics = [
            ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", local.rds_id, { label = "connections" }]
          ]
          period = 300
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title   = "RDS Free Storage (bytes)"
          view    = "singleValue"
          region  = var.aws_region
          metrics = [
            ["AWS/RDS", "FreeStorageSpace", "DBInstanceIdentifier", local.rds_id, { label = "free" }]
          ]
          period = 300
        }
      },
      # Row 3: Redis CPU + Memory + Connections
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 8
        height = 6
        properties = {
          title   = "Redis CPU %"
          view    = "timeSeries"
          region  = var.aws_region
          metrics = [
            ["AWS/ElastiCache", "EngineCPUUtilization", "CacheClusterId", "${local.redis_id}-001", { label = "CPU" }]
          ]
          period = 300
        }
      },
      {
        type   = "metric"
        x      = 8
        y      = 12
        width  = 8
        height = 6
        properties = {
          title   = "Redis Memory %"
          view    = "timeSeries"
          region  = var.aws_region
          metrics = [
            ["AWS/ElastiCache", "DatabaseMemoryUsagePercentage", "CacheClusterId", "${local.redis_id}-001", { label = "memory %" }]
          ]
          period = 300
        }
      },
      {
        type   = "metric"
        x      = 16
        y      = 12
        width  = 8
        height = 6
        properties = {
          title   = "Redis Connections + Evictions"
          view    = "timeSeries"
          region  = var.aws_region
          metrics = [
            ["AWS/ElastiCache", "CurrConnections", "CacheClusterId", "${local.redis_id}-001", { label = "connections" }],
            ["AWS/ElastiCache", "Evictions", "CacheClusterId", "${local.redis_id}-001", { label = "evictions" }]
          ]
          period = 300
        }
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# Dashboard 4: Cost & Efficiency
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_dashboard" "cost" {
  dashboard_name = "${local.prefix}-cost"
  dashboard_body = jsonencode({
    widgets = [
      # Row 1: Lambda invocations (daily)
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 24
        height = 6
        properties = {
          title   = "Lambda Invocations (daily)"
          view    = "bar"
          stacked = true
          region  = var.aws_region
          metrics = [
            for name, fn in local.lambda_functions : [
              "AWS/Lambda", "Invocations", "FunctionName", fn, { label = name, stat = "Sum" }
            ]
          ]
          period = 86400
        }
      },
      # Row 2: Lambda duration (cost proxy) + Crawler memory
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title   = "Lambda Avg Duration (ms)"
          view    = "timeSeries"
          region  = var.aws_region
          metrics = [
            for name, fn in local.lambda_functions : [
              "AWS/Lambda", "Duration", "FunctionName", fn, { label = name, stat = "Average" }
            ]
          ]
          period = 3600
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title   = "Crawler Max Memory Used (MB)"
          view    = "timeSeries"
          region  = var.aws_region
          metrics = [
            ["AWS/Lambda", "MaxMemoryUsed", "FunctionName", local.lambda_functions.crawler, { label = "used (MB)" }]
          ]
          period = 3600
        }
      },
      # Row 3: ECS CPU/Memory + S3 bucket size
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 12
        height = 6
        properties = {
          title   = "ECS CPU & Memory Utilization %"
          view    = "timeSeries"
          region  = var.aws_region
          metrics = [
            ["ECS/ContainerInsights", "CpuUtilized", "ClusterName", local.ecs_cluster, "ServiceName", local.ecs_service, { label = "CPU" }],
            ["ECS/ContainerInsights", "MemoryUtilized", "ClusterName", local.ecs_cluster, "ServiceName", local.ecs_service, { label = "Memory" }]
          ]
          period = 3600
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 12
        width  = 12
        height = 6
        properties = {
          title   = "S3 Results Bucket Size"
          view    = "singleValue"
          region  = var.aws_region
          metrics = [
            ["AWS/S3", "BucketSizeBytes", "StorageType", "StandardStorage", "BucketName", "${local.prefix}-results", { label = "bytes" }]
          ]
          period = 86400
          stat   = "Average"
        }
      }
    ]
  })
}
