# MAP Deployment on AWS

**Version:** 1.0
**Date:** 2025-12-01
**Target Audience:** DevOps Engineers, Cloud Architects

## Overview

This guide provides step-by-step instructions for deploying a MAP (Managed Access Provider) on Amazon Web Services (AWS). The architecture leverages managed AWS services to minimize operational overhead while providing scalability, reliability, and security.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         AWS Cloud                                │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Route 53 (DNS)                         │   │
│  │                  api.map.example.com                      │   │
│  └─────────────────────┬────────────────────────────────────┘   │
│                        │                                          │
│  ┌─────────────────────▼────────────────────────────────────┐   │
│  │             CloudFront (CDN) + WAF                        │   │
│  │              TLS Termination                              │   │
│  └─────────────────────┬────────────────────────────────────┘   │
│                        │                                          │
│  ┌─────────────────────▼────────────────────────────────────┐   │
│  │                API Gateway (REST API)                     │   │
│  │        Authentication, Rate Limiting, Logging             │   │
│  └─────────────────────┬────────────────────────────────────┘   │
│                        │                                          │
│  ┌─────────────────────▼────────────────────────────────────┐   │
│  │                Application Load Balancer                  │   │
│  └─────┬────────────────┬────────────────┬───────────────────┘   │
│        │                │                │                        │
│  ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐                 │
│  │    ECS    │   │    ECS    │   │    ECS    │                 │
│  │ Container │   │ Container │   │ Container │                 │
│  │ (API Srv) │   │ (API Srv) │   │ (API Srv) │                 │
│  └─────┬─────┘   └─────┬─────┘   └─────┬─────┘                 │
│        │                │                │                        │
│        └────────────────┴────────────────┘                        │
│                        │                                          │
│  ┌─────────────────────▼────────────────────────────────────┐   │
│  │              ElastiCache (Redis Cluster)                  │   │
│  │               Directory Cache, Sessions                   │   │
│  └───────────────────────────────────────────────────────────┘   │
│                        │                                          │
│  ┌─────────────────────▼────────────────────────────────────┐   │
│  │             RDS PostgreSQL (Multi-AZ)                     │   │
│  │            Primary + Read Replicas                        │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │          AWS Secrets Manager (API Keys, DB Creds)         │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │              KMS (Key Management Service)                 │   │
│  │            Master Key for Private Key Encryption          │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │            CloudWatch (Logs, Metrics, Alarms)             │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │                 S3 (Backups, Archives)                    │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

## AWS Services Used

| Service | Purpose | Pricing Estimate (Month) |
|---------|---------|--------------------------|
| **ECS Fargate** | Container hosting for API servers | $150-$500 (3-10 containers) |
| **RDS PostgreSQL** | Primary database (Multi-AZ) | $200-$800 (db.t3.medium to db.r5.large) |
| **ElastiCache Redis** | Caching layer | $50-$200 (cache.t3.small to cache.r5.large) |
| **API Gateway** | REST API management | $3.50 per million requests + $0.09/GB |
| **CloudFront** | CDN & TLS termination | $0.085/GB + $0.01 per 10K requests |
| **Route 53** | DNS hosting | $0.50/hosted zone + $0.40/million queries |
| **KMS** | Encryption key management | $1/key/month + $0.03 per 10K requests |
| **Secrets Manager** | Credentials storage | $0.40 per secret/month + $0.05 per 10K requests |
| **CloudWatch** | Monitoring & logging | $0.50/GB ingested + $0.03/GB stored |
| **S3** | Backup storage | $0.023/GB/month (Standard) |
| **WAF** | Web application firewall | $5/month + $1 per rule |

**Total Estimated Cost:** $500-$2,500/month (depending on scale)

## Prerequisites

1. **AWS Account** with administrative access
2. **AWS CLI** installed and configured
3. **Terraform** (v1.5+) or **CloudFormation** familiarity
4. **Docker** for building container images
5. **Domain name** for API endpoint (e.g., api.map.example.com)

## Deployment Steps

### Step 1: Set Up VPC and Networking

