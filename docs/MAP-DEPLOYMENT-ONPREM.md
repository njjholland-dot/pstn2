# MAP Deployment On-Premises

**Version:** 1.0
**Date:** 2025-12-01
**Target Audience:** System Administrators, Infrastructure Engineers

## Overview

This guide describes deploying a MAP (Managed Access Provider) on your own infrastructure using open-source components. This approach provides **full control**, **data sovereignty**, and **lower operational costs at scale** compared to cloud deployment.

## When to Choose On-Premises

**✅ Good For:**
- Full Service MAPs with existing data centers
- Large-scale operations (>1M calls/day)
- Regulatory requirements (data residency)
- Organizations with strong in-house operations teams
- Cost-conscious deployments at scale

**❌ Not Ideal For:**
- Startups or small operations
- Limited technical staff
- Rapid time-to-market requirements
- Global multi-region deployments
- Variable/unpredictable load

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                     On-Premises Infrastructure                  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │              HAProxy Load Balancer (2x)                 │    │
│  │          Primary + Backup (VRRP/Keepalived)             │    │
│  └─────────────────────┬──────────────────────────────────┘    │
│                        │                                         │
│  ┌─────────────────────▼──────────────────────────────────┐    │
│  │          API Servers (3-10x Docker Containers)          │    │
│  │           nginx + Node.js/Python/Go                     │    │
│  └──────┬─────────────┬──────────────┬────────────────────┘    │
│         │             │              │                           │
│  ┌──────▼─────┐ ┌────▼──────┐ ┌────▼──────┐                   │
│  │   Redis    │ │PostgreSQL │ │   Redis   │                   │
│  │  Primary   │ │  Primary  │ │  Replica  │                   │
│  └──────┬─────┘ └────┬──────┘ └───────────┘                   │
│         │             │                                          │
│  ┌──────▼─────┐ ┌────▼──────┐                                  │
│  │   Redis    │ │PostgreSQL │                                  │
│  │  Replica   │ │  Replica  │                                  │
│  └────────────┘ └───────────┘                                  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │          Monitoring (Prometheus + Grafana)                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │      Logging (ELK Stack - Elasticsearch/Logstash/Kibana) │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │             Backup (Bacula/Restic to NAS/S3)             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└────────────────────────────────────────────────────────────────┘
```

## Hardware Requirements

### Small Deployment (1-50 Downstream CPs)

| Component | Specs | Quantity | Notes |
|-----------|-------|----------|-------|
| **Load Balancer** | 4 CPU, 8GB RAM, 100GB SSD | 2 | HAProxy, high availability |
| **API Servers** | 8 CPU, 16GB RAM, 200GB SSD | 3 | Docker containers |
| **Database (Primary)** | 16 CPU, 64GB RAM, 1TB NVMe SSD | 1 | PostgreSQL 15+ |
| **Database (Replica)** | 16 CPU, 64GB RAM, 1TB NVMe SSD | 1 | Read replica |
| **Redis Cache** | 8 CPU, 32GB RAM, 500GB SSD | 2 | Primary + replica |
| **Monitoring** | 4 CPU, 16GB RAM, 500GB SSD | 1 | Prometheus + Grafana |
| **Logging** | 8 CPU, 32GB RAM, 2TB SSD | 1 | ELK stack |
| **Total Servers** | - | **11** | - |

**Estimated Cost:** $5,000-$15,000 (hardware) + $500-$1,000/month (power, cooling, bandwidth)

### Medium Deployment (50-500 Downstream CPs)

| Component | Specs | Quantity | Notes |
|-----------|-------|----------|-------|
| **Load Balancer** | 8 CPU, 16GB RAM, 200GB SSD | 2 | HAProxy |
| **API Servers** | 16 CPU, 32GB RAM, 500GB SSD | 5-10 | Scale as needed |
| **Database (Primary)** | 32 CPU, 128GB RAM, 2TB NVMe SSD | 1 | PostgreSQL |
| **Database (Replicas)** | 32 CPU, 128GB RAM, 2TB NVMe SSD | 2 | Read replicas |
| **Redis Cache** | 16 CPU, 64GB RAM, 1TB SSD | 3 | 1 primary + 2 replicas |
| **Monitoring** | 8 CPU, 32GB RAM, 1TB SSD | 2 | HA Prometheus |
| **Logging** | 16 CPU, 64GB RAM, 5TB SSD | 2 | ELK cluster |
| **Total Servers** | - | **18-23** | - |

**Estimated Cost:** $20,000-$50,000 (hardware) + $2,000-$5,000/month (operations)

## Software Stack

### Core Components

| Component | Software | Version | Purpose |
|-----------|----------|---------|---------|
| **Operating System** | Ubuntu Server LTS | 24.04 | Base OS |
| **Load Balancer** | HAProxy | 2.8+ | Layer 7 load balancing |
| **High Availability** | Keepalived | 2.2+ | VRRP for failover |
| **Container Runtime** | Docker + Docker Compose | 24+ | Application containers |
| **Orchestration (Optional)** | Kubernetes (k3s) | 1.28+ | For larger deployments |
| **Database** | PostgreSQL | 15.4+ | Primary data store |
| **Replication** | PostgreSQL Streaming | Built-in | Database replication |
| **Cache** | Redis | 7.0+ | Session & directory cache |
| **Web Server** | nginx | 1.24+ | Reverse proxy, static files |
| **Monitoring** | Prometheus + Grafana | Latest | Metrics & dashboards |
| **Logging** | ELK Stack | 8.x | Log aggregation |
| **Backup** | Restic / Bacula | Latest | Automated backups |
| **TLS Certificates** | Let's Encrypt (certbot) | Latest | Free SSL/TLS |

## Deployment Steps

### Step 1: Prepare Servers

```bash
# On all servers (as root)

