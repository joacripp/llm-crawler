output "lambda_arn"           { value = aws_lambda_function.api.arn }
output "api_gateway_url"      { value = aws_apigatewayv2_api.api.api_endpoint }
output "ecr_repository_url"   { value = aws_ecr_repository.api.repository_url }
