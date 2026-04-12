output "alb_dns_name"     { value = aws_lb.api.dns_name }
output "ecr_repository_url" { value = aws_ecr_repository.api.repository_url }
