#!/bin/bash

# Script to clean up verbose logs and add focused campaign monitoring

echo "Cleaning up verbose logs..."

# 1. Remove debug logs from campaignCallsProcessor
sed -i '/logger\.debug/d' src/queues/processors/campaignCallsProcessor.ts

# 2. Remove verbose startup logs from services
sed -i '/logger\.debug/d' src/services/leaseJanitor.service.ts
sed -i '/logger\.debug/d' src/services/waitlistCompactor.service.ts
sed -i '/logger\.debug/d' src/services/bullmqReconciler.service.ts
sed -i '/logger\.debug/d' src/services/reconciliation.service.ts
sed -i '/logger\.debug/d' src/services/invariantMonitor.service.ts
sed -i '/logger\.debug/d' src/services/waitlist.service.ts

# 3. Remove debug logs from redisConcurrency.util
sed -i '/logger\.debug/d' src/utils/redisConcurrency.util.ts

# 4. Remove verbose logs from queue event handlers
sed -i '/logger\.debug/d' src/queues/campaignCalls.queue.ts

# 5. Remove debug logs from gracefulShutdown
sed -i '/logger\.debug/d' src/utils/gracefulShutdown.ts

echo "Logs cleaned up successfully!"