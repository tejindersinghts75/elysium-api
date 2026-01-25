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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }

  try {
    const body = await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => data += chunk);
      req.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON')); }
      });
    });

    const { clerkUserId, unit } = body;
    if (!clerkUserId || !unit) {
      return res.status(400).json({ error: 'Missing clerkUserId or unit' });
    }

    const mainformRef = db.ref('Mainformdata');
    const snapshot = await mainformRef.orderByChild('uid').equalTo(clerkUserId).once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'User mainformdata not found' });
    }

    let updated = false;
    snapshot.forEach((child) => {
      const entryKey = child.key;
      const existingData = child.val().PaymentFormData || {};
      db.ref(`Mainformdata/${entryKey}/PaymentFormData`).update({
        ...existingData,
        unit,
        updatedAt: Date.now()
      });
      updated = true;
    });

    res.json({ success: true, message: updated ? 'Preferences updated' : 'No data updated' });
  } catch (error) {
    console.error('Preferences update error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}
