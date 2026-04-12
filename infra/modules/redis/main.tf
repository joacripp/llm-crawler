resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project}-${var.environment}"
  subnet_ids = var.private_subnet_ids
}

resource "aws_elasticache_cluster" "main" {
  cluster_id           = "${var.project}-${var.environment}"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.environment == "prod" ? "cache.t3.small" : "cache.t3.micro"
  num_cache_nodes      = 1
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [var.redis_security_group_id]

  tags = { Name = "${var.project}-${var.environment}-redis" }
}
