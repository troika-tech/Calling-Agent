// Quick script to add phone number to database
// Run with: node add-phone-number.js

require('./backend/node_modules/dotenv').config({ path: '../../.env' });
const mongoose = require('./backend/node_modules/mongoose');

// Phone Schema
const phoneSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    number: { type: String, required: true, trim: true },
    country: { type: String, required: true, uppercase: true },
    provider: { type: String, required: true, enum: ['exotel'], default: 'exotel' },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
    tags: { type: [String], default: [] },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    exotelData: {
      apiKey: String,
      apiToken: String,
      sid: String,
      subdomain: String
    }
  },
  { timestamps: true }
);

const Phone = mongoose.model('Phone', phoneSchema);
const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
const Agent = mongoose.model('Agent', new mongoose.Schema({}, { strict: false }));

async function addPhoneNumber() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get the first admin user
    const user = await User.findOne({ role: { $in: ['admin', 'super_admin'] } });
    if (!user) {
      console.error('No admin user found. Please create an admin user first.');
      process.exit(1);
    }
    console.log('Found user:', user.email);

    // Get any agent (active or not)
    const agent = await Agent.findOne();
    if (!agent) {
      console.error('No agent found. Please create an agent first.');
      process.exit(1);
    }
    console.log('Found agent:', agent.name, '- Status:', agent.config?.isActive ? 'active' : 'inactive');

    // Check if phone already exists
    const existing = await Phone.findOne({ number: '07948516111' });
    if (existing) {
      console.log('Phone number already exists. Updating...');
      existing.agentId = agent._id;
      existing.status = 'active';
      await existing.save();
      console.log('Phone number updated successfully!');
    } else {
      // Add new phone number
      const phone = await Phone.create({
        userId: user._id,
        number: '07948516111',
        country: 'IN',
        provider: 'exotel',
        agentId: agent._id,
        tags: ['test'],
        status: 'active',
        exotelData: {
          apiKey: process.env.EXOTEL_API_KEY || 'your_api_key',
          apiToken: process.env.EXOTEL_API_TOKEN || 'your_api_token',
          sid: process.env.EXOTEL_SID || 'your_sid',
          subdomain: process.env.EXOTEL_SUBDOMAIN || 'api.exotel.com'
        }
      });

      console.log('Phone number added successfully!');
      console.log('Phone:', phone.number);
      console.log('Assigned to agent:', agent.name);
    }

    await mongoose.disconnect();
    console.log('Done!');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

addPhoneNumber();
