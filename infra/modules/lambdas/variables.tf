variable "environment"               { type = string }
variable "project"                   { type = string }
variable "private_subnet_ids"        { type = list(string) }
variable "lambda_security_group_id"  { type = string }
variable "crawl_jobs_queue_arn"      { type = string }
variable "crawl_pages_queue_arn"     { type = string }
variable "crawl_completed_queue_arn" { type = string }
variable "event_bus_name"            { type = string }
variable "database_url"              { type = string; sensitive = true }
variable "redis_url"                 { type = string }
variable "results_bucket"            { type = string }
variable "crawl_jobs_queue_url"      { type = string }
variable "crawl_completed_queue_url" { type = string }
