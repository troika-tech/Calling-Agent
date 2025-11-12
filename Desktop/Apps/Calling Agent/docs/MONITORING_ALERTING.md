# Monitoring & Alerting Guide

## Overview

This guide provides comprehensive monitoring and alerting strategies for the AI Calling Platform in production.

---

## 📊 Monitoring Stack

### Recommended Tools

1. **Application Monitoring**: PM2, New Relic, DataDog
2. **Infrastructure Monitoring**: Prometheus + Grafana, CloudWatch
3. **Log Aggregation**: ELK Stack (Elasticsearch, Logstash, Kibana), CloudWatch Logs
4. **Error Tracking**: Sentry, Rollbar
5. **Uptime Monitoring**: UptimeRobot, Pingdom
6. **Real User Monitoring**: Google Analytics, Mixpanel

---

## 🔍 Application Monitoring

### PM2 Monitoring

#### Basic Monitoring

```bash
# Real-time monitoring
pm2 monit

# Process list with stats
pm2 list

# Detailed info for specific app
pm2 show calling-platform

# CPU and memory usage
pm2 describe calling-platform
```

#### PM2 Plus (Advanced Monitoring)

```bash
# Link to PM2 Plus
pm2 link <secret_key> <public_key>

# Enable monitoring
pm2 install pm2-server-monit
```

**Features**:
- Real-time metrics dashboard
- Custom metrics
- Exception tracking
- Transaction tracing
- Email/Slack alerts

#### Custom Metrics with PM2

```typescript
// backend/src/utils/metrics.ts
import pmx from '@pm2/io';

// Custom metrics
export const metrics = {
  activeCalls: pmx.metric({
    name: 'Active Calls',
    type: 'metric',
    unit: 'calls'
  }),

  queueSize: pmx.metric({
    name: 'Queue Size',
    type: 'metric',
    unit: 'jobs'
  }),

  responseTime: pmx.metric({
    name: 'Avg Response Time',
    type: 'metric',
    unit: 'ms',
    historic: true
  }),

  errorRate: pmx.metric({
    name: 'Error Rate',
    type: 'metric',
    unit: '%'
  })
};

// Update metrics
export function updateMetrics(data: {
  activeCalls?: number;
  queueSize?: number;
  responseTime?: number;
  errorRate?: number;
}) {
  if (data.activeCalls !== undefined) {
    metrics.activeCalls.set(data.activeCalls);
  }
  if (data.queueSize !== undefined) {
    metrics.queueSize.set(data.queueSize);
  }
  if (data.responseTime !== undefined) {
    metrics.responseTime.set(data.responseTime);
  }
  if (data.errorRate !== undefined) {
    metrics.errorRate.set(data.errorRate);
  }
}
```

### Health Check Endpoint

Already implemented at [/api/v1/health](backend/src/routes/index.ts:18):

```bash
# Basic health check
curl http://localhost:3000/api/v1/health

# Detailed stats
curl http://localhost:3000/api/v1/stats
```

**Expected Response**:
```json
{
  "success": true,
  "message": "API is running",
  "timestamp": "2025-11-01T12:00:00.000Z"
}
```

### Stats Endpoint

Monitor system stats via [/api/v1/stats](backend/src/routes/stats.routes.ts):

```bash
curl http://localhost:3000/api/v1/stats | jq
```

**Response includes**:
- Total calls (inbound/outbound)
- Call success rates
- Average call duration
- Queue statistics
- Connection pool stats
- Voicemail detection stats

---

## 📈 Infrastructure Monitoring

### Prometheus + Grafana Setup

#### Install Prometheus

