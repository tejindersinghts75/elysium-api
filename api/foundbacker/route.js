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
  // 🔥 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    const snapshot = await db.ref('Mainformdata').once('value');
    const data = snapshot.val() || {};

    // 🔥 MINIMAL FIELDS ONLY
    const users = Object.entries(data).map(([id, user]) => ({
      id,
      name: user.name || '',
      email: user.email || '',
      mobile: user.mobile || ''
    }));

    res.json(users);
  }

  if (req.method === 'PATCH') {
    const form = formidable({ multiples: false });
    const [fields] = await form.parse(req);

    // 🔥 FIXED: Handle FormData array bug
    const userId = Array.isArray(fields.userId) ? fields.userId[0] : fields.userId;
    const isFounder = fields.isFounder === 'true';

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    // Update Firebase
    await db.ref(`Mainformdata/${userId}`).update({
      isFounder,
      founderUpdatedAt: Date.now()
    });

    res.json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