```hcl
# terraform/networking.tf

resource "aws_vpc" "map_vpc" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "MAP-VPC"
  }
}

# Public subnets (for ALB)
resource "aws_subnet" "public" {
  count             = 3
  vpc_id            = aws_vpc.map_vpc.id
  cidr_block        = "10.0.${count.index}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name = "MAP-Public-${count.index + 1}"
  }
}

# Private subnets (for ECS, RDS, ElastiCache)
resource "aws_subnet" "private" {
  count             = 3
  vpc_id            = aws_vpc.map_vpc.id
  cidr_block        = "10.0.${count.index + 10}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name = "MAP-Private-${count.index + 1}"
  }
}

# Internet Gateway
resource "aws_internet_gateway" "map_igw" {
  vpc_id = aws_vpc.map_vpc.id

  tags = {
    Name = "MAP-IGW"
  }
}

# NAT Gateways (one per AZ for high availability)
resource "aws_eip" "nat" {
  count  = 3
  domain = "vpc"
}

resource "aws_nat_gateway" "map_nat" {
  count         = 3
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = {
    Name = "MAP-NAT-${count.index + 1}"
  }
}

# Route tables
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.map_vpc.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.map_igw.id
  }

  tags = {
    Name = "MAP-Public-RT"
  }
}

resource "aws_route_table" "private" {
  count  = 3
  vpc_id = aws_vpc.map_vpc.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.map_nat[count.index].id
  }

  tags = {
    Name = "MAP-Private-RT-${count.index + 1}"
  }
}
```

**Apply:**
```bash
cd terraform
terraform init
terraform plan
terraform apply
```

### Step 2: Create RDS PostgreSQL Database

```hcl
# terraform/rds.tf

resource "aws_db_subnet_group" "map_db" {
  name       = "map-db-subnet-group"
  subnet_ids = aws_subnet.private[*].id

  tags = {
    Name = "MAP DB Subnet Group"
  }
}

resource "aws_security_group" "rds" {
  name_prefix = "map-rds-sg"
  vpc_id      = aws_vpc.map_vpc.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "random_password" "db_password" {
  length  = 32
  special = true
}

resource "aws_secretsmanager_secret" "db_password" {
  name = "map-db-password"
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db_password.result
}

resource "aws_db_instance" "map_db" {
  identifier             = "map-postgresql"
  engine                 = "postgres"
  engine_version         = "15.4"
  instance_class         = "db.t3.medium"  # Adjust based on load
  allocated_storage      = 100
  storage_type           = "gp3"
  storage_encrypted      = true

  db_name  = "mapdb"
  username = "mapadmin"
  password = random_password.db_password.result

  multi_az               = true  # High availability
  db_subnet_group_name   = aws_db_subnet_group.map_db.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  backup_retention_period = 30
  backup_window           = "03:00-04:00"  # UTC
  maintenance_window      = "sun:04:00-sun:05:00"

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  deletion_protection = true  # Prevent accidental deletion
  skip_final_snapshot = false
  final_snapshot_identifier = "map-db-final-snapshot"

  tags = {
    Name = "MAP PostgreSQL"
  }
}

# Read replicas for scaling read operations
resource "aws_db_instance" "map_db_replica" {
  count               = 2  # 2 read replicas
  identifier          = "map-postgresql-replica-${count.index + 1}"
  replicate_source_db = aws_db_instance.map_db.identifier
  instance_class      = "db.t3.medium"
  publicly_accessible = false

  tags = {
    Name = "MAP PostgreSQL Replica ${count.index + 1}"
  }
}
```

**Initialize Database Schema:**
```bash
# Connect to database
export DB_HOST=$(terraform output -raw db_host)
export DB_PASSWORD=$(aws secretsmanager get-secret-value --secret-id map-db-password --query SecretString --output text)

psql -h $DB_HOST -U mapadmin -d mapdb -f ../sql/schema.sql
psql -h $DB_HOST -U mapadmin -d mapdb -f ../sql/seed.sql
```

### Step 3: Create ElastiCache Redis Cluster

