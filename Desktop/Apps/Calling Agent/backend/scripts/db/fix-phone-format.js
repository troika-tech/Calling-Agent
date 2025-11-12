// Fix phone number format to match Exotel incoming format
// Run with: node fix-phone-format.js

require('./backend/node_modules/dotenv').config({ path: '../../.env' });
const mongoose = require('./backend/node_modules/mongoose');

const Phone = mongoose.model('Phone', new mongoose.Schema({}, { strict: false }));

async function fixPhoneFormat() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Find the phone with +91 format
    const phone = await Phone.findOne({ number: '+917948516111' });

    if (!phone) {
      console.error('Phone number +917948516111 not found!');
      process.exit(1);
    }

    console.log('Found phone:', phone.number);
    console.log('Agent assigned:', phone.agentId ? 'YES' : 'NO');
    console.log('');

    // Update to match Exotel incoming format (07948516111)
    phone.number = '07948516111';
    await phone.save();

    console.log('✓ Phone number updated to: 07948516111');
    console.log('✓ This now matches the format Exotel sends');
    console.log('');
    console.log('Phone is ready to receive calls!');

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

fixPhoneFormat();
