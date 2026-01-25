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

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { action } = req.query;

    try {
        switch (action) {
            case 'generate-link': return await handleGenerateLink(req, res);
            case 'submit-form': return await handleSubmitForm(req, res);
            case 'send-email': return await handleSendEmail(req, res);
            case 'track': return await handleTrackReferral(req, res);     // ← NEW
            case 'signup': return await handleSignup(req, res);
            default: return res.status(400).json({ error: 'Invalid action', available: ['generate-link', 'submit-form', 'send-email'] });
        }
    } catch (error) {
        console.error('Referral API error:', error);
        res.status(500).json({ error: 'Internal server error', details: process.env.NODE_ENV === 'development' ? error.message : undefined });
    }
}

async function handleGenerateLink(req, res) {
    const { clerkUserId } = req.query;
    if (!clerkUserId) return res.status(400).json({ error: 'Missing clerkUserId' });

    const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const referralLink = `https://elysiumcommunities.com/referralpost?userId=${clerkUserId}&uniqueId=${uniqueId}`;

    res.json({
        success: true,
        referralLink,
        uniqueId,
        timestamp: Date.now()
    });
}

async function handleSubmitForm(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

    try {
        const body = await parseBody(req);
        const { clerkUserId, referredEmails = [] } = body;

        if (!clerkUserId) return res.status(400).json({ error: 'Missing clerkUserId' });
        if (!Array.isArray(referredEmails) || referredEmails.length === 0) {
            return res.status(400).json({ error: 'No valid emails provided' });
        }

        const mainformRef = db.ref('Mainformdata');
        const snapshot = await mainformRef.orderByChild('uid').equalTo(clerkUserId).once('value');

        if (!snapshot.exists()) return res.status(404).json({ error: 'User referral data not found' });

        let updatedCount = 0;
        snapshot.forEach((child) => {
            const entryKey = child.key;
            const updates = {};
            referredEmails.slice(0, 10).forEach((email, index) => {
                if (email && isValidEmail(email)) {
                    updates[`referral${index + 1}`] = email;
                }
            });

            if (Object.keys(updates).length > 0) {
                db.ref(`Mainformdata/${entryKey}`).update({
                    ...updates,
                    referralsUpdatedAt: Date.now()
                });
                updatedCount++;
            }
        });

        res.json({
            success: true,
            message: `Saved ${updatedCount} referral entries`,
            emailsProcessed: referredEmails.length
        });
    } catch (error) {
        console.error('Submit form error:', error);
        res.status(500).json({ error: 'Failed to save referrals' });
    }
}

async function handleSendEmail(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

    try {
        const body = await parseBody(req);
        const { email, referralLink } = body;

        if (!email || !isValidEmail(email)) return res.status(400).json({ error: 'Invalid email' });
        if (!referralLink || !referralLink.startsWith('https://elysiumcommunities.com')) {
            return res.status(400).json({ error: 'Invalid referral link' });
        }

        const response = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-key": process.env.BREVO_API_KEY
            },
            body: JSON.stringify({
                sender: { email: "eahto@kypsi.com", name: "Kypsi" },
                to: [{ email, name: "Friend" }],
                subject: "You've Been Referred to Elysium Communities!",
                htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #178a00;">🎉 You've been referred!</h2>
            <p>Hello,</p>
            <p>A friend thought you'd love <strong>Elysium Communities</strong>! Check it out:</p>
            <a href="${referralLink}" style="background: #178a00; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Join Now</a>
            <p style="margin-top: 20px; font-size: 12px; color: #666;">
              ${referralLink}
            </p>
          </div>
        `
            })
        });

        const result = await response.json();
        res.json({
            success: response.ok,
            message: response.ok ? `Email sent to ${email}` : 'Email failed',
            details: response.ok ? null : result
        });
    } catch (error) {
        console.error('Send email error:', error);
        res.status(500).json({ error: 'Email service unavailable' });
    }
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function parseBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(data)); }
            catch { resolve({}); }
        });
        req.on('error', reject);
    });
}

// NEW: Track referral opens
async function handleTrackReferral(req, res) {
   // ✅ ALL CORS HEADERS FIRST (before any return)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST required' });
    return;
  }

  try {
    const body = await parseBody(req);
    const { referrerId, referralId, uniqueId, status } = body;

    if (!referrerId || !referralId || !uniqueId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const mainformRef = db.ref('Mainformdata');
    const snapshot = await mainformRef.orderByChild('uid').equalTo(referrerId).once('value');

    if (snapshot.exists()) {
      snapshot.forEach(async (child) => {
        const entryKey = child.key;
        await db.ref(`Mainformdata/${entryKey}/referrals/${referralId}`).set({
          status,
          uniqueId,
          referrerId,
          timestamp: Date.now()
        });
      });
      res.json({ success: true, referralId });
    } else {
      res.status(404).json({ error: 'Referrer not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Tracking failed' });
  }
}

// NEW: Track successful signups
async function handleSignup(req, res) {
  // ✅ ALL CORS HEADERS FIRST
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST required' });
    return;
  }
  try {
    const body = await parseBody(req);
    const { newUserId, email, referralId, referredBy } = body;

    const newUserKey = Date.now().toString();
    await db.ref(`Mainformdata/${newUserKey}`).set({
      uid: newUserId,
      email,
      createdAt: Date.now(),
      referral: {
        referralId,
        referredBy,
        status: 'signed_up',
        timestamp: Date.now()
      }
    });

    res.json({ success: true, userId: newUserId });
  } catch (error) {
    res.status(500).json({ error: 'Signup tracking failed' });
  }
}
