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

  try {
    const { action } = req.query;

    switch (action) {
      case 'generate-link': return handleGenerateLink(req, res);
      case 'submit-form': return handleSubmitForm(req, res);
      case 'send-email': return handleSendEmail(req, res);
      default: res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('Referral API error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// Generate referral link
async function handleGenerateLink(req, res) {
  try {
    const { clerkUserId } = req.query;
    if (!clerkUserId) return res.status(400).json({ error: 'Missing clerkUserId' });

    const uniqueId = Date.now().toString();
    const referralLink = `https://elysiumcommunities.com/referralpost?userId=${clerkUserId}&uniqueId=${uniqueId}`;

    res.json({
      success: true,
      referralLink,
      uniqueId
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate link' });
  }
}

// Submit referral form (replaces Firebase direct write)
async function handleSubmitForm(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = await parseBody(req);
    const { clerkUserId, referredEmails } = body;

    if (!clerkUserId || !referredEmails?.length) {
      return res.status(400).json({ error: 'Missing data' });
    }

    // Find Mainformdata entry
    const mainformRef = db.ref('Mainformdata');
    const snapshot = await mainformRef.orderByChild('uid').equalTo(clerkUserId).once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'User entry not found' });
    }

    // Update referrals
    let updated = false;
    snapshot.forEach((child) => {
      const entryKey = child.key;
      const updates = {};
      referredEmails.forEach((email, index) => {
        updates[`referral${index + 1}`] = email;
      });
      db.ref(`Mainformdata/${entryKey}`).update(updates);
      updated = true;
    });

    res.json({ success: true, message: 'Referrals saved' });
  } catch (error) {
    console.error('Submit form error:', error);
    res.status(500).json({ error: 'Failed to save referrals' });
  }
}

// Send referral email (Brevo API - secure)
async function handleSendEmail(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = await parseBody(req);
    const { email, referralLink } = body;

    if (!email || !referralLink) {
      return res.status(400).json({ error: 'Missing email or link' });
    }

    // Call Brevo API (API key in ENV)
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "api-key": process.env.BREVO_API_KEY // ✅ SECURE
      },
      body: JSON.stringify({
        sender: { email: "eahto@kypsi.com", name: "Kypsi" },
        to: [{ email, name: "Referral User" }],
        subject: "You've Been Referred!",
        htmlContent: `<p>Hello,</p><p>Your friend referred you! Click the link below:</p><a href="${referralLink}">${referralLink}</a>`
      })
    });

    if (response.ok) {
      res.json({ success: true, message: `Email sent to ${email}` });
    } else {
      res.status(500).json({ error: 'Failed to send email' });
    }
  } catch (error) {
    console.error('Send email error:', error);
    res.status(500).json({ error: 'Email service error' });
  }
}

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
  });
}