# Update system
apt update && apt upgrade -y

# Install essentials
apt install -y curl wget git vim htop net-tools

# Configure NTP for time synchronization
apt install -y chrony
systemctl enable chrony
systemctl start chrony

# Configure firewall (UFW)
ufw allow 22/tcp     # SSH
ufw allow 80/tcp     # HTTP
ufw allow 443/tcp    # HTTPS
ufw enable

# Disable swap (recommended for databases)
swapoff -a
sed -i '/swap/d' /etc/fstab

# Set up log rotation
cat > /etc/logrotate.d/map << EOF
/var/log/map/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
}
EOF
```

### Step 2: Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Add user to docker group
usermod -aG docker $USER

# Install Docker Compose
apt install -y docker-compose

# Enable Docker service
systemctl enable docker
systemctl start docker
```

### Step 3: Set Up PostgreSQL (Primary)

```bash
# Install PostgreSQL
apt install -y postgresql-15 postgresql-contrib-15

# Configure PostgreSQL
cat > /etc/postgresql/15/main/postgresql.conf << EOF
# Connection settings
listen_addresses = '*'
max_connections = 500

# Memory settings (adjust based on RAM)
shared_buffers = 16GB           # 25% of RAM
effective_cache_size = 48GB     # 75% of RAM
work_mem = 32MB
maintenance_work_mem = 2GB

# Write-ahead log settings
wal_level = replica
max_wal_senders = 5
wal_keep_size = 1GB
hot_standby = on

# Performance settings
random_page_cost = 1.1          # For SSD
effective_io_concurrency = 200  # For SSD
checkpoint_completion_target = 0.9
EOF

# Configure authentication
cat > /etc/postgresql/15/main/pg_hba.conf << EOF
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             postgres                                peer
host    all             all             10.0.0.0/8              scram-sha-256
host    replication     replicator      10.0.0.0/8              scram-sha-256
EOF

# Restart PostgreSQL
systemctl restart postgresql

# Create replication user
sudo -u postgres psql << EOF
CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD 'secure_replication_password';
EOF

# Create MAP database
sudo -u postgres createdb mapdb
sudo -u postgres createuser mapadmin
sudo -u postgres psql << EOF
ALTER USER mapadmin WITH ENCRYPTED PASSWORD 'secure_admin_password';
GRANT ALL PRIVILEGES ON DATABASE mapdb TO mapadmin;
EOF

# Initialize schema
sudo -u postgres psql -d mapdb -f /path/to/schema.sql
```

### Step 4: Set Up PostgreSQL (Replica)

