/**
 * Test Incoming Webhook
 * Simulates an Exotel incoming call webhook to test the endpoint
 * Run: node test-incoming-webhook.js
 */

const axios = require('axios');

async function testWebhook() {
  try {
    console.log('Testing Incoming Call Webhook...\n');

    const webhookUrl = 'http://localhost:5000/api/v1/exotel/voice/connect';

    // Simulate Exotel webhook data for incoming call
    const webhookData = {
      CallSid: 'test_call_sid_' + Date.now(),
      CallFrom: '+919876543210',  // Caller's number
      CallTo: '+917948516111',     // Your registered Exotel number
      Direction: 'inbound',
      Status: 'ringing',
      // Note: No CustomField for incoming calls
    };

    console.log('Sending webhook request:');
    console.log('URL:', webhookUrl);
    console.log('Data:', JSON.stringify(webhookData, null, 2));
    console.log('\n---\n');

    // Test with POST (most common)
    const response = await axios.post(webhookUrl, webhookData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    console.log('✓ Webhook Response:', response.status, response.statusText);
    console.log('Response Data:', JSON.stringify(response.data, null, 2));

    if (response.data.url) {
      console.log('\n✓ SUCCESS! WebSocket URL returned:');
      console.log(response.data.url);
      console.log('\nThis means incoming calls should work!');
    } else {
      console.log('\n❌ ERROR: No WebSocket URL in response');
      console.log('Response:', response.data);
    }

  } catch (error) {
    console.error('\n❌ Webhook Test Failed:');

    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Error:', JSON.stringify(error.response.data, null, 2));

      if (error.response.status === 404) {
        console.error('\nThis means:');
        console.error('- Phone number not found in database, OR');
        console.error('- Agent not assigned to phone number');
        console.error('\nRun: node check-phones.js to verify configuration');
      }
    } else if (error.code === 'ECONNREFUSED') {
      console.error('\n❌ Server not running!');
      console.error('Start the server first: npm run dev');
    } else {
      console.error('Error:', error.message);
    }
  }
}

// Run test
testWebhook();
