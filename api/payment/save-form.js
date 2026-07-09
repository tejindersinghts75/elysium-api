import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { BrevoClient } from "@getbrevo/brevo";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({
  credential: cert(serviceAccount),
  //databaseURL: "https://alcester-578d6-default-rtdb.firebaseio.com/"
  databaseURL: process.env.FIREBASE_URL
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
      diningpackage,
      priceperfoot
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
    let selectedUnitName = "N/A";

    if (Array.isArray(parsedUnit)) {
      const selectedUnit = parsedUnit.find(
        item => item.selected === "selected"
      );

      if (selectedUnit && selectedUnit.text) {
        selectedUnitName = selectedUnit.text;
      }
    }
    // Save PaymentFormData
    const paymentData = {
      useremail,
      unit: parsedUnit,
      teslaoptions: teslaoptions || '',
      chooseterm: chooseterm || '',
      selectapplication: selectapplication || '',
      diningpackage: diningpackage || '',
      priceperfoot: priceperfoot || '',
      submittedAt: Date.now()
    };

    await db.ref(`Mainformdata/${entryKey}/PaymentFormData`).set(paymentData);
    // await db.ref(`Mainformdata/${entryKey}/resume`).update({
    //   step2Completed: true,
    //   currentStep: 3,
    //   lastCompletedStep: 2,

    // });
    const selectedApplication = String(selectapplication || '').trim();

    let resumeUpdate = {
      step2Completed: true,
    };

    if (selectedApplication === '99') {
      resumeUpdate.currentStep = 2;
      resumeUpdate.lastCompletedStep = 1;
      resumeUpdate.earlyApplicationPaid = false;
      resumeUpdate.earlyApplicationPaymentRequired = true;
    }

    if (selectedApplication === '0' || selectedApplication === 'standard') {
      resumeUpdate.currentStep = 3;
      resumeUpdate.lastCompletedStep = 2;
      resumeUpdate.earlyApplicationPaid = false;
      resumeUpdate.earlyApplicationPaymentRequired = false;
    }

    await db.ref(`Mainformdata/${entryKey}/resume`).update(resumeUpdate);

    console.log('💾 SAVED to:', entryKey);

    // =========================
    // BREVO CODE START
    // =========================
    try {
      const client = new BrevoClient({
        apiKey: process.env.BREVO_API_KEY,
      });

      const emailLower = useremail.toLowerCase();

      await fetch("https://api.brevo.com/v3/contacts", {
        method: "POST",
        headers: {
          "api-key": process.env.BREVO_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: emailLower,
          attributes: {
            UNIT_TYPE: selectedUnitName,
            FOUNDING_BACKER_PLEDGE_TOTAL: priceperfoot,
            CUSTOMIZATION_COMPLETED: true,
            CUSTOMIZATION_COMPLETED_AT: new Date().toISOString()
          },
          updateEnabled: true
        })
      });

      await client.event.createEvent({
        event_name: "unit_customization_completed",
        identifiers: {
          email_id: emailLower
        }
      });

      console.log("✅ Step 2 Brevo event sent");
    } catch (brevoError) {
      console.error("❌ Brevo error:", brevoError.message || brevoError);
    }
    // =========================
    // BREVO CODE END
    // =========================

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
