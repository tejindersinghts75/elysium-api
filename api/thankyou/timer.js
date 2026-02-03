// api/thankyou/timer.js (POST reset/expire)
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { createClerkClient } from '@clerk/backend';
import formidable from 'formidable'; // ADD THIS IMPORT

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({
  credential: cert(serviceAccount),
 // databaseURL: "https://alcester-578d6-default-rtdb.firebaseio.com/"
    databaseURL:process.env.FIREBASE_URL
});
const db = getDatabase(app);
const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export default async function handler(req, res) {
   res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');  // ✅ ADDED

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const form = formidable({ multiples: false });
    const [fields] = await form.parse(req);
    const body = {};
    for (const key of Object.keys(fields)) {
      body[key] = fields[key][0] || fields[key];
    }
    const { clerkUserId, action } = body; // ✅ CORRECT

    if (!clerkUserId) {
      return res.status(400).json({ error: 'Missing user ID' });
    }

    // Validate Clerk user
    await clerkClient.users.getUser(clerkUserId);

    // Find user's Mainformdata entry
    const mainformdataRef = db.ref('Mainformdata');
    const snapshot = await mainformdataRef.once('value');
    let entryKey = null;

    snapshot.forEach(child => {
      if (child.val().uid === clerkUserId) {
        entryKey = child.key;
      }
    });

    if (!entryKey) {
      return res.status(404).json({ error: 'No form data found' });
    }

    const timerRef = db.ref(`Mainformdata/${entryKey}`);

    if (action === 'reset') {
      const endTime = Math.floor(Date.now() / 1000) + (30 * 60);
      await timerRef.update({ endTime, timerExpired: false });
      return res.json({ endTime, timerExpired: false });
    }

    if (action === 'expire') {
      await timerRef.update({ timerExpired: true, endTime: null });
      return res.json({ timerExpired: true });
    }

    res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    console.error('Timer action error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}