```hcl
# terraform/elasticache.tf

resource "aws_elasticache_subnet_group" "map_cache" {
  name       = "map-cache-subnet-group"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_security_group" "elasticache" {
  name_prefix = "map-elasticache-sg"
  vpc_id      = aws_vpc.map_vpc.id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_elasticache_replication_group" "map_redis" {
  replication_group_id       = "map-redis-cluster"
  replication_group_description = "Redis cluster for MAP caching"

  engine               = "redis"
  engine_version       = "7.0"
  node_type            = "cache.t3.small"  # Adjust based on load
  num_cache_clusters   = 3  # 1 primary + 2 replicas

  port                       = 6379
  parameter_group_name       = "default.redis7"
  subnet_group_name          = aws_elasticache_subnet_group.map_cache.name
  security_group_ids         = [aws_security_group.elasticache.id]

  automatic_failover_enabled = true
  multi_az_enabled           = true

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token_enabled         = true

  snapshot_retention_limit   = 5
  snapshot_window            = "03:00-05:00"

  tags = {
    Name = "MAP Redis Cluster"
  }
}
```

### Step 4: Create KMS Key for Encryption

```hcl
# terraform/kms.tf

resource "aws_kms_key" "map_master_key" {
  description             = "MAP master encryption key for CP private keys"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name = "MAP Master Key"
  }
}

resource "aws_kms_alias" "map_master_key" {
  name          = "alias/map-master-key"
  target_key_id = aws_kms_key.map_master_key.key_id
}

# Store master key ID in Secrets Manager for application use
resource "aws_secretsmanager_secret" "master_key_id" {
  name = "map-master-key-id"
}

resource "aws_secretsmanager_secret_version" "master_key_id" {
  secret_id     = aws_secretsmanager_secret.master_key_id.id
  secret_string = aws_kms_key.map_master_key.key_id
}
```

### Step 5: Build and Push Docker Image

```dockerfile
# Dockerfile

FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 3000

USER node

CMD ["node", "dist/server.js"]
```

**Build and Push:**
```bash
# Create ECR repository
aws ecr create-repository --repository-name map-api-server

# Get ECR login
aws ecr get-login-password --region eu-west-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.eu-west-1.amazonaws.com

# Build image
docker build -t map-api-server:latest .

# Tag for ECR
docker tag map-api-server:latest <account-id>.dkr.ecr.eu-west-1.amazonaws.com/map-api-server:latest

# Push to ECR
docker push <account-id>.dkr.ecr.eu-west-1.amazonaws.com/map-api-server:latest
```

### Step 6: Deploy ECS Fargate Service

```hcl
# terraform/ecs.tf

resource "aws_ecs_cluster" "map_cluster" {
  name = "map-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "MAP ECS Cluster"
  }
}

resource "aws_ecs_task_definition" "map_api" {
  family                   = "map-api-server"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"   # 0.5 vCPU
  memory                   = "1024"  # 1 GB
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "map-api-server"
      image     = "${aws_ecr_repository.map_api.repository_url}:latest"
      essential = true

      portMappings = [
        {
          containerPort = 3000
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "NODE_ENV"
          value = "production"
        },
        {
          name  = "PORT"
          value = "3000"
        },
        {
          name  = "DB_HOST"
          value = aws_db_instance.map_db.address
        },
        {
          name  = "REDIS_HOST"
          value = aws_elasticache_replication_group.map_redis.primary_endpoint_address
        }
      ]

      secrets = [
        {
          name      = "DB_PASSWORD"
          valueFrom = aws_secretsmanager_secret.db_password.arn
        },
        {
          name      = "MASTER_KEY_ID"
          valueFrom = aws_secretsmanager_secret.master_key_id.arn
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = "/ecs/map-api-server"
          "awslogs-region"        = "eu-west-1"
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "map_api" {
  name            = "map-api-service"
  cluster         = aws_ecs_cluster.map_cluster.id
  task_definition = aws_ecs_task_definition.map_api.arn
  desired_count   = 3  # Start with 3 tasks
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.map_api.arn
    container_name   = "map-api-server"
    container_port   = 3000
  }

  # Auto-scaling configuration
  lifecycle {
    ignore_changes = [desired_count]  # Allow auto-scaling to manage count
  }

  depends_on = [aws_lb_listener.map_api]
}

# Auto-scaling
resource "aws_appautoscaling_target" "ecs_target" {
  max_capacity       = 20
  min_capacity       = 3
  resource_id        = "service/${aws_ecs_cluster.map_cluster.name}/${aws_ecs_service.map_api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "ecs_cpu_policy" {
  name               = "map-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_target.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 70.0
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
```

