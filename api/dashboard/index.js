import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({
  credential: cert(serviceAccount),
  //databaseURL: "https://alcester-578d6-default-rtdb.firebaseio.com/"
  databaseURL: process.env.FIREBASE_URL
});
const db = getDatabase(app);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { clerkUserId, action } = req.query;
    if (!clerkUserId) {
      return res.status(400).json({ error: 'Missing clerkUserId' });
    }

    // 🔥 SINGLE ENDPOINT - MULTIPLE ACTIONS
    switch (action) {
      case 'user-data':
        return handleUserData(req, res, clerkUserId);

      case 'update-profile':
        return handleUpdateProfile(req, res, clerkUserId);

      case 'update-preferences':
        return handleUpdatePreferences(req, res, clerkUserId);

      case 'referrals':
        return handleReferrals(req, res, clerkUserId);

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('Dashboard API error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// ======================
// USER DATA (Original user-data.js)
// ======================
async function handleUserData(req, res, clerkUserId) {
  const userRef = db.ref(`users/${clerkUserId}`);
  const userSnapshot = await userRef.once('value');

  const mainformRef = db.ref('Mainformdata');
  const mainformSnapshot = await mainformRef.orderByChild('uid').equalTo(clerkUserId).once('value');

  let unitReservations = [];
  let earlyAppStatus = { earlyAppStatus: 'No', selectApplication: '0', isFounder: 'No', date: 'January 2027' };
  let hasCompleteData = false;
  let latestBuilderPlan = null;
  let latestBackerPayment = null;
  let latestResume = null;
  let allRefund = false;
  let allRefundAt = null;

  if (mainformSnapshot.exists()) {
    mainformSnapshot.forEach((childSnapshot) => {
      const data = childSnapshot.val();
      hasCompleteData = data.name && data.email;

      if (Array.isArray(data.PaymentFormData?.priceperfoot)) {
        unitReservations = data.PaymentFormData.priceperfoot;
      } else if (data.PaymentFormData?.unit) {
        unitReservations = data.PaymentFormData.unit;
      }

      // 🔥 CAPTURE COMPLETE backerPayment object
      if (data.backerPayment) {
        latestBackerPayment = data.backerPayment;  // Full object!
      }
      if (data.builderPlan) {
        latestBuilderPlan = data.builderPlan;
      }
      if (data.resume) {
        latestResume = data.resume;
      }
      if (data.allRefund === true) {
        allRefund = true;
        allRefundAt = data.allRefundAt || null;
      }
      // Check ANY payment for early access
      if (data.stripePayment?.paymentStatus === "success" ||
        data.backerPayment?.paymentStatus === "success") {
        earlyAppStatus = {
          earlyAppStatus: 'Yes',
          selectApplication: '99',
          date: 'July 2025',
          isFounder: earlyAppStatus.isFounder
        };
      }

      earlyAppStatus.isFounder = data?.isFounder ? 'Yes' : 'No';
    });
  }

  res.json({
    success: true,
    data: {
      userProfile: userSnapshot.exists() ? userSnapshot.val() : null,
      unitReservations,
      earlyAppStatus,
      hasMainformData: mainformSnapshot.exists(),
      hasCompleteData,
      backerPayment: latestBackerPayment,
      builderPlan: latestBuilderPlan,
      resume: latestResume,
      allRefund,
      allRefundAt

    }
  });
}


// ======================
// UPDATE PROFILE (Original update-profile.js)
// ======================
async function handleUpdateProfile(req, res, clerkUserId) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
  });

  const { firstname, lastname, email } = body;
  const userRef = db.ref(`users/${clerkUserId}`);
  await userRef.update({ firstname, lastname, email, updatedAt: Date.now() });

  res.json({ success: true, message: 'Profile updated successfully' });
}

// ======================
// UPDATE PREFERENCES (Original update-preferences.js)
// ======================
async function handleUpdatePreferences(req, res, clerkUserId) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
  });

  const { unit } = body;
  if (!unit) {
    return res.status(400).json({ error: 'Missing unit data' });
  }

  const mainformRef = db.ref('Mainformdata');
  const snapshot = await mainformRef.orderByChild('uid').equalTo(clerkUserId).once('value');

  if (!snapshot.exists()) {
    return res.status(404).json({ error: 'User mainformdata not found' });
  }

  snapshot.forEach((child) => {
    const entryKey = child.key;
    const existingData = child.val().PaymentFormData || {};
    db.ref(`Mainformdata/${entryKey}/PaymentFormData`).update({
      ...existingData,
      unit,
      updatedAt: Date.now()
    });
  });

  res.json({ success: true, message: 'Preferences updated' });
}

// ======================
// REFERRALS (Original referrals.js)
// ======================
async function handleReferrals(req, res, clerkUserId) {
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

  let openedOnlyCount = 0, formFilledCount = 0;
  for (const refId in referrals) {
    const referralData = referrals[refId];
    const fieldCount = Object.keys(referralData).length;
    if (fieldCount === 2 && referralData.status && referralData.timestamp) {
      openedOnlyCount++;
    } else if (referralData.name && referralData.status && referralData.timestamp) {
      formFilledCount++;
    }
  }

  res.json({
    success: true,
    stats: {
      openedOnlyCount,
      formFilledCount,
      totalAmount: formFilledCount * 400,
      hasReferrals: Object.keys(referrals).length > 0
    }
  });
}
