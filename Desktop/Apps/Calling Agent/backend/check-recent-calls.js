/**
 * Check Recent Call Logs
 * Run: node check-recent-calls.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function checkRecentCalls() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    // Get CallLog model
    const CallLog = mongoose.model('CallLog', new mongoose.Schema({
      sessionId: String,
      fromPhone: String,
      toPhone: String,
      direction: String,
      status: String,
      exotelCallSid: String,
      agentId: mongoose.Schema.Types.ObjectId,
      userId: mongoose.Schema.Types.ObjectId,
      startedAt: Date,
      createdAt: Date
    }));

    // Get recent calls (last 10)
    console.log('=== RECENT CALL LOGS (Last 10) ===\n');
    const calls = await CallLog.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    if (calls.length === 0) {
      console.log('❌ No call logs found in database!');
    } else {
      calls.forEach((call, index) => {
        console.log(`Call #${index + 1}:`);
        console.log(`  ID: ${call._id}`);
        console.log(`  From: ${call.fromPhone}`);
        console.log(`  To: ${call.toPhone}`);
        console.log(`  Direction: ${call.direction}`);
        console.log(`  Status: ${call.status}`);
        console.log(`  Exotel SID: ${call.exotelCallSid || 'N/A'}`);
        console.log(`  Agent ID: ${call.agentId || 'N/A'}`);
        console.log(`  Created: ${call.createdAt || call.startedAt}`);
        console.log('');
      });

      // Check for test call
      const testCall = calls.find(c => c.exotelCallSid?.includes('test_call_sid'));
      if (testCall) {
        console.log('✓ Test webhook call log found!');
        console.log(`  ID: ${testCall._id}`);
        console.log(`  This confirms the webhook is creating call logs correctly.\n`);
      }

      // Statistics
      const inboundCalls = calls.filter(c => c.direction === 'inbound');
      const outboundCalls = calls.filter(c => c.direction === 'outbound');

      console.log('=== STATISTICS ===');
      console.log(`Total calls: ${calls.length}`);
      console.log(`Inbound: ${inboundCalls.length}`);
      console.log(`Outbound: ${outboundCalls.length}`);
    }

    await mongoose.connection.close();
    console.log('\n✓ Database connection closed');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkRecentCalls();
