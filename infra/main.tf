terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "llm-crawler-terraform-state"
    key            = "terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "llm-crawler-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "llm-crawler"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

module "networking" {
  source      = "./modules/networking"
  environment = var.environment
  project     = var.project
}

module "storage" {
  source      = "./modules/storage"
  environment = var.environment
  project     = var.project
}

module "queues" {
  source      = "./modules/queues"
  environment = var.environment
  project     = var.project
}

module "events" {
  source                    = "./modules/events"
  environment               = var.environment
  project                   = var.project
  crawl_pages_queue_arn     = module.queues.crawl_pages_queue_arn
  crawl_pages_queue_url     = module.queues.crawl_pages_queue_url
  crawl_completed_queue_arn = module.queues.crawl_completed_queue_arn
  crawl_completed_queue_url = module.queues.crawl_completed_queue_url
}

module "lambdas" {
  source                    = "./modules/lambdas"
  environment               = var.environment
  project                   = var.project
  crawl_jobs_queue_arn      = module.queues.crawl_jobs_queue_arn
  crawl_pages_queue_arn     = module.queues.crawl_pages_queue_arn
  crawl_completed_queue_arn = module.queues.crawl_completed_queue_arn
  event_bus_name            = module.events.event_bus_name
  database_url              = var.database_url
  redis_url                 = var.redis_url
  results_bucket            = module.storage.results_bucket_name
  crawl_jobs_queue_url      = module.queues.crawl_jobs_queue_url
  crawl_completed_queue_url = module.queues.crawl_completed_queue_url
}

module "api" {
  source                 = "./modules/api"
  environment            = var.environment
  project                = var.project
  vpc_id                 = module.networking.vpc_id
  public_subnet_ids      = module.networking.public_subnet_ids
  private_subnet_ids     = module.networking.private_subnet_ids
  ecs_security_group_id  = module.networking.ecs_security_group_id
  alb_security_group_id  = module.networking.alb_security_group_id
  database_url           = var.database_url
  redis_url              = var.redis_url
  jobs_queue_url         = module.queues.crawl_jobs_queue_url
  results_bucket         = module.storage.results_bucket_name
  jwt_secret             = var.jwt_secret
  google_client_id       = var.google_client_id
  google_client_secret   = var.google_client_secret
  gh_oauth_client_id     = var.gh_oauth_client_id
  gh_oauth_client_secret = var.gh_oauth_client_secret
  domain                 = var.domain
  certificate_arn        = var.certificate_arn
  hosted_zone_id         = var.hosted_zone_id
}

module "ses" {
  source         = "./modules/ses"
  domain         = var.domain
  hosted_zone_id = var.hosted_zone_id
}

module "monitoring" {
  source      = "./modules/monitoring"
  environment = var.environment
  project     = var.project
  aws_region  = var.aws_region
  alert_email = var.alert_email
}

module "cdn" {
  source                     = "./modules/cdn"
  environment                = var.environment
  project                    = var.project
  spa_bucket                 = module.storage.spa_bucket_name
  spa_bucket_regional_domain = module.storage.spa_bucket_regional_domain
  domain                     = var.domain
  certificate_arn            = var.certificate_arn
  hosted_zone_id             = var.hosted_zone_id
}
