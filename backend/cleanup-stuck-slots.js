/**
 * Cleanup script for stuck Redis slots
 * Usage: node cleanup-stuck-slots.js <campaignId>
 */

const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null
});

async function cleanupStuckSlots(campaignId) {
  console.log(`\n🧹 Cleaning up stuck slots for campaign: ${campaignId}`);

  const setKey = `campaign:{${campaignId}}:leases`;
  const reservedKey = `campaign:{${campaignId}}:reserved`;
  const ledgerKey = `campaign:{${campaignId}}:reserved:ledger`;

  // Check current state
  console.log('\n📊 Current state:');
  const [inflight, reserved, ledgerSize] = await Promise.all([
    redis.scard(setKey),
    redis.get(reservedKey).then(v => parseInt(v || '0')),
    redis.zcard(ledgerKey)
  ]);

  console.log(`- Inflight calls: ${inflight}`);
  console.log(`- Reserved slots: ${reserved}`);
  console.log(`- Ledger size: ${ledgerSize}`);

  // Get all lease members
  const members = await redis.smembers(setKey);
  console.log(`\n🔍 Found ${members.length} lease members:`, members);

  // Check each lease key
  let cleaned = 0;
  for (const member of members) {
    const leaseKey = `campaign:{${campaignId}}:lease:${member}`;
    const token = await redis.get(leaseKey);
    console.log(`  - ${member}: token=${token}`);

    // Delete lease key and remove from SET
    await redis.del(leaseKey);
    await redis.srem(setKey, member);
    cleaned++;
  }

  console.log(`\n✅ Cleaned up ${cleaned} stuck leases`);

  // Verify final state
  console.log('\n📊 Final state:');
  const [finalInflight, finalReserved] = await Promise.all([
    redis.scard(setKey),
    redis.get(reservedKey).then(v => parseInt(v || '0'))
  ]);

  console.log(`- Inflight calls: ${finalInflight}`);
  console.log(`- Reserved slots: ${finalReserved}`);

  await redis.quit();
  console.log('\n✨ Done!\n');
}

const campaignId = process.argv[2];
if (!campaignId) {
  console.error('Usage: node cleanup-stuck-slots.js <campaignId>');
  process.exit(1);
}

cleanupStuckSlots(campaignId).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