```bash
# On replica server

# Stop PostgreSQL
systemctl stop postgresql

# Remove existing data directory
rm -rf /var/lib/postgresql/15/main/*

# Create base backup from primary
sudo -u postgres pg_basebackup -h <primary-ip> -D /var/lib/postgresql/15/main -U replicator -P -v -R -X stream -C -S replica1

# Start PostgreSQL replica
systemctl start postgresql

# Verify replication
sudo -u postgres psql -c "SELECT * FROM pg_stat_replication;"
```

### Step 5: Set Up Redis Cluster

```bash
# On primary Redis server

# Install Redis
apt install -y redis-server

# Configure Redis
cat > /etc/redis/redis.conf << EOF
# Network
bind 0.0.0.0
port 6379
protected-mode yes
requirepass secure_redis_password

# Memory
maxmemory 24gb
maxmemory-policy allkeys-lru

# Persistence
save 900 1
save 300 10
save 60 10000
appendonly yes

# Replication (auth used by replicas connecting to this primary)
masterauth secure_redis_password
EOF

# Restart Redis
systemctl restart redis

# On replica Redis servers
cat >> /etc/redis/redis.conf << EOF
replicaof <primary-redis-ip> 6379
EOF

systemctl restart redis
```

### Step 6: Set Up Load Balancers (HAProxy)

```bash
# On both load balancer servers

# Install HAProxy and Keepalived
apt install -y haproxy keepalived

# Configure HAProxy
cat > /etc/haproxy/haproxy.cfg << EOF
global
    log /dev/log local0
    log /dev/log local1 notice
    chroot /var/lib/haproxy
    stats socket /run/haproxy/admin.sock mode 660 level admin
    stats timeout 30s
    user haproxy
    group haproxy
    daemon

    # SSL/TLS settings
    ssl-default-bind-ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256
    ssl-default-bind-options ssl-min-ver TLSv1.3 no-tls-tickets

defaults
    log     global
    mode    http
    option  httplog
    option  dontlognull
    timeout connect 5000
    timeout client  50000
    timeout server  50000

# Stats page
listen stats
    bind *:8404
    mode http
    stats enable
    stats uri /stats
    stats refresh 30s
    stats auth admin:secure_stats_password

# Frontend (HTTPS)
frontend https_front
    bind *:443 ssl crt /etc/ssl/certs/map-certificate.pem
    bind *:80
    redirect scheme https code 301 if !{ ssl_fc }

    # Rate limiting
    stick-table type ip size 100k expire 30s store http_req_rate(10s)
    http-request track-sc0 src
    http-request deny deny_status 429 if { sc_http_req_rate(0) gt 100 }

    # Security headers
    http-response set-header Strict-Transport-Security "max-age=31536000; includeSubDomains"
    http-response set-header X-Frame-Options "DENY"
    http-response set-header X-Content-Type-Options "nosniff"

    default_backend api_servers

# Backend (API Servers)
backend api_servers
    balance roundrobin
    option httpchk GET /health
    http-check expect status 200

    server api1 10.0.1.10:3000 check inter 5s rise 2 fall 3
    server api2 10.0.1.11:3000 check inter 5s rise 2 fall 3
    server api3 10.0.1.12:3000 check inter 5s rise 2 fall 3
EOF

# Configure Keepalived (Primary)
cat > /etc/keepalived/keepalived.conf << EOF
vrrp_script chk_haproxy {
    script "killall -0 haproxy"
    interval 2
    weight 2
}

vrrp_instance VI_1 {
    interface eth0
    state MASTER
    virtual_router_id 51
    priority 101  # Higher on primary
    advert_int 1

    authentication {
        auth_type PASS
        auth_pass secure_vrrp_password
    }

    virtual_ipaddress {
        10.0.0.100/24  # Virtual IP
    }

    track_script {
        chk_haproxy
    }
}
EOF

# On backup load balancer, set priority to 100 instead of 101

# Start services
systemctl enable haproxy keepalived
systemctl restart haproxy keepalived
```

### Step 7: Deploy API Servers

