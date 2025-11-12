# Gradual Rollout Plan

## Overview

This document outlines the strategy for gradually rolling out the AI Calling Platform outbound calls feature from 5% to 100% of production traffic.

**Timeline**: 5 weeks
**Approach**: Phased rollout with monitoring and validation at each stage
**Goal**: Zero-downtime deployment with minimal risk

---

## 🎯 Rollout Strategy

### Phased Approach

```
Week 1: 5% Traffic   → Validate core functionality
Week 2: 10% Traffic  → Confirm stability
Week 3: 25% Traffic  → Test at scale
Week 4: 50% Traffic  → Majority testing
Week 5+: 100% Traffic → Full deployment
```

### Traffic Allocation Method

**Feature Flag Based Rollout**:
- Use feature flags to control traffic percentage
- Enable/disable instantly without code deployment
- A/B test between old and new system (if applicable)

---

## 📅 Rollout Timeline

### Week 1: 5% Traffic (Initial Rollout)

**Dates**: Day 1-7
**Traffic**: 5% of all outbound calls
**Target Volume**: ~50-100 calls/day

#### Objectives
1. Validate production readiness
2. Monitor for critical errors
3. Confirm performance baselines
4. Test monitoring and alerting

#### Success Criteria
- ✅ Call success rate > 70%
- ✅ System uptime > 99.5%
- ✅ Zero P1 bugs
- ✅ < 2 P2 bugs
- ✅ Response time < 200ms (p95)
- ✅ No customer complaints

#### Monitoring Focus
- Error rates and types
- Response times
- Resource utilization (CPU, memory)
- Queue processing
- Third-party API latency (Exotel, Deepgram, OpenAI)

#### Rollback Triggers
- Any P1 bug
- Call success rate < 60%
- System uptime < 95%
- > 5 customer complaints
- Critical security issue

---

### Week 2: 10% Traffic

**Dates**: Day 8-14
**Traffic**: 10% of all outbound calls
**Target Volume**: ~100-200 calls/day

#### Objectives
1. Confirm Week 1 stability at higher volume
2. Test edge cases
3. Validate retry logic under load
4. Monitor cost scaling

#### Success Criteria
- ✅ Week 1 criteria maintained
- ✅ Queue processing time < 60s
- ✅ Retry success rate > 40%
- ✅ Voicemail detection accuracy > 80%
- ✅ Cost per call within budget

#### Monitoring Focus
- All Week 1 metrics
- Concurrent call handling
- Database query performance
- Redis queue performance
- Cost per successful call

#### Rollback Triggers
- Same as Week 1
- Queue backlog > 500 jobs
- Database connection pool exhausted
- Cost overrun > 20%

---

### Week 3: 25% Traffic

**Dates**: Day 15-21
**Traffic**: 25% of all outbound calls
**Target Volume**: ~250-500 calls/day

#### Objectives
1. Test at moderate scale
2. Validate horizontal scaling (if needed)
3. Stress test infrastructure
4. Monitor long-term stability

#### Success Criteria
- ✅ Previous weeks' criteria maintained
- ✅ Handle peak load (100+ concurrent calls)
- ✅ Database performance stable
- ✅ No memory leaks
- ✅ Cost trajectory predictable

#### Monitoring Focus
- All previous metrics
- Memory leak detection
- Connection pool utilization
- Peak hour performance
- Geographic distribution of calls

#### Rollback Triggers
- Same as previous weeks
- Memory usage > 90%
- Database slow queries > 100ms
- Infrastructure scaling issues

---

### Week 4: 50% Traffic

**Dates**: Day 22-28
**Traffic**: 50% of all outbound calls
**Target Volume**: ~500-1000 calls/day

#### Objectives
1. Validate majority traffic handling
2. Confirm infrastructure capacity
3. Test disaster recovery
4. Final validation before 100%

#### Success Criteria
- ✅ All previous criteria maintained
- ✅ Handle sustained high load
- ✅ Failover mechanisms tested
- ✅ Documentation complete
- ✅ Support team trained

#### Monitoring Focus
- All previous metrics
- Multi-hour sustained load
- Infrastructure autoscaling (if applicable)
- Failover and recovery time
- Support ticket volume

#### Rollback Triggers
- Same as previous weeks
- Sustained degraded performance
- Infrastructure capacity limits reached

