// api/users/latest.js (NEW FILE - PAGES ROUTER)
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({
  credential: cert(serviceAccount),
  //databaseURL: "https://alcester-578d6-default-rtdb.firebaseio.com/"
  databaseURL:process.env.FIREBASE_URL
});
const db = getDatabase(app);

export default async function handler(req, res) {
  // 🔥 CORS HEADERS (FIXES CORS ERROR)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const snapshot = await db.ref('users')
      .orderByChild('createdAt')
      .limitToLast(10)
      .once('value');

    const users = [];
    snapshot.forEach(child => {
      const user = child.val();
      users.push({
        firstname: user.firstname || 'User',
        lastname: user.lastname || ''
      });
    });

    console.log(`✅ Returning ${users.length} users`);
    res.json(users.reverse()); // Newest first

  } catch (error) {
    console.error('Users API error:', error);
    res.status(500).json([]);
  }
}
