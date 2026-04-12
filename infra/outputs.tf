output "api_url" {
  value = module.api.alb_dns_name
}

output "cdn_url" {
  value = module.cdn.distribution_domain_name
}

output "results_bucket" {
  value = module.storage.results_bucket_name
}
