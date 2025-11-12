# Load Testing Guide

## Overview

This directory contains load testing scripts and configurations for the AI Calling Platform.

## Tools

We use **k6** for load testing. Install it from: https://k6.io/docs/getting-started/installation/

```bash
# macOS
brew install k6

# Windows
choco install k6

# Linux
sudo apt-get install k6
```

## Test Scenarios

### 1. API Health Check Load Test

Tests baseline performance of health endpoint.

```bash
k6 run health-check.js
```

**Expected Performance**:
- RPS: 1000+
- P95 Latency: <50ms
- Error Rate: <0.1%

### 2. Bulk Import Load Test

Tests CSV import under load.

```bash
k6 run bulk-import.js
```

**Expected Performance**:
- Concurrent Uploads: 10
- Processing Time (1000 rows): <60s
- Error Rate: <1%

### 3. Analytics Dashboard Load Test

Tests analytics queries under load.

```bash
k6 run analytics-load.js
```

**Expected Performance**:
- RPS: 100
- P95 Latency: <500ms
- Error Rate: <0.5%

### 4. Call Scheduling Load Test

Tests call scheduling throughput.

```bash
k6 run scheduling-load.js
```

**Expected Performance**:
- Calls/Second: 50
- P95 Latency: <200ms
- Queue Depth: <1000

### 5. Full System Load Test

End-to-end test simulating real user behavior.

```bash
k6 run full-system.js
```

**Expected Performance**:
- Concurrent Users: 100
- Mixed Operations: Schedule, Retry, Analytics
- P95 Latency: <1000ms
- Error Rate: <2%

## Load Test Profiles

### Smoke Test (Quick Validation)

```bash
k6 run --vus 1 --duration 30s {test-file}.js
```

- Virtual Users: 1
- Duration: 30 seconds
- Purpose: Verify test scripts work

### Average Load Test

```bash
k6 run --vus 10 --duration 5m {test-file}.js
```

- Virtual Users: 10
- Duration: 5 minutes
- Purpose: Test normal operating conditions

### Stress Test

```bash
k6 run --vus 50 --duration 10m {test-file}.js
```

- Virtual Users: 50
- Duration: 10 minutes
- Purpose: Find performance limits

### Spike Test

```bash
k6 run --vus 1 --stage 30s:1 --stage 30s:100 --stage 30s:1 {test-file}.js
```

- Pattern: 1 → 100 → 1 users
- Duration: 90 seconds
- Purpose: Test recovery from spikes

### Soak Test

```bash
k6 run --vus 20 --duration 1h {test-file}.js
```

- Virtual Users: 20
- Duration: 1 hour
- Purpose: Find memory leaks, resource exhaustion

## Metrics to Monitor

### Application Metrics

- **Request Rate**: Requests per second
- **Response Time**: P50, P95, P99 latencies
- **Error Rate**: 4xx and 5xx responses
- **Throughput**: Data transferred

### System Metrics

- **CPU Usage**: Should stay below 80%
- **Memory Usage**: Should not grow unbounded
- **Disk I/O**: Database write/read rates
- **Network I/O**: Bandwidth usage

### Database Metrics

- **Connection Pool**: Active/idle connections
- **Query Time**: Slow query count
- **Lock Contention**: Waiting transactions

### Queue Metrics

- **Queue Depth**: Pending jobs
- **Processing Rate**: Jobs/second
- **Failed Jobs**: Error rate

## Performance Baselines

### API Endpoints

| Endpoint | P95 Latency | RPS | Error Rate |
|----------|-------------|-----|------------|
| Health Check | 20ms | 2000 | <0.01% |
| Schedule Call | 150ms | 100 | <1% |
| Bulk Import | 5000ms | 5 | <2% |
| Analytics | 300ms | 50 | <0.5% |
| Retry Schedule | 200ms | 75 | <1% |

### System Capacity

| Metric | Target | Maximum |
|--------|--------|---------|
| Concurrent Calls | 100 | 150 |
| Scheduled Calls/Day | 10,000 | 50,000 |
| Bulk Imports/Hour | 20 | 50 |
| Analytics Queries/Min | 100 | 500 |

## Running Tests

### Prerequisites

1. Set up test environment:
```bash
export API_URL=http://localhost:3000
export API_KEY=your-test-api-key
```

2. Ensure Redis is running:
```bash
redis-cli ping
```

3. Ensure MongoDB is running:
```bash
mongosh --eval "db.runCommand({ ping: 1 })"
```

### Run All Tests

```bash
./run-all-tests.sh
```

This runs:
1. Smoke tests (1 VU, 30s)
2. Average load (10 VU, 5m)
3. Stress test (50 VU, 10m)

### View Results

k6 outputs results to console and optionally to:
- JSON: `--out json=results.json`
- InfluxDB: `--out influxdb=http://localhost:8086/k6`
- Cloud: `k6 cloud run {test}.js`

### Example Output

```
✓ http_req_duration..............: avg=125ms min=45ms med=98ms max=2.1s p(95)=287ms
✓ http_req_failed................: 0.12%
✓ http_reqs......................: 45678
✓ iteration_duration.............: avg=1.2s
✓ vus............................: 10
```

## Troubleshooting

### High Error Rates

1. Check logs: `pm2 logs backend`
2. Verify database connections
3. Check Redis connectivity
4. Review rate limits

### High Latency

1. Check database indexes
2. Review slow queries
3. Check connection pool settings
4. Verify network latency

### Memory Leaks

1. Monitor memory over time
2. Check for connection leaks
3. Review queue cleanup
4. Check for circular references

## Best Practices

1. **Start Small**: Begin with smoke tests
2. **Ramp Up Gradually**: Increase load slowly
3. **Monitor Everything**: Watch all metrics
4. **Test Realistic Scenarios**: Mix operations
5. **Document Results**: Keep baseline records
6. **Automate**: Run tests in CI/CD

## CI/CD Integration

Add to `.github/workflows/load-test.yml`:

```yaml
name: Load Tests
on:
  schedule:
    - cron: '0 2 * * *' # Daily at 2 AM

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run k6 tests
        uses: k6io/action@v0.1
        with:
          filename: tests/load/full-system.js
          cloud: true
```

## Resources

- [k6 Documentation](https://k6.io/docs/)
- [Load Testing Best Practices](https://k6.io/docs/testing-guides/automated-performance-testing/)
- [Performance Testing Guide](https://developers.google.com/web/fundamentals/performance/)