```bash
# On each API server

# Create docker-compose.yml
cat > /opt/map/docker-compose.yml << EOF
version: '3.8'

services:
  api:
    image: map-api-server:latest
    container_name: map-api
    restart: always
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DB_HOST=10.0.2.10
      - DB_PORT=5432
      - DB_NAME=mapdb
      - DB_USER=mapadmin
      - DB_PASSWORD=secure_admin_password
      - REDIS_HOST=10.0.3.10
      - REDIS_PORT=6379
      - REDIS_PASSWORD=secure_redis_password
      - MASTER_KEY_FILE=/secrets/master-key.txt
    volumes:
      - /opt/map/secrets:/secrets:ro
      - /var/log/map:/var/log/map
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "10"

  nginx:
    image: nginx:latest
    container_name: map-nginx
    restart: always
    ports:
      - "80:80"
    volumes:
      - /opt/map/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - api

networks:
  default:
    driver: bridge
EOF

# Create nginx config
cat > /opt/map/nginx.conf << EOF
worker_processes auto;

events {
    worker_connections 4096;
}

http {
    upstream api_backend {
        server api:3000;
    }

    server {
        listen 80;

        location /health {
            proxy_pass http://api_backend/health;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
        }

        location / {
            proxy_pass http://api_backend;
            proxy_http_version 1.1;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;

            # Timeouts
            proxy_connect_timeout 5s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }
    }
}
EOF

# Start services
cd /opt/map
docker-compose up -d
```

### Step 8: Set Up Monitoring (Prometheus + Grafana)

```bash
# Create monitoring stack
cat > /opt/monitoring/docker-compose.yml << EOF
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    restart: always
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=30d'

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    restart: always
    ports:
      - "3001:3000"
    volumes:
      - grafana_data:/var/lib/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=secure_grafana_password

  node_exporter:
    image: prom/node-exporter:latest
    container_name: node_exporter
    restart: always
    ports:
      - "9100:9100"

  postgres_exporter:
    image: prometheuscommunity/postgres-exporter:latest
    container_name: postgres_exporter
    restart: always
    ports:
      - "9187:9187"
    environment:
      - DATA_SOURCE_NAME=postgresql://mapadmin:secure_admin_password@10.0.2.10:5432/mapdb?sslmode=disable

volumes:
  prometheus_data:
  grafana_data:
EOF

# Create Prometheus config
cat > /opt/monitoring/prometheus.yml << EOF
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'node'
    static_configs:
      - targets:
        - '10.0.1.10:9100'  # API server 1
        - '10.0.1.11:9100'  # API server 2
        - '10.0.1.12:9100'  # API server 3

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres_exporter:9187']

  - job_name: 'redis'
    static_configs:
      - targets: ['10.0.3.10:9121']  # Redis exporter
EOF

# Start monitoring
cd /opt/monitoring
docker-compose up -d
```

### Step 9: Configure SSL/TLS Certificates

```bash
# Install certbot
apt install -y certbot

# Obtain certificate (use DNS or HTTP challenge)
certbot certonly --standalone -d api.map.example.com --email ops@example.com --agree-tos

# Create combined PEM file for HAProxy
cat /etc/letsencrypt/live/api.map.example.com/fullchain.pem \
    /etc/letsencrypt/live/api.map.example.com/privkey.pem \
    > /etc/ssl/certs/map-certificate.pem

# Set up auto-renewal
cat > /etc/cron.daily/certbot-renew << EOF
#!/bin/bash
certbot renew --quiet --post-hook "cat /etc/letsencrypt/live/api.map.example.com/fullchain.pem /etc/letsencrypt/live/api.map.example.com/privkey.pem > /etc/ssl/certs/map-certificate.pem && systemctl reload haproxy"
EOF

chmod +x /etc/cron.daily/certbot-renew
```

### Step 10: Set Up Automated Backups

```bash
# Install Restic
apt install -y restic

# Initialize backup repository (to NAS or S3)
export RESTIC_REPOSITORY=/mnt/backup/map-backups
export RESTIC_PASSWORD=secure_backup_password
restic init

# Create backup script
cat > /usr/local/bin/map-backup.sh << 'EOF'
#!/bin/bash

export RESTIC_REPOSITORY=/mnt/backup/map-backups
export RESTIC_PASSWORD=secure_backup_password

# Backup PostgreSQL
sudo -u postgres pg_dump mapdb | gzip > /tmp/mapdb-$(date +%Y%m%d).sql.gz

# Backup with Restic
restic backup /tmp/mapdb-*.sql.gz \
              /opt/map/secrets \
              /etc/haproxy \
              /etc/postgresql

# Cleanup old backups (keep last 30 days)
restic forget --keep-daily 30 --prune

# Remove temp SQL dump
rm /tmp/mapdb-*.sql.gz
EOF

chmod +x /usr/local/bin/map-backup.sh

# Schedule daily backup at 3 AM
cat > /etc/cron.d/map-backup << EOF
0 3 * * * root /usr/local/bin/map-backup.sh >> /var/log/map-backup.log 2>&1
EOF
```

