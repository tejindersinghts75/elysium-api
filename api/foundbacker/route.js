import formidable from 'formidable';
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { createClerkClient } from '@clerk/backend';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: process.env.FIREBASE_URL
});
const db = getDatabase(app);

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

export default async function handler(req, res) {
  // 🔥 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-uid');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 🔥 TEMP: DISABLE ADMIN CHECK (for Webflow testing)
  // const adminUid = req.headers['x-admin-uid'];
  // if (!adminUid || adminUid !== process.env.ADMIN_UID) {
  //   return res.status(401).json({ error: 'Admin access required' });
  // }

  if (req.method === 'GET') {
    const snapshot = await db.ref('Mainformdata').once('value');
    const data = snapshot.val() || {};

    const users = Object.entries(data).map(([id, user]) => ({
      id,
      name: user.name || '',
      email: user.email || '',
      mobile: user.mobile || '',
      city: user.selectedCity || '',
      income: user.income || '',
      profession: user.profession || '',
      isFounder: user.isFounder || false,
      founderUpdatedAt: user.founderUpdatedAt || null
    }));

    res.json(users);
  }

  if (req.method === 'PATCH') {
    const form = formidable({ multiples: false });
    const [fields] = await form.parse(req);

    const { userId, isFounder } = fields;
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    // Update founder status
    await db.ref(`Mainformdata/${userId}`).update({
      isFounder: isFounder === 'true',
      founderUpdatedAt: Date.now()
    });

    res.json({ success: true, userId, isFounder: isFounder === 'true' });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
