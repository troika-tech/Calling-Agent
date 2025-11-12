/**
 * List all agents with their IDs
 *
 * Usage:
 *   node list-agents.js
 */

require('dotenv').config({ path: '../../.env' });
const mongoose = require('mongoose');

async function listAgents() {
  try {
    console.log('\n📡 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 30000,
      bufferCommands: false,
    });
    console.log('✅ Connected\n');

    // Load Agent model after connection
    const { Agent } = require('./backend/dist/models/Agent');

    console.log('📋 Fetching agents...');
    const agents = await Agent.find({}, { _id: 1, name: 1, isActive: 1 }).sort({ createdAt: -1 }).lean().exec();

    if (agents.length === 0) {
      console.log('❌ No agents found\n');
      process.exit(0);
    }

    console.log('🤖 Available Agents:\n');
    agents.forEach((agent, i) => {
      const status = agent.isActive ? '✅' : '❌';
      console.log(`  ${i + 1}. ${status} ${agent.name}`);
      console.log(`     ID: ${agent._id}\n`);
    });

    console.log(`Total: ${agents.length} agent(s)\n`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('📡 Disconnected from MongoDB\n');
  }
}

listAgents();