### Step 7: Configure Application Load Balancer

```hcl
# terraform/alb.tf

resource "aws_security_group" "alb" {
  name_prefix = "map-alb-sg"
  vpc_id      = aws_vpc.map_vpc.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_lb" "map_alb" {
  name               = "map-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  enable_deletion_protection = true
  enable_http2               = true

  tags = {
    Name = "MAP ALB"
  }
}

resource "aws_lb_target_group" "map_api" {
  name        = "map-api-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.map_vpc.id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    path                = "/health"
    matcher             = "200"
  }

  deregistration_delay = 30

  tags = {
    Name = "MAP API Target Group"
  }
}

resource "aws_lb_listener" "map_api" {
  load_balancer_arn = aws_lb.map_alb.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.map_cert.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.map_api.arn
  }
}
```

### Step 8: Configure Route 53 and SSL Certificate

```hcl
# terraform/dns.tf

resource "aws_route53_zone" "map_domain" {
  name = "map.example.com"

  tags = {
    Name = "MAP Domain"
  }
}

resource "aws_acm_certificate" "map_cert" {
  domain_name       = "api.map.example.com"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "MAP API Certificate"
  }
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.map_cert.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = aws_route53_zone.map_domain.zone_id
}

resource "aws_acm_certificate_validation" "map_cert" {
  certificate_arn         = aws_acm_certificate.map_cert.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

resource "aws_route53_record" "api" {
  zone_id = aws_route53_zone.map_domain.zone_id
  name    = "api.map.example.com"
  type    = "A"

  alias {
    name                   = aws_lb.map_alb.dns_name
    zone_id                = aws_lb.map_alb.zone_id
    evaluate_target_health = true
  }
}
```

### Step 9: Configure CloudWatch Monitoring

```hcl
# terraform/cloudwatch.tf

resource "aws_cloudwatch_log_group" "ecs_logs" {
  name              = "/ecs/map-api-server"
  retention_in_days = 30

  tags = {
    Name = "MAP ECS Logs"
  }
}

# Alarm: High error rate
resource "aws_cloudwatch_metric_alarm" "high_error_rate" {
  alarm_name          = "map-high-error-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "5XXError"
  namespace           = "AWS/ApplicationELB"
  period              = "300"
  statistic           = "Sum"
  threshold           = "10"
  alarm_description   = "This metric monitors API 5xx errors"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    LoadBalancer = aws_lb.map_alb.arn_suffix
  }
}

# Alarm: High response time
resource "aws_cloudwatch_metric_alarm" "high_response_time" {
  alarm_name          = "map-high-response-time"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = "300"
  statistic           = "Average"
  threshold           = "1.0"  # 1 second
  alarm_description   = "API response time is too high"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    LoadBalancer = aws_lb.map_alb.arn_suffix
  }
}

# Alarm: Database CPU high
resource "aws_cloudwatch_metric_alarm" "db_cpu_high" {
  alarm_name          = "map-db-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "Database CPU utilization is high"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.map_db.id
  }
}

# SNS topic for alerts
resource "aws_sns_topic" "alerts" {
  name = "map-alerts"

  tags = {
    Name = "MAP Alerts"
  }
}

resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = "ops@example.com"  # Change to your ops email
}
```

### Step 10: Configure WAF (Web Application Firewall)

```hcl
# terraform/waf.tf

resource "aws_wafv2_web_acl" "map_waf" {
  name  = "map-waf"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  # Rule 1: Rate limiting (1000 requests per 5 minutes per IP)
  rule {
    name     = "rate-limit-rule"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 1000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimitRule"
      sampled_requests_enabled   = true
    }
  }

  # Rule 2: AWS managed rule for common threats
  rule {
    name     = "aws-managed-rules"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedRules"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "MAPWAF"
    sampled_requests_enabled   = true
  }

  tags = {
    Name = "MAP WAF"
  }
}

resource "aws_wafv2_web_acl_association" "alb" {
  resource_arn = aws_lb.map_alb.arn
  web_acl_arn  = aws_wafv2_web_acl.map_waf.arn
}
```