---

### Week 5+: 100% Traffic (Full Rollout)

**Dates**: Day 29+
**Traffic**: 100% of all outbound calls
**Target Volume**: Full production volume

#### Objectives
1. Complete migration to new system
2. Decommission old system (if applicable)
3. Continuous monitoring and optimization
4. Document lessons learned

#### Success Criteria
- ✅ All previous criteria maintained
- ✅ Smooth transition from 50% to 100%
- ✅ No degradation in service quality
- ✅ Customer satisfaction maintained
- ✅ Team confidence in system stability

#### Monitoring Focus
- All metrics continuously
- Long-term trends
- Cost optimization opportunities
- Feature usage patterns
- User feedback

#### Post-Rollout Actions
1. Continue monitoring for 2 weeks
2. Optimize based on learnings
3. Plan next features/improvements
4. Celebrate success! 🎉

---

## 🚀 Implementation

### Feature Flag Configuration

```typescript
// backend/src/config/featureFlags.ts
export interface FeatureFlags {
  outboundCallsEnabled: boolean;
  outboundCallsPercentage: number; // 0-100
  enableRetryLogic: boolean;
  enableVoicemailDetection: boolean;
  enableBulkImport: boolean;
}

export const featureFlags: FeatureFlags = {
  outboundCallsEnabled: true,
  outboundCallsPercentage: parseInt(process.env.OUTBOUND_CALLS_PERCENTAGE || '5'),
  enableRetryLogic: true,
  enableVoicemailDetection: true,
  enableBulkImport: true
};

// Check if outbound calls should be processed
export function shouldProcessOutboundCall(userId: string): boolean {
  if (!featureFlags.outboundCallsEnabled) {
    return false;
  }

  // Use deterministic hashing to ensure consistent user experience
  const hash = hashUserId(userId);
  const userPercentile = hash % 100;

  return userPercentile < featureFlags.outboundCallsPercentage;
}

function hashUserId(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}
```

### Traffic Routing

```typescript
// backend/src/services/callRouter.service.ts
import { shouldProcessOutboundCall } from '../config/featureFlags';
import { logger } from '../utils/logger';

export class CallRouterService {
  /**
   * Route call to appropriate system based on rollout percentage
   */
  async routeOutboundCall(
    userId: string,
    callDetails: any
  ): Promise<'new-system' | 'old-system'> {
    const useNewSystem = shouldProcessOutboundCall(userId);

    logger.info('Routing outbound call', {
      userId,
      system: useNewSystem ? 'new-system' : 'old-system',
      rolloutPercentage: featureFlags.outboundCallsPercentage
    });

    if (useNewSystem) {
      // Route to new system (AI Calling Platform)
      return 'new-system';
    } else {
      // Route to old system (if applicable)
      return 'old-system';
    }
  }
}

export const callRouterService = new CallRouterService();
```

### Updating Rollout Percentage

```bash
# Update environment variable
export OUTBOUND_CALLS_PERCENTAGE=10

# Restart application (PM2)
pm2 restart calling-platform

# Or use runtime config update (if implemented)
curl -X PATCH http://localhost:3000/api/v1/admin/feature-flags \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "outboundCallsPercentage": 10
  }'
```

---

## 📊 Monitoring Dashboard

### Rollout Metrics Dashboard

Create a dedicated Grafana dashboard for rollout monitoring:

**Panel 1: Traffic Split**
```promql
# Percentage of traffic on new system
(sum(rate(calls_total{system="new"}[5m])) /
 sum(rate(calls_total[5m]))) * 100
```

**Panel 2: Error Rate Comparison**
```promql
# Error rate: new vs old system
rate(calls_failed_total{system="new"}[5m]) /
rate(calls_total{system="new"}[5m])

vs

rate(calls_failed_total{system="old"}[5m]) /
rate(calls_total{system="old"}[5m])
```

**Panel 3: Response Time Comparison**
```promql
# p95 response time: new vs old
histogram_quantile(0.95,
  rate(http_request_duration_seconds_bucket{system="new"}[5m]))

vs

histogram_quantile(0.95,
  rate(http_request_duration_seconds_bucket{system="old"}[5m]))
```

