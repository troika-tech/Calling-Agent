/**
 * Setup Test Data for Exotel Voice Bot
 * Creates: User → Agent → Phone → Assigns Agent to Phone
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Connect to MongoDB
async function setup() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Define schemas
    const userSchema = new mongoose.Schema({
      email: String,
      password: String,
      name: String,
      isActive: { type: Boolean, default: true }
    }, { timestamps: true });

    const agentSchema = new mongoose.Schema({
      userId: mongoose.Schema.Types.ObjectId,
      name: String,
      config: {
        prompt: String,
        voice: {
          provider: String,
          voiceId: String,
          settings: mongoose.Schema.Types.Mixed
        },
        language: String,
        llm: {
          model: String,
          temperature: Number,
          maxTokens: Number
        },
        firstMessage: String
      },
      isActive: { type: Boolean, default: true }
    }, { timestamps: true });

    const phoneSchema = new mongoose.Schema({
      userId: mongoose.Schema.Types.ObjectId,
      agentId: mongoose.Schema.Types.ObjectId,
      number: String,
      country: String,
      provider: String,
      status: String,
      exotelData: mongoose.Schema.Types.Mixed
    }, { timestamps: true });

    const User = mongoose.model('User', userSchema);
    const Agent = mongoose.model('Agent', agentSchema);
    const Phone = mongoose.model('Phone', phoneSchema);

    // 1. Create User
    console.log('1. Creating user...');
    let user = await User.findOne({ email: 'admin@calling-agent.com' });

    if (!user) {
      const hashedPassword = await bcrypt.hash('Admin@1234', 10);
      user = await User.create({
        email: 'admin@calling-agent.com',
        password: hashedPassword,
        name: 'Admin User',
        isActive: true
      });
      console.log(`✅ User created: ${user.email}`);
    } else {
      console.log(`✅ User already exists: ${user.email}`);
    }
    console.log(`   User ID: ${user._id}\n`);

    // 2. Create Agent
    console.log('2. Creating AI agent...');
    let agent = await Agent.findOne({ userId: user._id, name: 'Customer Support AI' });

    if (!agent) {
      agent = await Agent.create({
        userId: user._id,
        name: 'Customer Support AI',
        config: {
          prompt: 'You are a helpful and friendly AI customer support assistant. Keep your responses concise and helpful. Always be polite and professional.',
          voice: {
            provider: 'elevenlabs',
            voiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel voice
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
          firstMessage: 'Hello! Thank you for calling. I am your AI assistant. How may I help you today?'
        },
        isActive: true
      });
      console.log(`✅ Agent created: ${agent.name}`);
    } else {
      console.log(`✅ Agent already exists: ${agent.name}`);
    }
    console.log(`   Agent ID: ${agent._id}\n`);

    // 3. Create/Update Phone
    console.log('3. Setting up phone number...');
    const phoneNumber = '07948516111';
    let phone = await Phone.findOne({ number: phoneNumber });

    if (!phone) {
      phone = await Phone.create({
        userId: user._id,
        agentId: agent._id,
        number: phoneNumber,
        country: 'IN',
        provider: 'exotel',
        status: 'active',
        exotelData: {
          sid: process.env.EXOTEL_SID || 'your-exotel-sid',
          appId: 'voice-bot-app'
        }
      });
      console.log(`✅ Phone created: ${phoneNumber}`);
    } else {
      // Update phone to assign agent
      phone.userId = user._id;
      phone.agentId = agent._id;
      phone.status = 'active';
      await phone.save();
      console.log(`✅ Phone updated: ${phoneNumber}`);
    }
    console.log(`   Phone ID: ${phone._id}`);
    console.log(`   Assigned Agent: ${agent.name}\n`);

    // Summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ SETUP COMPLETE!');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`User Email:    admin@calling-agent.com`);
    console.log(`User Password: Admin@1234`);
    console.log(`User ID:       ${user._id}`);
    console.log(``);
    console.log(`Agent Name:    ${agent.name}`);
    console.log(`Agent ID:      ${agent._id}`);
    console.log(``);
    console.log(`Phone Number:  ${phoneNumber}`);
    console.log(`Phone ID:      ${phone._id}`);
    console.log(`Agent Assigned: YES`);
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('📞 Ready to Test!');
    console.log(`Call ${phoneNumber} from 09834699858 and the AI will answer!\n`);

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

setup();
