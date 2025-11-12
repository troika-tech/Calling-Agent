import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { CallLog } from './src/models/CallLog.js';

dotenv.config();

async function checkApiResponse() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find a campaign call with transcript
    const call = await CallLog.findOne({
      'metadata.isCampaignCall': true,
      transcript: { $exists: true, $ne: [] }
    })
    .sort({ createdAt: -1 })
    .populate('agentId', 'name')
    .lean();

    if (!call) {
      console.log('No campaign calls with transcripts found');
      process.exit(0);
    }

    console.log('\n=== API Response Simulation ===');
    console.log('Call ID:', call._id);
    console.log('\nTranscript field exists:', !!call.transcript);
    console.log('Transcript array length:', call.transcript?.length || 0);
    console.log('\nFirst 2 transcript entries:');
    console.log(JSON.stringify(call.transcript?.slice(0, 2), null, 2));
    
    console.log('\nSummary field:', call.summary || 'NOT FOUND');
    console.log('\nMetadata.keyPoints:', call.metadata?.keyPoints || 'NOT FOUND');
    console.log('Metadata.sentiment:', call.metadata?.sentiment || 'NOT FOUND');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkApiResponse();
