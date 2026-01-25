import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: "https://alcester-578d6-default-rtdb.firebaseio.com/"
});
const db = getDatabase(app);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET') { return res.status(405).json({ error: 'Method not allowed' }); }

  try {
    const { clerkUserId } = req.query;
    if (!clerkUserId) {
      return res.status(400).json({ error: 'Missing clerkUserId' });
    }

    const mainformRef = db.ref('Mainformdata');
    const snapshot = await mainformRef.orderByChild('uid').equalTo(clerkUserId).once('value');

    let referrals = {};
    if (snapshot.exists()) {
      snapshot.forEach((child) => {
        if (child.val().referrals) {
          referrals = child.val().referrals;
        }
      });
    }

    // Calculate stats (EXACT same logic as original)
    let openedOnlyCount = 0;
    let formFilledCount = 0;
    for (const refId in referrals) {
      const referralData = referrals[refId];
      const fieldCount = Object.keys(referralData).length;

      if (fieldCount === 2 && referralData.status && referralData.timestamp) {
        openedOnlyCount++;
      } else if (referralData.name && referralData.status && referralData.timestamp) {
        formFilledCount++;
      }
    }

    const totalAmount = formFilledCount * 400;

    res.json({
      success: true,
      stats: {
        openedOnlyCount,
        formFilledCount,
        totalAmount,
        hasReferrals: Object.keys(referrals).length > 0
      }
    });
  } catch (error) {
    console.error('Referrals error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}
