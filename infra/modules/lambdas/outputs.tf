output "crawler_function_name"   { value = aws_lambda_function.crawler.function_name }
output "crawler_ecr_url"         { value = aws_ecr_repository.crawler.repository_url }
output "consumer_function_name"  { value = aws_lambda_function.consumer.function_name }
output "generator_function_name" { value = aws_lambda_function.generator.function_name }
output "monitor_function_name"   { value = aws_lambda_function.monitor.function_name }
