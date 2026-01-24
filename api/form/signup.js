import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: "https://alcester-578d6-default-rtdb.firebaseio.com/"  // YOUR URL!
});
const db = getDatabase(app);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { name, email } = req.body;
    const timestampKey = Date.now().toString();
    const userId = `test_${timestampKey}`;

    await db.ref(`Mainformdata/${timestampKey}`).set({
      uid: userId,
      name: name || 'Test User',
      email: email || 'test@example.com',
      createdAt: Date.now()
    });

    res.json({
      success: true,
      userId,
      redirect: '/thank-you',
      message: 'FULL STACK WORKING PERFECTLY!'
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}
