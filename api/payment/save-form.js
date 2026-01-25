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

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 🔥 FIXED: PURE JSON PARSING - NO FORMIDABLE
    const body = await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON'));
        }
      });
      req.on('error', reject);
    });

    console.log('📥 FULL DATA RECEIVED:', body);

    const {
      clerkUserId,
      useremail,
      unit,
      teslaoptions,
      chooseterm,
      selectapplication,
      diningpackage
    } = body;

    // Validate
    if (!clerkUserId || !useremail) {
      console.log('❌ Missing fields:', { clerkUserId: !!clerkUserId, useremail: !!useremail });
      return res.status(400).json({ error: 'Missing user ID or email' });
    }

    console.log('🔍 clerkUserId FULL:', clerkUserId, 'Length:', clerkUserId.length);

    // Query Firebase
    const mainformdataRef = db.ref('Mainformdata');
    const snapshot = await mainformdataRef
      .orderByChild('uid')
      .equalTo(clerkUserId)
      .once('value');

    console.log('📊 Query result:', {
      exists: snapshot.exists(),
      numChildren: snapshot.numChildren()
    });

    if (!snapshot.exists()) {
      const allData = await mainformdataRef.once('value');
      const allKeys = allData.val() ? Object.keys(allData.val()) : [];
      return res.status(404).json({
        error: 'User form data not found',
        debug: {
          clerkUserId,
          clerkUserIdLength: clerkUserId.length,
          snapshotExists: snapshot.exists(),
          totalRecords: allKeys.length,
          allMainformdataKeys: allKeys.slice(0, 5)
        }
      });
    }

    // Get entry key
    let entryKey = null;
    snapshot.forEach((child) => {
      entryKey = child.key;
    });

    console.log('✅ Found entry key:', entryKey);

    // Parse unit safely
    let parsedUnit = [];
    try {
      parsedUnit = unit ? JSON.parse(unit) : [];
    } catch (e) {
      console.warn('⚠️ Unit parsing failed:', e.message);
      parsedUnit = [];
    }

    // Save PaymentFormData
    const paymentData = {
      useremail,
      unit: parsedUnit,
      teslaoptions: teslaoptions || '',
      chooseterm: chooseterm || '',
      selectapplication: selectapplication || '',
      diningpackage: diningpackage || '',
      submittedAt: Date.now()
    };

    await db.ref(`Mainformdata/${entryKey}/PaymentFormData`).set(paymentData);

    console.log('💾 SAVED to:', entryKey);

    res.json({
      success: true,
      message: 'Payment form saved successfully',
      entryKey
    });

  } catch (error) {
    console.error('💥 ERROR:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
}
