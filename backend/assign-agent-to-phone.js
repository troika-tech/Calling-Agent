/**
 * Assign Agent to Phone Number
 * Run: node assign-agent-to-phone.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function assignAgent() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    // Get models
    const Phone = mongoose.model('Phone', new mongoose.Schema({
      number: String,
      agentId: mongoose.Schema.Types.ObjectId,
      userId: mongoose.Schema.Types.ObjectId,
      status: String,
      exotelData: mongoose.Schema.Types.Mixed
    }));

    const Agent = mongoose.model('Agent', new mongoose.Schema({
      name: String,
      userId: mongoose.Schema.Types.ObjectId,
      config: mongoose.Schema.Types.Mixed
    }));

    // Find the phone
    const phoneNumber = '+917948516111';
    const phone = await Phone.findOne({ number: phoneNumber });

    if (!phone) {
      console.log(`❌ Phone ${phoneNumber} not found in database!`);
      process.exit(1);
    }

    console.log(`Found phone: ${phone.number}`);
    console.log(`Current agent: ${phone.agentId || '❌ NOT ASSIGNED'}\n`);

    // List available agents for this user
    console.log('=== AVAILABLE AGENTS ===\n');
    const agents = await Agent.find({ userId: phone.userId });

    if (agents.length === 0) {
      console.log('❌ NO AGENTS FOUND FOR THIS USER!');
      console.log(`User ID: ${phone.userId}`);
      console.log('\nYou need to create an agent first via the UI or API.\n');
      await mongoose.connection.close();
      process.exit(1);
    }

    agents.forEach((agent, index) => {
      console.log(`Agent #${index + 1}:`);
      console.log(`  ID: ${agent._id}`);
      console.log(`  Name: ${agent.name}`);
      console.log(`  Voice: ${agent.config?.voice?.provider || 'N/A'}`);
      console.log(`  Language: ${agent.config?.language || 'N/A'}`);
      console.log('');
    });

    // Auto-assign the first agent
    const selectedAgent = agents[0];
    console.log(`\n✓ Assigning agent "${selectedAgent.name}" to phone ${phoneNumber}...`);

    phone.agentId = selectedAgent._id;
    await phone.save();

    console.log(`✓ Successfully assigned agent!\n`);
    console.log('Phone Configuration:');
    console.log(`  Number: ${phone.number}`);
    console.log(`  Agent: ${selectedAgent.name} (${selectedAgent._id})`);
    console.log(`  Status: ${phone.status}`);
    console.log(`  App ID: ${phone.exotelData?.appId || 'N/A'}`);
    console.log('');
    console.log('✓ Incoming calls should now work!');
    console.log('\nNext steps:');
    console.log('1. Make sure your Exotel Voicebot applet is configured with:');
    console.log(`   Webhook URL: ${process.env.WEBHOOK_BASE_URL}/api/v1/exotel/voice/connect`);
    console.log('2. Try making a test call to: +917948516111');
    console.log('3. Check server logs for webhook data\n');

    // Close connection
    await mongoose.connection.close();
    console.log('✓ Database connection closed');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

assignAgent();