```bash
# Download Prometheus
wget https://github.com/prometheus/prometheus/releases/download/v2.45.0/prometheus-2.45.0.linux-amd64.tar.gz

# Extract
tar xvfz prometheus-*.tar.gz
cd prometheus-*

# Configure prometheus.yml
cat > prometheus.yml <<EOF
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'calling-platform'
    static_configs:
      - targets: ['localhost:3000']
        labels:
          environment: 'production'

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']

  - job_name: 'mongodb-exporter'
    static_configs:
      - targets: ['localhost:9216']

  - job_name: 'redis-exporter'
    static_configs:
      - targets: ['localhost:9121']
EOF

# Start Prometheus
./prometheus --config.file=prometheus.yml
```

#### Install Node Exporter (System Metrics)

```bash
# Download Node Exporter
wget https://github.com/prometheus/node_exporter/releases/download/v1.6.0/node_exporter-1.6.0.linux-amd64.tar.gz

# Extract and run
tar xvfz node_exporter-*.tar.gz
cd node_exporter-*
./node_exporter
```

#### Install Grafana

```bash
# Ubuntu/Debian
sudo apt-get install -y software-properties-common
sudo add-apt-repository "deb https://packages.grafana.com/oss/deb stable main"
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -
sudo apt-get update
sudo apt-get install grafana

# Start Grafana
sudo systemctl start grafana-server
sudo systemctl enable grafana-server

# Access at http://localhost:3000
# Default credentials: admin/admin
```

#### Grafana Dashboard Setup

1. **Add Prometheus Data Source**:
   - Navigate to Configuration → Data Sources
   - Add Prometheus
   - URL: `http://localhost:9090`

2. **Import Dashboard**:
   - Dashboard ID: `1860` (Node Exporter Full)
   - Dashboard ID: `2949` (Node.js Application)

3. **Custom Dashboard Queries**:

```promql
# Active calls
node_active_calls

# Response time (95th percentile)
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Error rate
rate(http_requests_total{status=~"5.."}[5m])

# Queue size
bull_queue_waiting_total{queue="scheduled-calls"}

# Memory usage
process_resident_memory_bytes / 1024 / 1024

# CPU usage
rate(process_cpu_seconds_total[1m]) * 100
```

### CloudWatch Monitoring (AWS)

#### Install CloudWatch Agent

```bash
# Download agent
wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb

# Install
sudo dpkg -i amazon-cloudwatch-agent.deb

# Configure
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-config-wizard
```

#### CloudWatch Configuration

```json
{
  "metrics": {
    "namespace": "CallingPlatform",
    "metrics_collected": {
      "cpu": {
        "measurement": [
          {
            "name": "cpu_usage_idle",
            "rename": "CPU_IDLE",
            "unit": "Percent"
          }
        ],
        "totalcpu": false
      },
      "disk": {
        "measurement": [
          {
            "name": "used_percent",
            "rename": "DISK_USED",
            "unit": "Percent"
          }
        ]
      },
      "mem": {
        "measurement": [
          {
            "name": "mem_used_percent",
            "rename": "MEM_USED",
            "unit": "Percent"
          }
        ]
      }
    }
  },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/calling-platform/app.log",
            "log_group_name": "/calling-platform/app",
            "log_stream_name": "{instance_id}"
          }
        ]
      }
    }
  }
}
```

---

## 🗃️ Log Aggregation

### Winston Logger (Already Implemented)

Logs are configured in [backend/src/utils/logger.ts](backend/src/utils/logger.ts).

### ELK Stack Setup

#### 1. Install Elasticsearch

```bash
# Install Java
sudo apt install openjdk-11-jdk

# Add Elasticsearch repository
wget -qO - https://artifacts.elastic.co/GPG-KEY-elasticsearch | sudo apt-key add -
echo "deb https://artifacts.elastic.co/packages/8.x/apt stable main" | sudo tee /etc/apt/sources.list.d/elastic-8.x.list

# Install Elasticsearch
sudo apt update
sudo apt install elasticsearch

# Start Elasticsearch
sudo systemctl start elasticsearch
sudo systemctl enable elasticsearch
```

#### 2. Install Logstash

```bash
sudo apt install logstash

# Configure logstash
sudo nano /etc/logstash/conf.d/calling-platform.conf
```

