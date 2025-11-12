/**
 * Update agent to use Deepgram TTS for faster responses
 *
 * Run with: node update-agent-to-deepgram.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// Agent schema
const agentSchema = new mongoose.Schema({
  name: String,
  config: {
    voice: {
      provider: String,
      voiceId: String
    }
  }
});

const Agent = mongoose.model('Agent', agentSchema);

async function updateAgents() {
  try {
    // Find all agents using elevenlabs
    const agents = await Agent.find({ 'config.voice.provider': 'elevenlabs' });

    console.log(`\n📋 Found ${agents.length} agents using ElevenLabs\n`);

    for (const agent of agents) {
      console.log(`🔄 Updating agent: ${agent.name}`);
      console.log(`   Old provider: ${agent.config.voice.provider}`);
      console.log(`   Old voice: ${agent.config.voice.voiceId}`);

      // Update to Deepgram
      agent.config.voice.provider = 'deepgram';
      agent.config.voice.voiceId = 'aura-asteria-en'; // Female voice, similar quality to ElevenLabs

      await agent.save();

      console.log(`   ✅ New provider: ${agent.config.voice.provider}`);
      console.log(`   ✅ New voice: ${agent.config.voice.voiceId}\n`);
    }

    console.log(`\n✅ Successfully updated ${agents.length} agents to Deepgram TTS`);
    console.log(`\n💰 Cost savings: 10× cheaper ($0.030 vs $0.30 per 1000 chars)`);
    console.log(`⚡ Speed improvement: Sub-200ms TTFB vs 1400ms\n`);

  } catch (error) {
    console.error('❌ Error updating agents:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

updateAgents();
