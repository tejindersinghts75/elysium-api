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
    if (!clerkUserId) return res.status(400).json({ error: 'Missing clerkUserId' });

    // User profile
    const userRef = db.ref(`users/${clerkUserId}`);
    const userSnapshot = await userRef.once('value');

    // Mainformdata + all derived data
    const mainformRef = db.ref('Mainformdata');
    const mainformSnapshot = await mainformRef.orderByChild('uid').equalTo(clerkUserId).once('value');

    let unitReservations = [];
    let earlyAppStatus = { earlyAppStatus: 'No', selectApplication: '0', foundingmember: 'No', date: 'January 2027' };
    let hasCompleteData = false;

    if (mainformSnapshot.exists()) {
      mainformSnapshot.forEach((childSnapshot) => {
        const data = childSnapshot.val();
        hasCompleteData = data.name && data.email;

        // Units
        if (data.PaymentFormData?.unit) {
          unitReservations = data.PaymentFormData.unit;
        }

        // Early app status
        if (data.PaymentFormData?.selectapplication === '100') {
          earlyAppStatus = { earlyAppStatus: 'Yes', selectApplication: '100', date: 'July 2025', foundingmember: earlyAppStatus.foundingmember };
        }
        if (data.foundingmember === 'Yes') {
          earlyAppStatus.foundingmember = 'Yes';
        }
      });
    }

    res.json({
      success: true,
      data: {
        userProfile: userSnapshot.exists() ? userSnapshot.val() : null,
        unitReservations,
        earlyAppStatus,
        hasMainformData: mainformSnapshot.exists(),
        hasCompleteData
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}
