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
    const snapshot = await db.ref('Mainformdata').once('value');
    const data = snapshot.val() || {};

    const users = Object.entries(data).map(([id, user]) => ({
      id,
      name: user.name || '',
      email: user.email || '',
      mobile: user.mobile || '',
      isFounder: user.isFounder === 'true'  // 🔥 STRING → BOOLEAN
    }));

    res.json(users);
    return;
  }

  if (req.method === 'PATCH') {
  const form = formidable({ multiples: false });
  const [fields] = await form.parse(req);

  const userId = Array.isArray(fields.userId) ? fields.userId[0] : fields.userId;
  const isFounderString = fields.isFounder;  // Keep as-is

  // 🔥 FIXED VALIDATION
  if (!userId || isFounderString !== 'true' && isFounderString !== 'false') {
    return res.status(400).json({ error: 'Invalid userId or isFounder' });
  }

  await db.ref(`Mainformdata/${userId}`).update({
    isFounder: isFounderString,  // "true" or "false"
    founderUpdatedAt: Date.now()
  });

  res.json({ success: true, userId, isFounder: isFounderString });
  return;
}


  res.status(405).json({ error: 'Method not allowed' });
}