## Performance Tuning

### PostgreSQL

```sql
-- Create indexes for multi-tenant queries
CREATE INDEX CONCURRENTLY idx_call_records_cp_timestamp
    ON call_records(cp_id, timestamp DESC);
CREATE INDEX CONCURRENTLY idx_auth_logs_cp_timestamp
    ON auth_logs(cp_id, timestamp DESC);
CREATE INDEX CONCURRENTLY idx_cp_numbers_cp_id
    ON cp_numbers(cp_id);

-- Enable parallel queries
ALTER DATABASE mapdb SET max_parallel_workers_per_gather = 4;
ALTER DATABASE mapdb SET max_parallel_workers = 8;

-- Connection pooling with PgBouncer
apt install -y pgbouncer
```

### Redis

```bash
# Kernel optimization for Redis
cat >> /etc/sysctl.conf << EOF
vm.overcommit_memory = 1
net.core.somaxconn = 65535
EOF

sysctl -p
```

### OS-Level Tuning

```bash
# Increase file descriptor limits
cat >> /etc/security/limits.conf << EOF
*  soft  nofile  65536
*  hard  nofile  65536
EOF

# TCP tuning
cat >> /etc/sysctl.conf << EOF
net.ipv4.tcp_fin_timeout = 30
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_max_syn_backlog = 8096
net.core.netdev_max_backlog = 5000
EOF

sysctl -p
```

## Disaster Recovery

### Failover Procedures

**Database Failover:**
```bash
# Promote replica to primary
sudo -u postgres /usr/lib/postgresql/15/bin/pg_ctl promote -D /var/lib/postgresql/15/main

# Update application config to point to new primary
```

**Redis Failover:**
```bash
# On replica, remove replication config
redis-cli CONFIG SET replicaof no one
```

### Backup Restoration

```bash
# List available backups
restic -r /mnt/backup/map-backups snapshots

# Restore database
restic -r /mnt/backup/map-backups restore latest --target /tmp/restore

# Load into PostgreSQL
gunzip /tmp/restore/mapdb-*.sql.gz
sudo -u postgres psql mapdb < /tmp/restore/mapdb-*.sql
```

## Comparison: On-Premises vs AWS

| Aspect | On-Premises | AWS |
|--------|-------------|-----|
| **Capital Cost** | High ($20K-$50K) | Low (pay-as-you-go) |
| **Monthly Cost** | Low ($2K-$5K) | Medium ($500-$2.5K) |
| **Break-Even** | ~12-18 months | N/A |
| **Time to Deploy** | 1-2 weeks | 2-4 hours |
| **Scalability** | Manual (buy hardware) | Automatic |
| **Maintenance** | Your team | AWS managed |
| **Data Sovereignty** | Complete control | AWS regions |
| **Customization** | Full control | Limited |
| **High Availability** | Your responsibility | Built-in |

**Recommendation:**
- **< 50 CPs:** Use AWS (faster, easier)
- **50-200 CPs:** Either (depends on expertise)
- **> 200 CPs:** Consider on-prem (cost savings)

## Conclusion

On-premises deployment provides:
- ✅ Full control over infrastructure
- ✅ Lower costs at scale (after break-even)
- ✅ Data sovereignty and compliance
- ✅ Custom hardware optimization
- ✅ No cloud vendor lock-in

**Deployment Time:** 1-2 weeks
**Break-Even Point:** 12-18 months vs AWS
**Best For:** Established carriers with operations teams

---

**Next Steps:**
1. Order hardware
2. Set up network infrastructure
3. Install base OS and software
4. Deploy and test each component
5. Load test before production
6. Onboard first downstream CP

**Support:** nick.holland@8x8.com
