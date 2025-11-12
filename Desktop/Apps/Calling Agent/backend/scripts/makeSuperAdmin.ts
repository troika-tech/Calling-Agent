import mongoose from 'mongoose';
import { User } from '../src/models/User';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

/**
 * Script to make the first user in the database a super admin
 * Usage: npx ts-node scripts/makeSuperAdmin.ts
 */
async function makeSuperAdmin() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI not found in environment variables');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Find the first user
    const user = await User.findOne().sort({ createdAt: 1 });

    if (!user) {
      console.log('No users found in the database');
      process.exit(1);
    }

    console.log(`\nFound user:`);
    console.log(`- Name: ${user.name}`);
    console.log(`- Email: ${user.email}`);
    console.log(`- Current Role: ${user.role}`);

    // Update to super_admin
    user.role = 'super_admin';
    await user.save();

    console.log(`\n✓ Successfully updated user to super_admin role`);
    console.log(`- Name: ${user.name}`);
    console.log(`- Email: ${user.email}`);
    console.log(`- New Role: ${user.role}`);

    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('Error making user super admin:', error);
    process.exit(1);
  }
}

makeSuperAdmin();