**Logstash Configuration**:

```ruby
input {
  file {
    path => "/var/log/calling-platform/app.log"
    start_position => "beginning"
    codec => json
  }
}

filter {
  # Parse JSON logs
  json {
    source => "message"
  }

  # Add timestamp
  date {
    match => [ "timestamp", "ISO8601" ]
    target => "@timestamp"
  }

  # Extract error severity
  if [level] == "error" {
    mutate {
      add_tag => ["error"]
    }
  }
}

output {
  elasticsearch {
    hosts => ["http://localhost:9200"]
    index => "calling-platform-%{+YYYY.MM.dd}"
  }

  # Also output to console for debugging
  stdout {
    codec => rubydebug
  }
}
```

#### 3. Install Kibana

```bash
sudo apt install kibana

# Start Kibana
sudo systemctl start kibana
sudo systemctl enable kibana

# Access at http://localhost:5601
```

#### 4. Kibana Dashboard Setup

1. **Create Index Pattern**:
   - Management → Index Patterns
   - Pattern: `calling-platform-*`
   - Time field: `@timestamp`

2. **Create Visualizations**:
   - Error rate over time (line chart)
   - Top error messages (pie chart)
   - Call status distribution (bar chart)
   - Response time histogram

3. **Create Dashboard**:
   - Combine all visualizations
   - Add filters for time range, environment, error level

### Centralized Logging with Winston Transport

```typescript
// backend/src/utils/logger.ts (enhancement)
import winston from 'winston';
import { ElasticsearchTransport } from 'winston-elasticsearch';

const esTransport = new ElasticsearchTransport({
  level: 'info',
  clientOpts: {
    node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200'
  },
  index: 'calling-platform'
});

export const logger = winston.createLogger({
  transports: [
    new winston.transports.File({ filename: 'logs/app.log' }),
    new winston.transports.Console(),
    esTransport // Send to Elasticsearch
  ]
});
```

---

## 🚨 Alerting

### PM2 Alerts

#### Slack Notifications

```bash
# Install PM2 Slack module
pm2 install pm2-slack

# Configure
pm2 set pm2-slack:slack_url https://hooks.slack.com/services/YOUR/WEBHOOK/URL
pm2 set pm2-slack:username "Calling Platform Bot"

# Configure events to monitor
pm2 set pm2-slack:events "restart,reload,stop,start,error"
```

#### Email Notifications

```bash
# Install PM2 auto-notify
pm2 install pm2-auto-pull

# Configure email
pm2 set pm2-auto-pull:email your@email.com
```

### Custom Alerting Rules

Create alerting service:

