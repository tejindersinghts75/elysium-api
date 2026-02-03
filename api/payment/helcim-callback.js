import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { createClerkClient } from '@clerk/backend';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({ credential: cert(serviceAccount),
   //databaseURL: "https://alcester-578d6-default-rtdb.firebaseio.com/"
    databaseURL:process.env.FIREBASE_URL
  });
const db = getDatabase(app);
const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const { clerkUserId, response, responseMessage, xml, timestamp } = req.query;

    if (!clerkUserId) {
      return res.status(400).json({ error: 'Missing user ID' });
    }

    // Validate Clerk user
    await clerkClient.users.getUser(clerkUserId);

    // Find user's Mainformdata entry
    const snapshot = await db.ref('Mainformdata').orderByChild('uid').equalTo(clerkUserId).once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'User data not found' });
    }

    let entryKey = null;
    snapshot.forEach(child => {
      entryKey = child.key;
    });

    // Save Helcim payment result
    await db.ref(`Mainformdata/${entryKey}`).update({
      helcimpayment: {
        response: response || '0',
        responseMessage: responseMessage || '',
        xml: xml || '',
        timestamp: timestamp || Date.now().toISOString(),
        processedAt: Date.now()
      },
      paymentLastUpdated: Date.now()
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Helcim callback error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}
