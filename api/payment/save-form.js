import formidable from 'formidable';
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { createClerkClient } from '@clerk/backend';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({ credential: cert(serviceAccount), databaseURL: "https://alcester-578d6-default-rtdb.firebaseio.com/" });
const db = getDatabase(app);
const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }

  try {
    const form = formidable({ multiples: false });
    const [fields] = await form.parse(req);
    const body = {};
    for (const key of Object.keys(fields)) {
      body[key] = fields[key][0] || fields[key];
    }

    const { clerkUserId, useremail } = body;

    // BACKEND: Trust frontend userId (no Clerk API call)
    if (!clerkUserId || !useremail) {
      return res.status(400).json({ error: 'Missing user ID or email' });
    }

    // BACKEND: Query Firebase like frontend does
    const mainformdataRef = db.ref('Mainformdata');
    const snapshot = await mainformdataRef.orderByChild('uid').equalTo(clerkUserId).once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'User form data not found' });
    }

    let entryKey = null;
    snapshot.forEach(child => {
      entryKey = child.key;
    });

    // BACKEND: Save exactly like frontend
    await db.ref(`Mainformdata/${entryKey}/PaymentFormData`).set({
      useremail,
      unit: body.unit ? JSON.parse(body.unit) : [],
      teslaoptions: body.teslaoptions || '',
      chooseterm: body.chooseterm || '',
      selectapplication: body.selectapplication || '',
      diningpackage: body.diningpackage || '',
      submittedAt: Date.now()
    });

    res.json({ success: true, message: 'Payment form saved' });
  } catch (error) {
    console.error('Save form error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}
