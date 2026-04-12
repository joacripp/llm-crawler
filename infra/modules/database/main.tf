resource "aws_db_subnet_group" "main" {
  name       = "${var.project}-${var.environment}"
  subnet_ids = var.private_subnet_ids
}

resource "aws_db_instance" "main" {
  identifier           = "${var.project}-${var.environment}"
  engine               = "postgres"
  engine_version       = "16.4"
  instance_class       = var.environment == "prod" ? "db.t3.medium" : "db.t3.micro"
  allocated_storage    = 20
  storage_encrypted    = true
  db_name              = "llmcrawler"
  username             = "llmcrawler"
  manage_master_user_password = true
  multi_az             = var.environment == "prod"
  db_subnet_group_name = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.db_security_group_id]
  skip_final_snapshot  = var.environment != "prod"
  final_snapshot_identifier = var.environment == "prod" ? "${var.project}-final" : null

  tags = { Name = "${var.project}-${var.environment}-db" }
}
