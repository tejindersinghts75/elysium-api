// api/thankyou/timer-status.js (GET status)
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { createClerkClient } from '@clerk/backend';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: "https://alcester-578d6-default-rtdb.firebaseio.com/"
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

  try {
    const { clerkUserId } = req.query;

    if (!clerkUserId) {
      return res.status(400).json({ endTime: 0, timerExpired: true });
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
      return res.status(404).json({ endTime: 0, timerExpired: true });
    }

    const timerRef = db.ref(`Mainformdata/${entryKey}`);
    const data = await timerRef.once('value');
    const timerData = data.val();

    let endTime = timerData?.endTime;
    let timerExpired = timerData?.timerExpired || false;

    // Initialize if first visit
    if (!endTime) {
      endTime = Math.floor(Date.now() / 1000) + (30 * 60);
      await timerRef.update({ endTime, timerExpired: false });
    }

    res.json({ endTime, timerExpired });
  } catch (error) {
    console.error('Timer status error:', error);
    res.status(500).json({ endTime: 0, timerExpired: true });
  }
}
