// Quick script to activate agent
// Run with: node activate-agent.js

require('./backend/node_modules/dotenv').config({ path: '../../.env' });
const mongoose = require('./backend/node_modules/mongoose');

const Agent = mongoose.model('Agent', new mongoose.Schema({}, { strict: false }));

async function activateAgent() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find the agent and activate
    const agent = await Agent.findOne({ name: 'Customer Support Agent' });
    if (!agent) {
      console.error('Agent not found');
      process.exit(1);
    }

    console.log('Found agent:', agent.name);
    console.log('Current status:', agent.config?.isActive ? 'active' : 'inactive');

    // Activate the agent
    if (!agent.config) {
      agent.config = {};
    }
    agent.config.isActive = true;
    agent.markModified('config');
    await agent.save();

    console.log('Agent activated successfully!');
    console.log('New status: active');

    await mongoose.disconnect();
    console.log('Done!');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

activateAgent();