## Cost Optimization

### 1. Right-Sizing

**Monitor and adjust:**
- ECS task CPU/memory based on actual usage
- RDS instance class (start with t3.medium, upgrade if needed)
- ElastiCache node type (start with t3.small)

**Use Reserved Instances:**
- RDS Reserved Instances (1-3 year commitment) save 30-60%
- Savings Plans for ECS Fargate save up to 50%

### 2. Storage Optimization

```hcl
# S3 lifecycle policy for log archival
resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    id     = "archive-old-logs"
    status = "Enabled"

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 2555  # 7 years for compliance
    }
  }
}
```

### 3. Auto-Scaling

- Use auto-scaling for ECS tasks (saves $$ during low traffic)
- Enable RDS auto-scaling for storage
- Use ElastiCache with multiple read replicas only if needed

## Security Best Practices

### 1. IAM Roles and Policies

```hcl
# terraform/iam.tf

# ECS Task Execution Role (for pulling images, writing logs)
resource "aws_iam_role" "ecs_execution_role" {
  name = "map-ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution_role_policy" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# ECS Task Role (for application to access AWS services)
resource "aws_iam_role" "ecs_task_role" {
  name = "map-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

# Policy: Allow access to Secrets Manager
resource "aws_iam_role_policy" "secrets_access" {
  name = "secrets-access"
  role = aws_iam_role.ecs_task_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          aws_secretsmanager_secret.db_password.arn,
          aws_secretsmanager_secret.master_key_id.arn
        ]
      }
    ]
  })
}

# Policy: Allow KMS decrypt
resource "aws_iam_role_policy" "kms_access" {
  name = "kms-access"
  role = aws_iam_role.ecs_task_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey"
        ]
        Resource = aws_kms_key.map_master_key.arn
      }
    ]
  })
}
```

### 2. Network Security

- All services in private subnets (except ALB)
- Security groups with least privilege
- NACLs for additional layer of security
- VPC Flow Logs for network monitoring

### 3. Data Encryption

- RDS encryption at rest (enabled)
- ElastiCache encryption in transit and at rest
- S3 encryption for backups
- KMS for private key encryption
- TLS 1.3 for all communications

## Disaster Recovery

### Backup Strategy

```hcl
# RDS automated backups (already configured above)
# - Retention: 30 days
# - Backup window: 03:00-04:00 UTC
# - Multi-AZ for failover

# Manual snapshot before major changes
resource "null_resource" "manual_snapshot" {
  triggers = {
    version = "1.0.0"  # Update this to trigger new snapshot
  }

  provisioner "local-exec" {
    command = <<EOF
aws rds create-db-snapshot \
  --db-instance-identifier ${aws_db_instance.map_db.id} \
  --db-snapshot-identifier map-db-manual-${timestamp()}
EOF
  }
}
```

### Multi-Region Failover

**For Production:**
1. Replicate RDS to secondary region (cross-region replica)
2. Replicate ElastiCache with Global Datastore
3. Deploy ECS tasks in secondary region (standby)
4. Use Route 53 health checks for automatic failover

**RTO:** 5 minutes (automated failover)
**RPO:** 5 minutes (replication lag)

## Deployment Workflow

### CI/CD Pipeline (GitHub Actions Example)

```yaml
# .github/workflows/deploy.yml

name: Deploy to AWS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: eu-west-1

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v1

      - name: Build and push Docker image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          ECR_REPOSITORY: map-api-server
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker tag $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG $ECR_REGISTRY/$ECR_REPOSITORY:latest
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest

      - name: Update ECS service
        run: |
          aws ecs update-service \
            --cluster map-cluster \
            --service map-api-service \
            --force-new-deployment

      - name: Wait for deployment
        run: |
          aws ecs wait services-stable \
            --cluster map-cluster \
            --services map-api-service
```

## Testing

### Load Testing (using k6)

