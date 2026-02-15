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
     return;
  }

  if (req.method === 'PATCH') {
  const form = formidable({ multiples: false });
  const [fields] = await form.parse(req);

  const userId = Array.isArray(fields.userId) ? fields.userId[0] : fields.userId;
  const setFounder = fields.isFounder === 'true';

  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }

  // 🔥 EXPLICIT BOOLEAN CAST + FULL OBJECT
  const updateData = {
    isFounder: !!setFounder,  // Force boolean
    founderUpdatedAt: Date.now()
  };

  console.log('🔧 UPDATING:', userId, 'isFounder:', updateData.isFounder);

  await db.ref(`Mainformdata/${userId}`).update(updateData);

  // 🔍 VERIFY UPDATE WORKED
  const verify = await db.ref(`Mainformdata/${userId}/isFounder`).once('value');
  console.log('🔍 VERIFIED:', verify.val());

  res.json({
    success: true,
    userId,
    isFounder: !!setFounder,
    verified: verify.val()
  });
  return;  // 🔥 ADD THIS
}


  res.status(405).json({ error: 'Method not allowed' });
}