```typescript
// backend/src/services/alerting.service.ts
import { logger } from '../utils/logger';
import axios from 'axios';

export interface AlertConfig {
  slackWebhookUrl?: string;
  emailRecipients?: string[];
  pagerDutyIntegrationKey?: string;
}

export class AlertingService {
  private config: AlertConfig;

  constructor(config: AlertConfig) {
    this.config = config;
  }

  /**
   * Send critical alert
   */
  async sendCriticalAlert(title: string, message: string, metadata?: any): Promise<void> {
    logger.error('CRITICAL ALERT', { title, message, metadata });

    await Promise.all([
      this.sendSlackAlert('🚨 CRITICAL', title, message, metadata),
      this.sendPagerDutyAlert('critical', title, message, metadata)
    ]);
  }

  /**
   * Send warning alert
   */
  async sendWarningAlert(title: string, message: string, metadata?: any): Promise<void> {
    logger.warn('WARNING ALERT', { title, message, metadata });

    await this.sendSlackAlert('⚠️ WARNING', title, message, metadata);
  }

  /**
   * Send Slack notification
   */
  private async sendSlackAlert(
    severity: string,
    title: string,
    message: string,
    metadata?: any
  ): Promise<void> {
    if (!this.config.slackWebhookUrl) {
      return;
    }

    try {
      await axios.post(this.config.slackWebhookUrl, {
        text: `${severity}: ${title}`,
        attachments: [
          {
            color: severity.includes('CRITICAL') ? 'danger' : 'warning',
            fields: [
              {
                title: 'Message',
                value: message,
                short: false
              },
              {
                title: 'Timestamp',
                value: new Date().toISOString(),
                short: true
              },
              {
                title: 'Environment',
                value: process.env.NODE_ENV || 'development',
                short: true
              },
              ...(metadata
                ? [
                    {
                      title: 'Metadata',
                      value: JSON.stringify(metadata, null, 2),
                      short: false
                    }
                  ]
                : [])
            ]
          }
        ]
      });
    } catch (error: any) {
      logger.error('Failed to send Slack alert', { error: error.message });
    }
  }

  /**
   * Send PagerDuty alert
   */
  private async sendPagerDutyAlert(
    severity: 'critical' | 'warning' | 'info',
    title: string,
    message: string,
    metadata?: any
  ): Promise<void> {
    if (!this.config.pagerDutyIntegrationKey) {
      return;
    }

    try {
      await axios.post('https://events.pagerduty.com/v2/enqueue', {
        routing_key: this.config.pagerDutyIntegrationKey,
        event_action: 'trigger',
        payload: {
          summary: title,
          severity,
          source: 'calling-platform',
          custom_details: {
            message,
            metadata,
            timestamp: new Date().toISOString()
          }
        }
      });
    } catch (error: any) {
      logger.error('Failed to send PagerDuty alert', { error: error.message });
    }
  }
}

// Export singleton
export const alertingService = new AlertingService({
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
  pagerDutyIntegrationKey: process.env.PAGERDUTY_INTEGRATION_KEY
});
```

### Alert Triggers

```typescript
// backend/src/utils/healthMonitor.ts
import { alertingService } from '../services/alerting.service';
import { CallLog } from '../models/CallLog';

export class HealthMonitor {
  private checkInterval: NodeJS.Timeout | null = null;

  start(): void {
    // Check every 5 minutes
    this.checkInterval = setInterval(() => {
      this.performHealthChecks();
    }, 5 * 60 * 1000);
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }

  private async performHealthChecks(): Promise<void> {
    await Promise.all([
      this.checkErrorRate(),
      this.checkQueueBacklog(),
      this.checkDiskSpace(),
      this.checkMemoryUsage()
    ]);
  }

  /**
   * Alert if error rate exceeds threshold
   */
  private async checkErrorRate(): Promise<void> {
    const last5Minutes = new Date(Date.now() - 5 * 60 * 1000);

    const [totalCalls, failedCalls] = await Promise.all([
      CallLog.countDocuments({ createdAt: { $gte: last5Minutes } }),
      CallLog.countDocuments({
        createdAt: { $gte: last5Minutes },
        status: 'failed'
      })
    ]);

    const errorRate = totalCalls > 0 ? (failedCalls / totalCalls) * 100 : 0;

    if (errorRate > 20) {
      await alertingService.sendCriticalAlert(
        'High Error Rate Detected',
        `Error rate is ${errorRate.toFixed(2)}% (threshold: 20%)`,
        { totalCalls, failedCalls, errorRate }
      );
    } else if (errorRate > 10) {
      await alertingService.sendWarningAlert(
        'Elevated Error Rate',
        `Error rate is ${errorRate.toFixed(2)}% (threshold: 10%)`,
        { totalCalls, failedCalls, errorRate }
      );
    }
  }

  /**
   * Alert if queue has excessive backlog
   */
  private async checkQueueBacklog(): Promise<void> {
    // Implementation depends on queue service
    // Check Bull queue stats
  }

  /**
   * Alert if disk space is low
   */
  private async checkDiskSpace(): Promise<void> {
    // Use node-disk-info or similar
  }

  /**
   * Alert if memory usage is high
   */
  private async checkMemoryUsage(): Promise<void> {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    const heapTotalMB = usage.heapTotal / 1024 / 1024;
    const usagePercent = (heapUsedMB / heapTotalMB) * 100;

    if (usagePercent > 90) {
      await alertingService.sendCriticalAlert(
        'Critical Memory Usage',
        `Memory usage is ${usagePercent.toFixed(2)}% (threshold: 90%)`,
        { heapUsedMB, heapTotalMB, usagePercent }
      );
    }
  }
}

export const healthMonitor = new HealthMonitor();
```

