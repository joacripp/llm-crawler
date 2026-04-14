resource "aws_sqs_queue" "crawl_jobs_dlq" {
  name = "${var.project}-${var.environment}-crawl-jobs-dlq"
}

resource "aws_sqs_queue" "crawl_jobs" {
  name                       = "${var.project}-${var.environment}-crawl-jobs"
  visibility_timeout_seconds = 960  # 16 min (> Lambda 15 min timeout)

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.crawl_jobs_dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_sqs_queue" "crawl_pages_dlq" {
  name = "${var.project}-${var.environment}-crawl-pages-dlq"
}

resource "aws_sqs_queue" "crawl_pages" {
  name                       = "${var.project}-${var.environment}-crawl-pages"
  visibility_timeout_seconds = 60

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.crawl_pages_dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_sqs_queue" "crawl_completed_dlq" {
  name = "${var.project}-${var.environment}-crawl-completed-dlq"
}

resource "aws_sqs_queue" "crawl_completed" {
  name                       = "${var.project}-${var.environment}-crawl-completed"
  visibility_timeout_seconds = 30  # Generator runs in <5s; short timeout so pagesEmitted sync retries happen quickly

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.crawl_completed_dlq.arn
    maxReceiveCount     = 5  # pagesEmitted sync retries are expected, not exceptional
  })
}
