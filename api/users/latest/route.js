// api/users/latest.js (DELETE route.js folder, create this file)
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: "https://alcester-578d6-default-rtdb.firebaseio.com/"
});
const db = getDatabase(app);

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
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

    res.json(users.reverse()); // Newest first
  } catch (error) {
    console.error('Users API error:', error);
    res.status(500).json([]);
  }
}
