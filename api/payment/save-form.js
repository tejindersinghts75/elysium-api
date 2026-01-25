import formidable from 'formidable';
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: "https://alcester-578d6-default-rtdb.firebaseio.com/"
});
const db = getDatabase(app);

export default async function handler(req, res) {
  // CORS headers
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
    // Parse form data
    const form = formidable({ multiples: false });
    const [fields] = await form.parse(req);
    const body = {};

    for (const key of Object.keys(fields)) {
      body[key] = fields[key][0] || fields[key];
    }

    console.log('📥 Received data:', body);

    const {
      clerkUserId,
      useremail,
      unit,
      teslaoptions,
      chooseterm,
      selectapplication,
      diningpackage
    } = body;

    // Validate required fields
    if (!clerkUserId || !useremail) {
      console.log('❌ Missing required fields');
      return res.status(400).json({
        error: 'Missing user ID or email',
        received: { clerkUserId: !!clerkUserId, useremail: !!useremail }
      });
    }

    // 🔥 FULL DEBUG LOGGING
    console.log('🔍 Searching for clerkUserId:', clerkUserId);

    const mainformdataRef = db.ref('Mainformdata');
    const snapshot = await mainformdataRef
      .orderByChild('uid')
      .equalTo(clerkUserId)
      .once('value');

    console.log('📊 Query result:', {
      exists: snapshot.exists(),
      numChildren: snapshot.numChildren(),
      rawData: snapshot.val()
    });

    if (!snapshot.exists()) {
      // DEBUG: Log ALL Mainformdata
      const allData = await mainformdataRef.once('value');
      const allKeys = allData.val() ? Object.keys(allData.val()) : [];
      console.log('📋 ALL Mainformdata keys:', allKeys);

      return res.status(404).json({
        error: 'User form data not found in Mainformdata',
        debug: {
          clerkUserId,
          snapshotExists: snapshot.exists(),
          snapshotNumChildren: snapshot.numChildren(),
          allMainformdataKeys: allKeys.slice(0, 5), // First 5 keys
          totalRecords: allKeys.length
        }
      });
    }

    // Get the entry key
    let entryKey = null;
    snapshot.forEach((child) => {
      entryKey = child.key;
    });

    console.log('✅ Found entry key:', entryKey);

    // Parse unit data safely
    let parsedUnit = [];
    try {
      parsedUnit = unit ? JSON.parse(unit) : [];
    } catch (e) {
      console.warn('⚠️ Unit parsing failed, using empty array:', e.message);
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
      submittedAt: Date.now(),
      totalPrice: body.totalPrice || 0
    };

    await db.ref(`Mainformdata/${entryKey}/PaymentFormData`).set(paymentData);

    console.log('💾 PaymentFormData saved successfully:', entryKey);

    res.json({
      success: true,
      message: 'Payment form saved successfully',
      entryKey,
      paymentDataKeys: Object.keys(paymentData)
    });

  } catch (error) {
    console.error('💥 Full error:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
