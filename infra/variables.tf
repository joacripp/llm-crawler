variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev, prod)"
  type        = string
  default     = "dev"
}

variable "project" {
  description = "Project name"
  type        = string
  default     = "llm-crawler"
}

variable "jwt_secret" {
  description = "JWT signing secret"
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "RDS master password"
  type        = string
  sensitive   = true
}

variable "domain" {
  description = "Root domain name"
  type        = string
  default     = "llmtxtgenerator.online"
}

variable "hosted_zone_id" {
  description = "Route 53 hosted zone ID"
  type        = string
  default     = "Z06937762MLQQWARMFO2Z"
}

variable "certificate_arn" {
  description = "ACM certificate ARN (wildcard)"
  type        = string
  default     = "arn:aws:acm:us-east-1:629798234973:certificate/535bf904-5a19-43f9-a61d-001a495bffb7"
}
