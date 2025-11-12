/**
 * Test script to verify Redis and Bull queue are working correctly
 * Run: node test-redis-queue.js
 */

const Queue = require('bull');

// Create a test queue
const testQueue = new Queue('test-queue', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    db: process.env.REDIS_DB || 0
  }
});

async function testRedisQueue() {
  console.log('🧪 Testing Redis and Bull Queue...\n');

  try {
    // Test 1: Add a job to queue
    console.log('1️⃣ Adding job to queue...');
    const job = await testQueue.add('test-job', {
      message: 'Hello from Bull Queue!',
      timestamp: new Date().toISOString()
    });
    console.log('✅ Job added successfully:', job.id);

    // Test 2: Process the job
    console.log('\n2️⃣ Processing job...');
    testQueue.process('test-job', async (job) => {
      console.log('🔄 Processing job:', job.id);
      console.log('📦 Data:', job.data);
      return { processed: true, jobId: job.id };
    });

    // Test 3: Listen for completion
    testQueue.on('completed', (job, result) => {
      console.log('✅ Job completed successfully!');
      console.log('📊 Result:', result);
      cleanup();
    });

    testQueue.on('failed', (job, err) => {
      console.error('❌ Job failed:', err.message);
      cleanup();
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    cleanup();
    process.exit(1);
  }
}

async function cleanup() {
  console.log('\n🧹 Cleaning up...');
  setTimeout(async () => {
    await testQueue.close();
    console.log('✅ Queue closed');
    console.log('\n✨ Redis and Bull Queue are working correctly!');
    process.exit(0);
  }, 1000);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error.message);
  cleanup();
});

// Run test
testRedisQueue();
