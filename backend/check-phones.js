/**
 * Check Phone Configuration in Database
 * Run: node check-phones.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function checkPhones() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    // Get Phone model
    const phoneSchema = new mongoose.Schema({
      number: String,
      agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      status: String,
      exotelData: mongoose.Schema.Types.Mixed
    });
    const Phone = mongoose.model('Phone', phoneSchema);

    // Get Agent model
    const agentSchema = new mongoose.Schema({
      name: String
    });
    const Agent = mongoose.model('Agent', agentSchema);

    // Fetch all phones
    console.log('=== PHONE NUMBERS IN DATABASE ===\n');
    const phones = await Phone.find({}).lean();

    // Manually fetch agents for each phone
    for (let phone of phones) {
      if (phone.agentId) {
        const agent = await Agent.findById(phone.agentId);
        phone.agent = agent;
      }
    }

    if (phones.length === 0) {
      console.log('❌ NO PHONES FOUND IN DATABASE!');
      console.log('This is why incoming calls are failing.\n');
      console.log('You need to add your phone number to the database.');
      console.log('Run: npm run setup-test-data (if available) or add via API/UI\n');
    } else {
      phones.forEach((phone, index) => {
        console.log(`Phone #${index + 1}:`);
        console.log(`  Number: ${phone.number}`);
        console.log(`  Status: ${phone.status}`);
        console.log(`  Agent ID: ${phone.agentId || '❌ NOT ASSIGNED'}`);
        console.log(`  Agent Name: ${phone.agent ? phone.agent.name : '❌ NOT FOUND'}`);
        console.log(`  User ID: ${phone.userId || 'N/A'}`);
        console.log(`  Has Exotel Config: ${!!phone.exotelData}`);
        if (phone.exotelData) {
          console.log(`    - SID: ${phone.exotelData.sid || 'N/A'}`);
          console.log(`    - App ID: ${phone.exotelData.appId || '❌ NOT SET (needed for outbound)'}`);
        }
        console.log('');
      });

      console.log('\n=== RECOMMENDATIONS ===\n');

      // Check for phones without agents
      const phonesWithoutAgent = phones.filter(p => !p.agentId);
      if (phonesWithoutAgent.length > 0) {
        console.log('❌ Phones without agent assigned:');
        phonesWithoutAgent.forEach(p => console.log(`   - ${p.number}`));
        console.log('');
      }

      // Check for phones with agentId but agent not found
      const phonesWithInvalidAgent = phones.filter(p => p.agentId && !p.agent);
      if (phonesWithInvalidAgent.length > 0) {
        console.log('❌ Phones with invalid agent reference:');
        phonesWithInvalidAgent.forEach(p => console.log(`   - ${p.number} (Agent ID: ${p.agentId})`));
        console.log('');
      }

      // Check for phones without appId
      const phonesWithoutAppId = phones.filter(p => !p.exotelData?.appId);
      if (phonesWithoutAppId.length > 0) {
        console.log('⚠️  Phones without App ID (outbound calls won\'t work):');
        phonesWithoutAppId.forEach(p => console.log(`   - ${p.number}`));
        console.log('');
      }

      console.log('\n=== EXOTEL WEBHOOK CONFIGURATION ===\n');
      console.log('For incoming calls to work, configure your Exotel Voicebot applet:');
      console.log('');
      console.log('1. Login to Exotel Dashboard');
      console.log('2. Go to: Applets > Voicebot Applets');
      console.log('3. Create/Edit your Voicebot applet');
      console.log('4. Set Webhook URL to:');
      console.log(`   ${process.env.WEBHOOK_BASE_URL || 'https://your-domain.com'}/api/v1/exotel/voice/connect`);
      console.log('5. Configure this applet on your phone number');
      console.log('');
      console.log('Expected phone numbers in webhook:');
      phones.forEach(p => {
        console.log(`   - ${p.number}`);
      });
    }

    // Close connection
    await mongoose.connection.close();
    console.log('\n✓ Database connection closed');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkPhones();
