// Builds/updates MongoDB indexes for every model. Run after deploys that add indexes:
//   npm run db:indexes
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import * as models from '../src/models/index.js';

await connectDB();
for (const [name, Model] of Object.entries(models)) {
  // eslint-disable-next-line no-await-in-loop
  await Model.syncIndexes();
  console.log(`✓ ${name}`);
}
await mongoose.disconnect();
