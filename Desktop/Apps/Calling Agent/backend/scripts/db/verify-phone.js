// Verify phone number configuration
// Run with: node verify-phone.js

require('./backend/node_modules/dotenv').config({ path: '../../.env' });
const mongoose = require('./backend/node_modules/mongoose');

const Phone = mongoose.model('Phone', new mongoose.Schema({}, { strict: false, strictPopulate: false }));
const Agent = mongoose.model('Agent', new mongoose.Schema({}, { strict: false }));

async function verifyPhone() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Find phone
    const phone = await Phone.findOne({ number: '07948516111' });

    if (!phone) {
      console.error('Phone number not found!');
      process.exit(1);
    }

    console.log('=== PHONE CONFIGURATION ===');
    console.log('Phone Number:', phone.number);
    console.log('Country:', phone.country);
    console.log('Provider:', phone.provider);
    console.log('Status:', phone.status);
    console.log('Agent ID:', phone.agentId?.toString() || 'NOT ASSIGNED');
    console.log('');

    if (phone.agentId) {
      // Manually fetch agent
      const agent = await Agent.findById(phone.agentId);
      console.log('=== ASSIGNED AGENT ===');
      console.log('Agent Name:', agent.name);
      console.log('Agent Status:', agent.config?.isActive ? 'ACTIVE ✓' : 'INACTIVE ✗');
      console.log('Description:', agent.description || 'N/A');
      console.log('Voice Provider:', agent.config?.voice?.provider || 'N/A');
      console.log('Voice ID:', agent.config?.voice?.voiceId || 'N/A');
      console.log('LLM Model:', agent.config?.llm?.model || 'N/A');
      console.log('Language:', agent.config?.language || 'N/A');
      console.log('');

      if (agent.config?.isActive && phone.status === 'active') {
        console.log('✓ Phone is ready to receive calls!');
      } else {
        console.log('✗ WARNING: Phone or agent is not active');
        if (!agent.config?.isActive) {
          console.log('  - Agent is inactive');
        }
        if (phone.status !== 'active') {
          console.log('  - Phone status is:', phone.status);
        }
      }
    } else {
      console.log('✗ No agent assigned to this phone!');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

verifyPhone();
