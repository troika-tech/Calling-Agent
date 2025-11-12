/**
 * Test Setup Script
 * Creates test data (Agent and CallLog) for WebSocket testing
 *
 * Usage: node test-setup.js <userId>
 *
 * This will output Agent ID and Call Log ID that you can use in test-websocket.html
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Simple schema definitions (matching your models)
const agentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  config: {
    prompt: { type: String, required: true },
    voice: {
      provider: { type: String, required: true },
      voiceId: { type: String, required: true },
      model: String,
      settings: mongoose.Schema.Types.Mixed
    },
    language: { type: String, required: true, default: 'en' },
    llm: {
      model: { type: String, required: true, default: 'gpt-4' },
      temperature: { type: Number, default: 0.7 },
      maxTokens: Number
    },
    firstMessage: String,
    sessionTimeout: Number,
    flow: {
      userStartFirst: Boolean,
      interruption: { allowed: Boolean },
      responseDelay: Number
    }
  },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const callLogSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  phoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'Phone' },
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
  fromPhone: { type: String, required: true },
  toPhone: { type: String, required: true },
  direction: { type: String, enum: ['inbound', 'outbound'], required: true },
  status: { type: String, required: true },
  startTime: Date,
  endTime: Date,
  durationSec: Number,
  exotelCallSid: String,
  recordingUrl: String,
  transcript: [{
    speaker: String,
    text: String,
    timestamp: Date
  }],
  summary: String,
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

const Agent = mongoose.model('Agent', agentSchema);
const CallLog = mongoose.model('CallLog', callLogSchema);

async function createTestData(userId) {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Create test agent
    console.log('Creating test agent...');
    const agent = await Agent.create({
      userId: new mongoose.Types.ObjectId(userId),
      name: 'Test Voice Agent',
      config: {
        prompt: 'You are a helpful AI assistant. Be friendly and concise in your responses.',
        voice: {
          provider: 'elevenlabs',
          voiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel voice (ElevenLabs default)
          settings: {
            stability: 0.5,
            similarityBoost: 0.75
          }
        },
        language: 'en',
        llm: {
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 150
        },
        firstMessage: 'Hello! I am your AI assistant. How can I help you today?',
        flow: {
          userStartFirst: false,
          interruption: { allowed: true },
          responseDelay: 0
        }
      },
      isActive: true
    });

    console.log(`✓ Agent created!`);
    console.log(`  ID: ${agent._id}`);
    console.log(`  Name: ${agent.name}\n`);

    // Create test call log
    console.log('Creating test call log...');
    const callLog = await CallLog.create({
      sessionId: `test-session-${Date.now()}`,
      userId: new mongoose.Types.ObjectId(userId),
      agentId: agent._id,
      fromPhone: '+919876543210',
      toPhone: '+918888888888',
      direction: 'inbound',
      status: 'in-progress',
      startTime: new Date(),
      transcript: [],
      metadata: { test: true }
    });

    console.log(`✓ Call Log created!`);
    console.log(`  ID: ${callLog._id}`);
    console.log(`  Session: ${callLog.sessionId}\n`);

    // Output formatted for easy copy-paste
    console.log('═══════════════════════════════════════════════════════');
    console.log('COPY THESE IDs TO test-websocket.html:');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Agent ID:     ${agent._id}`);
    console.log(`Call Log ID:  ${callLog._id}`);
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('You can now:');
    console.log('1. Open test-websocket.html in your browser');
    console.log('2. Click "Connect" to establish WebSocket connection');
    console.log('3. Paste the Agent ID and Call Log ID above');
    console.log('4. Click "Initialize Session" to start the voice pipeline');
    console.log('5. Use "Send Text" or "Start Recording" to test the AI\n');

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Get userId from command line or use a test ID
const userId = process.argv[2];

if (!userId) {
  console.error('\nUsage: node test-setup.js <userId>');
  console.error('\nExample: node test-setup.js 507f1f77bcf86cd799439011\n');
  console.error('To get a user ID, you can:');
  console.error('1. Register a user via POST /api/v1/auth/register');
  console.error('2. Check your MongoDB users collection');
  console.error('3. Or create one manually in MongoDB Compass\n');
  process.exit(1);
}

// Validate ObjectId format
if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
  console.error('\nError: Invalid ObjectId format');
  console.error('ObjectId must be a 24-character hexadecimal string\n');
  process.exit(1);
}

createTestData(userId);
