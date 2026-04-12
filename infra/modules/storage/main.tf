resource "aws_s3_bucket" "results" {
  bucket = "${var.project}-${var.environment}-results"
  tags   = { Name = "${var.project}-${var.environment}-results" }
}

resource "aws_s3_bucket_lifecycle_configuration" "results" {
  bucket = aws_s3_bucket.results.id

  rule {
    id     = "archive-results"
    status = "Enabled"
    filter { prefix = "results/" }

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
    transition {
      days          = 90
      storage_class = "GLACIER"
    }
  }
}

resource "aws_s3_bucket" "spa" {
  bucket = "${var.project}-${var.environment}-spa"
  tags   = { Name = "${var.project}-${var.environment}-spa" }
}

resource "aws_s3_bucket_website_configuration" "spa" {
  bucket = aws_s3_bucket.spa.id

  index_document { suffix = "index.html" }
  error_document { key = "index.html" }
}
