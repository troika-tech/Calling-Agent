/**
 * List all agents with their IDs (simplified version)
 *
 * Usage:
 *   node list-agents-simple.js
 */

require('dotenv').config({ path: '../../.env' });
const { MongoClient } = require('mongodb');

async function listAgents() {
  let client;

  try {
    console.log('\n📡 Connecting to MongoDB...');

    client = new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 30000,
    });

    await client.connect();
    console.log('✅ Connected\n');

    const db = client.db();
    const collection = db.collection('agents');

    console.log('📋 Fetching agents...');
    const agents = await collection
      .find({}, { projection: { _id: 1, name: 1, isActive: 1 } })
      .sort({ createdAt: -1 })
      .toArray();

    if (agents.length === 0) {
      console.log('❌ No agents found\n');
      return;
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
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('📡 Disconnected from MongoDB\n');
    }
  }
}

listAgents();
