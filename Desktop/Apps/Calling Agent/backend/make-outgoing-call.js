/**
 * Make Outgoing Call via API
 * Run: node make-outgoing-call.js <phone_number>
 */

require('dotenv').config();
const axios = require('axios');
const mongoose = require('mongoose');

async function makeOutgoingCall(phoneNumber) {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    // Get Phone and Agent models
    const Phone = mongoose.model('Phone', new mongoose.Schema({
      _id: mongoose.Schema.Types.ObjectId,
      number: String,
      userId: mongoose.Schema.Types.ObjectId,
      exotelData: mongoose.Schema.Types.Mixed
    }));

    const Agent = mongoose.model('Agent', new mongoose.Schema({
      _id: mongoose.Schema.Types.ObjectId,
      name: String,
      userId: mongoose.Schema.Types.ObjectId
    }));

    const User = mongoose.model('User', new mongoose.Schema({
      _id: mongoose.Schema.Types.ObjectId,
      email: String
    }));

    // Find phone with Exotel configuration
    const phone = await Phone.findOne({
      $or: [
        { number: '+917948516111' },
        { number: '07948516111' }
      ]
    });

    if (!phone) {
      console.error('❌ Phone not found in database!');
      await mongoose.connection.close();
      process.exit(1);
    }

    console.log('Phone Configuration:');
    console.log(`  ID: ${phone._id}`);
    console.log(`  Number: ${phone.number}`);
    console.log(`  User ID: ${phone.userId}`);
    console.log(`  Has Exotel Config: ${!!phone.exotelData}`);
    console.log('');

    // Find agent for this user
    const agent = await Agent.findOne({ userId: phone.userId });

    if (!agent) {
      console.error('❌ No agent found for this user!');
      await mongoose.connection.close();
      process.exit(1);
    }

    console.log('Agent Configuration:');
    console.log(`  ID: ${agent._id}`);
    console.log(`  Name: ${agent.name}`);
    console.log('');

    // Prepare API request
    const apiUrl = 'https://calling-api.0804.in/api/v1/calls/outbound';

    const callData = {
      phoneNumber: phoneNumber.startsWith('+') ? phoneNumber : `+91${phoneNumber}`,
      phoneId: phone._id.toString(),
      agentId: agent._id.toString(),
      userId: phone.userId.toString(),
      metadata: {
        source: 'manual-script',
        timestamp: new Date().toISOString()
      }
    };

    console.log('=== INITIATING OUTGOING CALL ===\n');
    console.log('API URL:', apiUrl);
    console.log('Call Data:', JSON.stringify(callData, null, 2));
    console.log('\nMaking API request...\n');

    // Make API request
    const response = await axios.post(apiUrl, callData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('✓ Call initiated successfully!');
    console.log('');
    console.log('Response:');
    console.log('  Status:', response.status);
    console.log('  Data:', JSON.stringify(response.data, null, 2));
    console.log('');

    if (response.data.callLogId) {
      console.log(`✓ Call Log ID: ${response.data.callLogId}`);
      console.log(`✓ Exotel Call SID: ${response.data.exotelCallSid || 'Pending...'}`);
      console.log('');
      console.log('The call should now be connecting...');
      console.log(`Monitor call status at: https://calling-api.0804.in/api/v1/calls/${response.data.callLogId}`);
    }

    await mongoose.connection.close();
    console.log('\n✓ Database connection closed');

  } catch (error) {
    console.error('\n❌ Error making outgoing call:');

    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Error:', JSON.stringify(error.response.data, null, 2));

      if (error.response.status === 400) {
        console.error('\nValidation Error - Check:');
        console.error('- Phone number format (should be E.164: +919834699858)');
        console.error('- Phone ID exists in database');
        console.error('- Agent ID exists in database');
      } else if (error.response.status === 403) {
        console.error('\nPermission Error - Check:');
        console.error('- User has permission to use this phone');
        console.error('- Phone belongs to the user');
      } else if (error.response.status === 500) {
        console.error('\nServer Error - Check:');
        console.error('- Exotel API credentials are correct');
        console.error('- Server logs for detailed error');
      }
    } else if (error.code === 'ECONNREFUSED') {
      console.error('\n❌ Server not running!');
      console.error('Start the server first: npm run dev');
    } else {
      console.error('Error:', error.message);
      console.error(error.stack);
    }

    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
}

// Get phone number from command line or use default
const targetPhone = process.argv[2] || '9834699858';

console.log(`\n📞 Making outgoing call to: +91${targetPhone}\n`);
makeOutgoingCall(targetPhone);
