resource "aws_cloudfront_origin_access_identity" "spa" {
  comment = "${var.project}-${var.environment}-spa"
}

resource "aws_s3_bucket_policy" "spa" {
  bucket = var.spa_bucket

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = aws_cloudfront_origin_access_identity.spa.iam_arn }
      Action    = "s3:GetObject"
      Resource  = "arn:aws:s3:::${var.spa_bucket}/*"
    }]
  })
}

resource "aws_cloudfront_distribution" "spa" {
  enabled             = true
  default_root_object = "index.html"

  origin {
    domain_name = var.spa_bucket_regional_domain
    origin_id   = "s3-spa"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.spa.cloudfront_access_identity_path
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-spa"
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }
  }

  # SPA routing: serve index.html for all 404s
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = { Name = "${var.project}-${var.environment}-cdn" }
}
