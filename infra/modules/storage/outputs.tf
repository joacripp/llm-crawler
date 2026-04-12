output "results_bucket_name"          { value = aws_s3_bucket.results.id }
output "spa_bucket_name"              { value = aws_s3_bucket.spa.id }
output "spa_bucket_regional_domain"   { value = aws_s3_bucket.spa.bucket_regional_domain_name }
