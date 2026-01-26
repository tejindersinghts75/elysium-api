import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { createClerkClient } from '@clerk/backend';

function generateRandomPassword(length = 12) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += characters[Math.floor(Math.random() * characters.length)];
  }
  return password;
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: "https://alcester-578d6-default-rtdb.firebaseio.com/"
});
const db = getDatabase(app);
const clerkClient = createClerkClient({
  apiKey: process.env.CLERK_SECRET_KEY
});


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
    case 'track': return await handleTrackReferral(req, res);
    case 'signup': return await handleSignup(req, res);
    case 'email-signup': return await handleEmailSignup(req, res);  // ✅ ADD THIS

    default: return res.status(400).json({
      error: 'Invalid action',
      available: ['generate-link', 'submit-form', 'send-email', 'track', 'signup', 'email-signup']  // ✅ ALL 6 actions
    });
  }
} catch (error) {
  console.error('Referral API error:', error);
  res.status(500).json({ error: 'Internal server error' });
}

}

async function handleGenerateLink(req, res) {
  // 🔥 ADD THESE LINES (same as handleEmailSignup)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
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
// ✅ FIXED: Elysium EXACT structure (status + timestamp only)
async function handleTrackReferral(req, res) {
  // ALL CORS HEADERS FIRST
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
    const { referralId, status, referrerId } = body;  // ← ONLY NEED THESE 2

    if (!referralId || !status) {
      return res.status(400).json({ error: 'Missing referralId or status' });
    }

    // ✅ GENERATE EXACT Elysium-style key: "ref-[TIMESTAMP]"
    const refKey = referralId;

    // ✅ FIND referrer by uid and SAVE under THEIR referrals
    const mainformRef = db.ref('Mainformdata');
    const snapshot = await mainformRef.orderByChild('uid').equalTo(referrerId).once('value');

    if (snapshot.exists()) {
      const promises = [];
      snapshot.forEach((child) => {
        promises.push(
          db.ref(`Mainformdata/${child.key}/referrals/${refKey}`).set({
            status,
            timestamp: Date.now()
          })
        );
      });
      await Promise.all(promises);
      res.json({ success: true, refKey });  // Return SAME ID
    } else {
      res.status(404).json({ error: 'Referrer not found' });
    }

  } catch (error) {
    console.error('Track referral error:', error);
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


async function handleEmailSignup(req, res) {
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
    const { email, captchaToken } = body;

    // Validation
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    if (!captchaToken) {
      return res.status(400).json({ error: 'CAPTCHA required' });
    }

    // 1️⃣ Extract name + generate password
    const firstname = email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1);
    const randomPassword = generateRandomPassword();

    // 2️⃣ CREATE CLERK USER ✅
    const clerkUser = await clerkClient.users.createUser({
      emailAddress: [email],
      username: firstname,
      password: randomPassword,
      skipEmailVerification: true
    });

    const clerkUserId = clerkUser.id;
    console.log("✅ Clerk user created:", clerkUserId);

    // 3️⃣ REALTIME DB users/
    const userRef = db.ref(`users/${clerkUserId}`);
    await userRef.set({
      firstname,
      email
    });

    // 4️⃣ VERIFY
    const snapshot = await userRef.once('value');
    if (!snapshot.exists()) {
      throw new Error('Failed to save user profile');
    }

    res.json({
      success: true,
      userId: clerkUserId,
      firstname,
      email,
      tempPassword: randomPassword  // Frontend auto-login
    });

  } catch (error) {
    if (error.code === 'user_already_exists') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    res.status(500).json({ error: 'Signup failed' });
  }
}