**Panel 4: Success Rate**
```promql
# Call success rate
(sum(rate(calls_successful_total{system="new"}[5m])) /
 sum(rate(calls_total{system="new"}[5m]))) * 100
```

---

## 🔄 Rollback Procedures

### Quick Rollback (Feature Flag)

**Fastest**: Update feature flag to 0%

```bash
# Method 1: Environment variable
export OUTBOUND_CALLS_PERCENTAGE=0
pm2 restart calling-platform

# Method 2: Runtime API (instant, no restart)
curl -X PATCH http://localhost:3000/api/v1/admin/feature-flags \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"outboundCallsPercentage": 0}'

# Method 3: Kill switch (emergency)
curl -X PATCH http://localhost:3000/api/v1/admin/feature-flags \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"outboundCallsEnabled": false}'
```

### Partial Rollback

If issues affect only some users:

```bash
# Roll back to previous percentage
# Example: From 25% back to 10%
export OUTBOUND_CALLS_PERCENTAGE=10
pm2 restart calling-platform
```

### Full System Rollback

See [Deployment Runbook - Rollback Procedure](./DEPLOYMENT_RUNBOOK.md#-rollback-procedure) for complete steps.

---

## 📈 Decision Framework

### Advance to Next Phase

**Criteria**:
- ✅ All success criteria met for current phase
- ✅ Monitoring shows stable performance for 48+ hours
- ✅ No unresolved P1 or P2 bugs
- ✅ Team confidence is high
- ✅ Stakeholder approval obtained

**Process**:
1. Review metrics from current phase
2. Conduct go/no-go meeting with team
3. Document any issues and resolutions
4. Update feature flag percentage
5. Announce to team and stakeholders
6. Monitor closely for first 24 hours

### Hold at Current Phase

**Triggers**:
- Minor issues that need investigation
- Performance degradation within acceptable range
- Uncertainty about capacity for next phase
- Need more data/time for analysis

**Actions**:
1. Extend current phase by 3-7 days
2. Deep dive into concerning metrics
3. Optimize and address minor issues
4. Re-evaluate readiness

### Rollback to Previous Phase

**Triggers**:
- P1 or critical P2 bugs discovered
- Performance degradation beyond thresholds
- Customer complaints increasing
- Infrastructure issues
- Third-party service issues

**Actions**:
1. Execute rollback procedure immediately
2. Communicate to all stakeholders
3. Root cause analysis
4. Create fix plan with timeline
5. Re-test fixes in beta
6. Resume rollout when issues resolved

---

## 📞 Communication Plan

### Internal Communication

**Daily Updates** (During Rollout):
- Slack channel: #rollout-status
- Daily standup: Review metrics
- Dashboard link shared with team

**Weekly Status Reports**:
```markdown
# Week X Rollout Status

## Current Phase: X% Traffic
- Start Date: YYYY-MM-DD
- Call Volume: XXX calls
- Success Rate: XX.X%
- Error Rate: X.X%
- Uptime: XX.XX%

## Key Metrics
✅ Metric 1: [status]
✅ Metric 2: [status]
⚠️ Metric 3: [status and action]

## Issues
- [Issue 1]: [status]
- [Issue 2]: [status]

## Next Phase
- Target Date: YYYY-MM-DD
- Go/No-Go Decision: [date]
```

### External Communication

**Customer-Facing**:
- No communication needed unless issues arise
- Transparent communication if rollback needed
- Celebrate milestones (e.g., 100% rollout complete)

**Stakeholder Updates**:
- Weekly email summary
- Monthly detailed report
- Immediate notification of critical issues

---

## 🎯 Success Metrics

### Technical Success

| Metric | Target | Actual (Track Weekly) |
|--------|--------|----------------------|
| Call Success Rate | > 70% | ___% |
| System Uptime | > 99% | ___% |
| Response Time (p95) | < 200ms | ___ms |
| Error Rate | < 5% | ___% |
| Queue Processing | < 60s | ___s |
| Voicemail Detection | > 80% | ___% |

### Business Success

| Metric | Target | Actual (Track Weekly) |
|--------|--------|----------------------|
| Customer Satisfaction | > 4/5 | ___/5 |
| Support Tickets | < 10/week | ___ |
| Cost per Call | Within budget | ₹___ |
| Feature Adoption | > 80% | ___% |

### Rollout Progress

| Week | Traffic % | Target Date | Actual Date | Status |
|------|-----------|-------------|-------------|--------|
| 1 | 5% | Day 1-7 | ___ | ⏳ |
| 2 | 10% | Day 8-14 | ___ | ⏳ |
| 3 | 25% | Day 15-21 | ___ | ⏳ |
| 4 | 50% | Day 22-28 | ___ | ⏳ |
| 5+ | 100% | Day 29+ | ___ | ⏳ |

---

## 🛡️ Risk Mitigation

### Risk 1: Performance Degradation at Scale

**Likelihood**: Medium
**Impact**: High

**Mitigation**:
- Load testing completed before rollout
- Horizontal scaling plan ready
- Database indexes optimized
- Connection pooling configured

**Contingency**:
- Reduce traffic percentage
- Scale infrastructure immediately
- Implement rate limiting if needed

### Risk 2: Third-Party API Issues

**Likelihood**: Medium
**Impact**: High

**Mitigation**:
- Circuit breakers implemented
- Retry logic with exponential backoff
- Fallback providers configured (where possible)
- SLA monitoring for all providers

**Contingency**:
- Switch to backup providers
- Queue calls for retry
- Communicate delays to users

### Risk 3: Unexpected Edge Cases

**Likelihood**: High
**Impact**: Medium

**Mitigation**:
- Comprehensive beta testing
- Gradual rollout allows early detection
- Robust error handling and logging
- Feature flags for quick disable

**Contingency**:
- Hot-fix deployment process
- Rollback to previous percentage
- Document edge cases for future

### Risk 4: Cost Overrun

**Likelihood**: Low
**Impact**: Medium

**Mitigation**:
- Cost monitoring per phase
- Budget alerts configured
- API usage optimization
- Connection pre-warming to reduce API calls

**Contingency**:
- Pause rollout temporarily
- Optimize API usage
- Adjust retry logic
- Implement cost controls

---

## ✅ Rollout Checklist

### Pre-Rollout (Before Week 1)

- [ ] Beta testing completed successfully
- [ ] All P1 and critical P2 bugs resolved
- [ ] Load testing passed
- [ ] Security testing passed
- [ ] Documentation complete and reviewed
- [ ] Monitoring and alerting configured
- [ ] Feature flags implemented and tested
- [ ] Rollback procedures tested
- [ ] Team trained on rollout process
- [ ] Stakeholders informed of plan
- [ ] Emergency contacts list updated

### Each Phase Start

- [ ] Review previous phase metrics
- [ ] Conduct go/no-go meeting
- [ ] Update feature flag percentage
- [ ] Announce phase start to team
- [ ] Increase monitoring frequency
- [ ] Prepare rollback procedure
- [ ] Update stakeholders

### Each Phase End

- [ ] Review all success criteria
- [ ] Document issues and resolutions
- [ ] Analyze metrics and trends
- [ ] Conduct team retrospective
- [ ] Prepare status report
- [ ] Make go/no-go decision for next phase
- [ ] Update documentation with learnings

### Post-Rollout (After 100%)

- [ ] Monitor for 2 weeks continuously
- [ ] Decommission old system (if applicable)
- [ ] Optimize based on learnings
- [ ] Update documentation
- [ ] Conduct post-mortem meeting
- [ ] Share success metrics
- [ ] Plan next improvements
- [ ] Archive rollout artifacts

---

## 📚 Additional Resources

- [Beta Testing Plan](./BETA_TESTING_PLAN.md)
- [Deployment Runbook](./DEPLOYMENT_RUNBOOK.md)
- [Monitoring & Alerting Guide](./MONITORING_ALERTING.md)
- [Security Testing Checklist](./SECURITY_TESTING.md)

---

## 🎉 Rollout Success Criteria

**Final Success Declaration**:

The rollout is considered successful when:

1. ✅ 100% of traffic on new system for 2+ weeks
2. ✅ All technical metrics consistently meet targets
3. ✅ Zero P1 bugs, < 5 unresolved P2 bugs
4. ✅ Customer satisfaction maintained or improved
5. ✅ Team confident in system stability
6. ✅ Documentation complete and accurate
7. ✅ Old system decommissioned (if applicable)
8. ✅ Stakeholders satisfied with results

**When criteria met**: Celebrate the success, share learnings, and plan next features! 🚀
