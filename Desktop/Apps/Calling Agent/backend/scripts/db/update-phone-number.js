// Update phone number to correct format
// Run with: node update-phone-number.js

require('./backend/node_modules/dotenv').config({ path: '../../.env' });
const mongoose = require('./backend/node_modules/mongoose');

const Phone = mongoose.model('Phone', new mongoose.Schema({}, { strict: false }));

async function updatePhoneNumber() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Find and update using updateOne
    const result = await Phone.updateOne(
      { number: '+917948516111' },
      { $set: { number: '07948516111' } }
    );

    console.log('Update result:', result);

    if (result.modifiedCount > 0) {
      console.log('\n✓ Phone number updated successfully!');
      console.log('✓ New format: 07948516111');

      // Verify
      const phone = await Phone.findOne({ number: '07948516111' });
      if (phone) {
        console.log('✓ Verified in database');
        console.log('  Agent ID:', phone.agentId?.toString());
        console.log('  Status:', phone.status);
      }
    } else {
      console.log('\n✗ No changes made');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    if (error.code === 11000) {
      console.log('\nDuplicate key error - phone number 07948516111 already exists');
      console.log('Checking if we need to remove the old +91 format...');
    }
    process.exit(1);
  }
}

updatePhoneNumber();