---

## 🎯 Key Metrics to Monitor

### Application Metrics

| Metric | Target | Alert Threshold |
|--------|--------|----------------|
| Response Time (p95) | < 200ms | > 500ms |
| Error Rate | < 1% | > 5% |
| Request Rate | - | - |
| Active Connections | - | > 1000 |
| Queue Size | < 100 | > 500 |
| Queue Processing Rate | > 10/min | < 5/min |

### Infrastructure Metrics

| Metric | Target | Alert Threshold |
|--------|--------|----------------|
| CPU Usage | < 70% | > 85% |
| Memory Usage | < 80% | > 90% |
| Disk Usage | < 80% | > 90% |
| Network I/O | - | Abnormal spikes |
| Database Connections | < 80% pool | > 90% pool |

### Business Metrics

| Metric | Target | Alert Threshold |
|--------|--------|----------------|
| Call Success Rate | > 70% | < 50% |
| Average Call Duration | 2-5 min | - |
| Voicemail Detection Rate | 20-30% | - |
| Retry Success Rate | > 40% | < 20% |
| Queue Wait Time | < 30s | > 2min |

---

## 📊 Dashboard Examples

### Grafana Dashboard Layout

**Row 1: System Health**
- CPU Usage (gauge)
- Memory Usage (gauge)
- Disk Usage (gauge)
- Network I/O (line chart)

**Row 2: Application Metrics**
- Active Calls (stat)
- Requests/sec (graph)
- Response Time p95 (graph)
- Error Rate (graph)

**Row 3: Business Metrics**
- Call Success Rate (pie chart)
- Queue Size (stat + sparkline)
- Avg Call Duration (stat)
- Voicemail Detection % (stat)

**Row 4: Database & Queue**
- MongoDB Connections (graph)
- MongoDB Operations (graph)
- Redis Memory (graph)
- Bull Queue Stats (table)

---

## 🔔 Alert Configuration Best Practices

### 1. Alert Fatigue Prevention

- **Use appropriate thresholds**: Don't alert on minor issues
- **Implement alert suppression**: Avoid duplicate alerts
- **Add cooldown periods**: Wait 5-10 minutes before re-alerting
- **Group related alerts**: Combine similar issues

### 2. Escalation Policy

```yaml
Severity Levels:
  P1 (Critical):
    - Production down
    - Data loss risk
    - Security breach
    Response: Immediate PagerDuty + Slack + Email
    SLA: 15 minutes

  P2 (High):
    - Elevated error rate (>10%)
    - High resource usage (>85%)
    - Queue backlog
    Response: Slack + Email
    SLA: 1 hour

  P3 (Medium):
    - Warning thresholds
    - Non-critical errors
    Response: Slack during business hours
    SLA: 4 hours

  P4 (Low):
    - Informational
    - Trending issues
    Response: Daily digest email
    SLA: 1 day
```

### 3. On-Call Rotation

- **Primary on-call**: Receives all P1/P2 alerts
- **Secondary on-call**: Escalation after 15 minutes
- **Rotation schedule**: Weekly rotation
- **Handoff process**: Daily standup + documentation

---

## 📚 Additional Resources

- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/monitoring/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/)
- [Grafana Tutorials](https://grafana.com/tutorials/)
- [ELK Stack Guide](https://www.elastic.co/guide/index.html)
- [SRE Book - Monitoring](https://sre.google/sre-book/monitoring-distributed-systems/)
