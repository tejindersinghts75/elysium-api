import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { createClerkClient } from '@clerk/backend';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({ credential: cert(serviceAccount), databaseURL: "https://alcester-578d6-default-rtdb.firebaseio.com/" });
const db = getDatabase(app);
const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const { clerkUserId } = req.query;
    if (!clerkUserId) {
      return res.status(400).json({ paymentStatus: 'unknown' });
    }

    // Validate Clerk user
    await clerkClient.users.getUser(clerkUserId);

    // Check payment status
    const snapshot = await db.ref('Mainformdata').orderByChild('uid').equalTo(clerkUserId).once('value');
    if (!snapshot.exists()) {
      return res.json({ paymentStatus: 'no_data' });
    }

    let paymentStatus = 'no_data';
    snapshot.forEach(child => {
      const data = child.val();
      if (data.helcimpayment && data.helcimpayment.response === '1') {
        paymentStatus = 'success';
      } else if (data.helcimpayment && data.helcimpayment.response === '0') {
        paymentStatus = 'failed';
      }
    });

    res.json({ paymentStatus });
  } catch (error) {
    console.error('Payment status error:', error);
    res.status(500).json({ paymentStatus: 'error' });
  }
}
