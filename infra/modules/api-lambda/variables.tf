variable "environment" { type = string }
variable "project"     { type = string }

variable "database_url" {
  type      = string
  sensitive = true
}

variable "redis_url" {
  type      = string
  sensitive = true
}

variable "jobs_queue_url"  { type = string }
variable "results_bucket"  { type = string }

variable "jwt_secret" {
  type      = string
  sensitive = true
}

variable "google_client_id" {
  type      = string
  sensitive = true
}

variable "google_client_secret" {
  type      = string
  sensitive = true
}

variable "gh_oauth_client_id" {
  type      = string
  sensitive = true
}

variable "gh_oauth_client_secret" {
  type      = string
  sensitive = true
}

variable "domain"          { type = string }
variable "certificate_arn" { type = string }
variable "hosted_zone_id"  { type = string }
