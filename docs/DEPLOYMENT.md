# Deployment Guide

## Table of Contents
- [Prerequisites](#prerequisites)
- [Deployment Options](#deployment-options)
- [Docker Deployment](#docker-deployment)
- [AWS Deployment](#aws-deployment)
- [Traditional VPS Deployment](#traditional-vps-deployment)
- [Environment Configuration](#environment-configuration)
- [SSL/TLS Setup](#ssltls-setup)
- [Monitoring & Logging](#monitoring--logging)
- [Scaling](#scaling)
- [Backup & Recovery](#backup--recovery)

---

## Prerequisites

### Required Services

1. **Compute Resources**
   - Minimum: 2 vCPU, 4GB RAM
   - Recommended: 4 vCPU, 8GB RAM, 50GB SSD

2. **Database**
   - MongoDB 7.0+
   - Redis 7.0+

3. **External Services**
   - Exotel account with API credentials
   - OpenAI API key
   - Deepgram API key
   - ElevenLabs API key (optional)
   - AWS S3 bucket (for recordings)

4. **Domain & SSL**
   - Domain name (e.g., yourdomain.com)
   - SSL certificate (Let's Encrypt or commercial)

---

## Deployment Options

### Option 1: Docker (Recommended)
- **Pros**: Easy setup, consistent environment, scalable
- **Best for**: Production deployments, team environments
- **Time**: 30 minutes

### Option 2: AWS (Cloud)
- **Pros**: Auto-scaling, managed services, high availability
- **Best for**: Large-scale production
- **Time**: 1-2 hours

### Option 3: Traditional VPS
- **Pros**: Full control, cost-effective
- **Best for**: Small to medium deployments
- **Time**: 1-2 hours

---

## Docker Deployment

### Step 1: Prepare Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installation
docker --version
docker-compose --version
```

### Step 2: Clone Repository

```bash
# Clone your repository
git clone https://github.com/yourusername/ai-calling-platform.git
cd ai-calling-platform
```

### Step 3: Create Environment Files

**backend/.env**
```bash
# Server
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://yourdomain.com

# Database
MONGODB_URI=mongodb://mongodb:27017/ai-calling-platform
REDIS_URL=redis://redis:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRE=7d
JWT_REFRESH_EXPIRE=30d

# Exotel
EXOTEL_API_KEY=your-exotel-api-key
EXOTEL_API_TOKEN=your-exotel-api-token
EXOTEL_SID=your-exotel-sid
EXOTEL_SUBDOMAIN=your-subdomain
EXOTEL_BASE_URL=https://api.exotel.com/v2/accounts

# AI Services
OPENAI_API_KEY=sk-your-openai-api-key
DEEPGRAM_API_KEY=your-deepgram-key
ELEVENLABS_API_KEY=your-elevenlabs-key

# AWS S3
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_S3_BUCKET=ai-calling-recordings
AWS_REGION=us-east-1

# Webhooks
WEBHOOK_BASE_URL=https://api.yourdomain.com
```

**frontend/.env**
```bash
VITE_API_URL=https://api.yourdomain.com/api/v1
VITE_SOCKET_URL=https://api.yourdomain.com
```

### Step 4: Create Production Docker Compose File

**docker-compose.prod.yml**
```yaml
version: '3.8'

services:
  # MongoDB
  mongodb:
    image: mongo:7
    container_name: ai-calling-mongodb
    restart: always
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
      MONGO_INITDB_DATABASE: ai-calling-platform
    volumes:
      - mongodb_data:/data/db
      - ./mongodb-init.js:/docker-entrypoint-initdb.d/init.js:ro
    networks:
      - ai-calling-network
    ports:
      - "127.0.0.1:27017:27017"

  # Redis
  redis:
    image: redis:7-alpine
    container_name: ai-calling-redis
    restart: always
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    networks:
      - ai-calling-network
    ports:
      - "127.0.0.1:6379:6379"

  # Backend API
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: ai-calling-backend
    restart: always
    env_file:
      - ./backend/.env
    environment:
      MONGODB_URI: mongodb://admin:${MONGO_PASSWORD}@mongodb:27017/ai-calling-platform?authSource=admin
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
    depends_on:
      - mongodb
      - redis
    networks:
      - ai-calling-network
    ports:
      - "127.0.0.1:5000:5000"
    volumes:
      - ./backend/logs:/app/logs

  # Frontend
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        VITE_API_URL: https://api.yourdomain.com/api/v1
        VITE_SOCKET_URL: https://api.yourdomain.com
    container_name: ai-calling-frontend
    restart: always
    networks:
      - ai-calling-network
    ports:
      - "127.0.0.1:3000:80"

  # Nginx Reverse Proxy
  nginx:
    image: nginx:alpine
    container_name: ai-calling-nginx
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - backend
      - frontend
    networks:
      - ai-calling-network

networks:
  ai-calling-network:
    driver: bridge

volumes:
  mongodb_data:
  redis_data:
```

### Step 5: Create Dockerfiles

**backend/Dockerfile**
```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Create logs directory
RUN mkdir -p logs

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:5000/api/v1/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "dist/server.js"]
```

**frontend/Dockerfile**
```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Build arguments
ARG VITE_API_URL
ARG VITE_SOCKET_URL

# Set environment variables
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build application
RUN npm run build

# Production image with Nginx
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
```

**frontend/nginx.conf**
```nginx
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### Step 6: Create Nginx Configuration

**nginx/nginx.conf**
```nginx
events {
    worker_connections 1024;
}

http {
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/m;

    # Upstream backends
    upstream backend_api {
        server backend:5000;
    }

    upstream frontend_app {
        server frontend:80;
    }

    # Redirect HTTP to HTTPS
    server {
        listen 80;
        server_name yourdomain.com api.yourdomain.com;
        return 301 https://$server_name$request_uri;
    }

    # Frontend
    server {
        listen 443 ssl http2;
        server_name yourdomain.com;

        # SSL Configuration
        ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;

        # Security headers
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;

        location / {
            proxy_pass http://frontend_app;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }

    # Backend API
    server {
        listen 443 ssl http2;
        server_name api.yourdomain.com;

        # SSL Configuration (same as above)
        ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        # API endpoints
        location /api/ {
            limit_req zone=api_limit burst=20 nodelay;

            proxy_pass http://backend_api;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # Timeouts
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }

        # Auth endpoints with stricter rate limiting
        location /api/v1/auth/ {
            limit_req zone=auth_limit burst=5 nodelay;

            proxy_pass http://backend_api;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # WebSocket
        location /socket.io/ {
            proxy_pass http://backend_api;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # Timeouts for WebSocket
            proxy_connect_timeout 7d;
            proxy_send_timeout 7d;
            proxy_read_timeout 7d;
        }
    }
}
```

### Step 7: Deploy

```bash
# Generate secure passwords
export MONGO_PASSWORD=$(openssl rand -base64 32)
export REDIS_PASSWORD=$(openssl rand -base64 32)

# Save passwords securely
echo "MONGO_PASSWORD=$MONGO_PASSWORD" >> .env.secrets
echo "REDIS_PASSWORD=$REDIS_PASSWORD" >> .env.secrets
chmod 600 .env.secrets

# Build and start services
docker-compose -f docker-compose.prod.yml up -d --build

# Check logs
docker-compose -f docker-compose.prod.yml logs -f

# Check status
docker-compose -f docker-compose.prod.yml ps
```

### Step 8: Setup SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt install certbot

# Stop nginx temporarily
docker-compose -f docker-compose.prod.yml stop nginx

# Get certificate
sudo certbot certonly --standalone -d yourdomain.com -d api.yourdomain.com

# Restart nginx
docker-compose -f docker-compose.prod.yml start nginx

# Auto-renewal (add to crontab)
0 0 * * * certbot renew --quiet --post-hook "docker-compose -f /path/to/docker-compose.prod.yml restart nginx"
```

---

## AWS Deployment

### Architecture

```
Internet
   ↓
Route 53 (DNS)
   ↓
CloudFront (CDN) → S3 (Frontend Static Assets)
   ↓
Application Load Balancer
   ↓
   ├─→ ECS Fargate (Backend API) → RDS MongoDB / DocumentDB
   │                                 ↓
   │                             ElastiCache Redis
   └─→ Lambda (Workers)
```

### Step 1: Setup Infrastructure

**Install AWS CLI:**
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
aws configure
```

### Step 2: Create VPC and Subnets

```bash
# Create VPC
aws ec2 create-vpc --cidr-block 10.0.0.0/16 --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=ai-calling-vpc}]'

# Create subnets (public and private in multiple AZs)
aws ec2 create-subnet --vpc-id vpc-xxx --cidr-block 10.0.1.0/24 --availability-zone us-east-1a
aws ec2 create-subnet --vpc-id vpc-xxx --cidr-block 10.0.2.0/24 --availability-zone us-east-1b
```

### Step 3: Setup DocumentDB (MongoDB)

```bash
# Create DocumentDB cluster
aws docdb create-db-cluster \
  --db-cluster-identifier ai-calling-docdb \
  --engine docdb \
  --master-username admin \
  --master-user-password YourSecurePassword \
  --vpc-security-group-ids sg-xxx

# Create instances
aws docdb create-db-instance \
  --db-instance-identifier ai-calling-docdb-instance \
  --db-instance-class db.r5.large \
  --engine docdb \
  --db-cluster-identifier ai-calling-docdb
```

### Step 4: Setup ElastiCache Redis

```bash
aws elasticache create-cache-cluster \
  --cache-cluster-id ai-calling-redis \
  --cache-node-type cache.t3.medium \
  --engine redis \
  --num-cache-nodes 1
```

### Step 5: Deploy to ECS Fargate

**Create ECR repositories:**
```bash
aws ecr create-repository --repository-name ai-calling-backend
aws ecr create-repository --repository-name ai-calling-frontend

# Push images
docker build -t ai-calling-backend ./backend
docker tag ai-calling-backend:latest 123456789012.dkr.ecr.us-east-1.amazonaws.com/ai-calling-backend:latest
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/ai-calling-backend:latest
```

**Create ECS task definition:**
```json
{
  "family": "ai-calling-backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "containerDefinitions": [
    {
      "name": "backend",
      "image": "123456789012.dkr.ecr.us-east-1.amazonaws.com/ai-calling-backend:latest",
      "portMappings": [
        {
          "containerPort": 5000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "secrets": [
        {
          "name": "MONGODB_URI",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789012:secret:mongodb-uri"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/ai-calling-backend",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

### Step 6: Create Application Load Balancer

```bash
aws elbv2 create-load-balancer \
  --name ai-calling-alb \
  --subnets subnet-xxx subnet-yyy \
  --security-groups sg-xxx
```

---

## Traditional VPS Deployment

### Step 1: Prepare Ubuntu Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update
sudo apt install -y mongodb-org

# Install Redis
sudo apt install -y redis-server

# Install Nginx
sudo apt install -y nginx

# Install PM2
sudo npm install -g pm2
```

### Step 2: Deploy Application

```bash
# Clone repository
git clone https://github.com/yourusername/ai-calling-platform.git
cd ai-calling-platform

# Backend setup
cd backend
npm install --production
npm run build
cp .env.example .env
# Edit .env with your configuration

# Frontend setup
cd ../frontend
npm install
npm run build

# Copy build to nginx
sudo cp -r dist/* /var/www/html/
```

### Step 3: Configure PM2

**ecosystem.config.js**
```javascript
module.exports = {
  apps: [{
    name: 'ai-calling-backend',
    script: './dist/server.js',
    cwd: '/home/ubuntu/ai-calling-platform/backend',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm Z'
  }]
};
```

```bash
# Start application
pm2 start ecosystem.config.js

# Setup auto-start
pm2 startup
pm2 save
```

### Step 4: Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/ai-calling-platform
```

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        root /var/www/html;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /socket.io/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/ai-calling-platform /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Monitoring & Logging

### Setup Monitoring with PM2

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### Setup Application Monitoring

**Install monitoring tools:**
```bash
npm install --save @sentry/node
npm install --save prom-client
```

### CloudWatch Integration (AWS)

```javascript
// backend/src/utils/logger.ts
import winston from 'winston';
import CloudWatchTransport from 'winston-cloudwatch';

const logger = winston.createLogger({
  transports: [
    new CloudWatchTransport({
      logGroupName: '/ai-calling-platform/backend',
      logStreamName: 'application',
      awsRegion: 'us-east-1'
    })
  ]
});
```

---

## Scaling

### Horizontal Scaling

1. **Load Balancer**: Nginx or AWS ALB
2. **Multiple Backend Instances**: PM2 cluster mode or ECS
3. **Shared Session Store**: Redis
4. **Database Replication**: MongoDB replica set

### Vertical Scaling

- Increase server resources (CPU, RAM)
- Optimize database queries
- Implement caching strategies

---

**Next:** See [DEVELOPMENT.md](DEVELOPMENT.md) for development workflow.