```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp up to 100 users
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 200 },  // Ramp up to 200 users
    { duration: '5m', target: 200 },  // Stay at 200 users
    { duration: '2m', target: 0 },    // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% of requests must complete below 500ms
    http_req_failed: ['rate<0.01'],    // Less than 1% errors
  },
};

export default function () {
  const url = 'https://api.map.example.com/api/v1/auth/verify';
  const payload = JSON.stringify({
    caller_id: '+441234567890',
    called_id: '+447700900123',
    call_reference: `call-${__VU}-${__ITER}`,
    originating_cp: 'CP3-UK-0007',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_API_KEY',
    },
  };

  const res = http.post(url, payload, params);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
    'verified field exists': (r) => JSON.parse(r.body).hasOwnProperty('verified'),
  });

  sleep(1);
}
```

**Run load test:**
```bash
k6 run load-test.js
```

## Monitoring Dashboard

**CloudWatch Dashboard:**
```hcl
resource "aws_cloudwatch_dashboard" "map_dashboard" {
  dashboard_name = "MAP-Operations-Dashboard"

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/ECS", "CPUUtilization", { stat = "Average", label = "ECS CPU" }],
            ["AWS/ECS", "MemoryUtilization", { stat = "Average", label = "ECS Memory" }]
          ]
          period = 300
          stat   = "Average"
          region = "eu-west-1"
          title  = "ECS Utilization"
        }
      },
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/RDS", "CPUUtilization", { stat = "Average", label = "RDS CPU" }],
            ["AWS/RDS", "DatabaseConnections", { stat = "Sum", label = "Connections" }]
          ]
          period = 300
          stat   = "Average"
          region = "eu-west-1"
          title  = "RDS Performance"
        }
      },
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", { stat = "Average", label = "Response Time" }],
            ["AWS/ApplicationELB", "RequestCount", { stat = "Sum", label = "Requests" }]
          ]
          period = 300
          region = "eu-west-1"
          title  = "API Performance"
        }
      }
    ]
  })
}
```

## Maintenance

### Weekly Tasks
- Review CloudWatch alarms and logs
- Check for security updates
- Review cost reports

### Monthly Tasks
- Review and optimize auto-scaling thresholds
- Analyze slow query logs (RDS)
- Update dependencies and Docker images
- Review IAM policies and access logs
- Backup validation (test restore)

### Quarterly Tasks
- Disaster recovery drill (failover to secondary region)
- Security audit and penetration testing
- Cost optimization review
- Capacity planning review

## Troubleshooting

### Common Issues

**Issue 1: High Database CPU**
```bash
# Check slow queries
aws rds describe-db-log-files --db-instance-identifier map-postgresql

# Download slow query log
aws rds download-db-log-file-portion \
  --db-instance-identifier map-postgresql \
  --log-file-name slowquery/postgres.log \
  --output text
```

**Solution:** Add indexes, optimize queries, or upgrade instance class

**Issue 2: ECS Tasks Failing Health Checks**
```bash
# Check ECS task logs
aws logs tail /ecs/map-api-server --follow

# Check target group health
aws elbv2 describe-target-health \
  --target-group-arn <target-group-arn>
```

**Solution:** Check application logs for errors, verify security group rules

**Issue 3: High Response Times**
```bash
# Check ALB metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApplicationELB \
  --metric-name TargetResponseTime \
  --dimensions Name=LoadBalancer,Value=<alb-arn-suffix> \
  --start-time 2025-12-01T00:00:00Z \
  --end-time 2025-12-01T23:59:59Z \
  --period 300 \
  --statistics Average
```

**Solution:** Scale up ECS tasks, optimize database queries, increase Redis cache TTL

## Conclusion

This AWS deployment provides:
- ✅ Fully managed, highly available infrastructure
- ✅ Auto-scaling for variable load
- ✅ Comprehensive monitoring and alerting
- ✅ Disaster recovery with multi-AZ and backups
- ✅ Security best practices (encryption, IAM, WAF)
- ✅ Cost-optimized architecture

**Total Deployment Time:** 2-4 hours (automated with Terraform)

**Estimated Monthly Cost:** $500-$2,500 (depending on scale)

---

**Next Steps:**
1. Clone Terraform repository
2. Update variables.tf with your settings
3. Run `terraform apply`
4. Deploy Docker image
5. Test API endpoints
6. Onboard first downstream CP

**Support:** For questions, contact nick.holland@8x8.com
