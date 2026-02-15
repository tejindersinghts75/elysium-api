import formidable from 'formidable';
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: process.env.FIREBASE_URL
});
const db = getDatabase(app);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    try {
      const snapshot = await db.ref('Mainformdata').once('value');
      const data = snapshot.val() || {};

      const users = Object.entries(data).map(([id, user]) => ({
        id,
        name: user.name || '',
        email: user.email || '',
        mobile: user.mobile || '',
        isFounder: (user.isFounder == 1 || user.isFounder === true)  // Handle both
      }));

      res.json(users);
    } catch (error) {
      console.error('GET error:', error);
      res.status(500).json({ error: 'Server error' });
    }
    return;
  }

  if (req.method === 'PATCH') {
    try {
      const form = formidable({ multiples: false });
      const [fields] = await form.parse(req);

      const userId = Array.isArray(fields.userId) ? fields.userId[0] : fields.userId;
      const setFounder = fields.isFounder === 'true';

      if (!userId) {
        return res.status(400).json({ error: 'userId required' });
      }

      // 🔥 FULL READ → MODIFY → WRITE (Bulletproof)
      const snapshot = await db.ref(`Mainformdata/${userId}`).once('value');
      const currentData = snapshot.val() || {};

      // Preserve ALL existing data + update founder
      currentData.isFounder = setFounder ? 1 : 0;  // Numbers fix boolean bug
      currentData.founderUpdatedAt = Date.now();

      console.log(`🔧 ${userId}: isFounder=${currentData.isFounder}`);

      await db.ref(`Mainformdata/${userId}`).set(currentData);

      // Verify
      const verify = await db.ref(`Mainformdata/${userId}/isFounder`).once('value');
      console.log(`🔍 VERIFIED ${userId}:`, verify.val());

      res.json({
        success: true,
        userId,
        isFounder: setFounder,
        verified: verify.val() == 1
      });
    } catch (error) {
      console.error('PATCH error:', error);
      res.status(500).json({ error: 'Server error' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
