// List all phone numbers in database
// Run with: node list-phones.js

require('./backend/node_modules/dotenv').config({ path: '../../.env' });
const mongoose = require('./backend/node_modules/mongoose');

const Phone = mongoose.model('Phone', new mongoose.Schema({}, { strict: false }));

async function listPhones() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const phones = await Phone.find();
    console.log(`Found ${phones.length} phone number(s):\n`);

    phones.forEach((phone, index) => {
      console.log(`${index + 1}. Phone: "${phone.number}"`);
      console.log(`   ID: ${phone._id}`);
      console.log(`   Agent: ${phone.agentId ? phone.agentId.toString() : 'NOT ASSIGNED'}`);
      console.log(`   Status: ${phone.status}`);
      console.log(`   Country: ${phone.country}`);
      console.log('');
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

listPhones();
