output "crawl_jobs_queue_arn"      { value = aws_sqs_queue.crawl_jobs.arn }
output "crawl_jobs_queue_url"      { value = aws_sqs_queue.crawl_jobs.url }
output "crawl_pages_queue_arn"     { value = aws_sqs_queue.crawl_pages.arn }
output "crawl_pages_queue_url"    { value = aws_sqs_queue.crawl_pages.url }
output "crawl_completed_queue_arn" { value = aws_sqs_queue.crawl_completed.arn }
output "crawl_completed_queue_url" { value = aws_sqs_queue.crawl_completed.url }
