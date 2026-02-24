import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { createClerkClient } from '@clerk/backend';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({
  credential: cert(serviceAccount),
  //databaseURL: "https://alcester-578d6-default-rtdb.firebaseio.com/"
  databaseURL: process.env.FIREBASE_URL
});
const db = getDatabase(app);
const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const GOOGLE_SHEETS_URL = process.env.GOOGLE_SHEETS_URL;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }

  try {
    const { clerkUserId, formType, useremail, unit, teslaoptions, chooseterm, selectapplication, diningpackage } = req.body;

    if (!clerkUserId || !GOOGLE_SHEETS_URL) {
      return res.status(400).json({ error: 'Missing data' });
    }

    // Validate Clerk user
    await clerkClient.users.getUser(clerkUserId);

    // Send to Google Sheets
    const sheetsData = {
      formType,
      timestamp: new Date().toISOString(),
      clerkUserId,
      useremail,
      unit: unit || '',
      teslaoptions: teslaoptions || '',
      chooseterm: chooseterm || '',
      selectapplication: selectapplication || '',
      diningpackage: diningpackage || ''
    };

    await fetch(GOOGLE_SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sheetsData)
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Sheets error:', error);
    res.status(500).json({ error: 'Sheets logging failed' });
  }
}
