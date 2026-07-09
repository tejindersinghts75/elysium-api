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
  //databaseURL: "https://alcester-578d6-default-rtdb.firebaseio.com/"
    databaseURL:process.env.FIREBASE_URL
});
const db = getDatabase(app);
const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY
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
    case 'referrer': return await handleGetReferrer(req, res);
    case 'submit-form': return await handleSubmitForm(req, res);
    case 'send-email': return await handleSendEmail(req, res);
    case 'track': return await handleTrackReferral(req, res);
    case 'signup': return await handleSignup(req, res);
    case 'email-signup': return await handleEmailSignup(req, res);  // ✅ ADD THIS

    default: return res.status(400).json({
      error: 'Invalid action',
      available: ['generate-link', 'referrer', 'submit-form', 'send-email', 'track', 'signup', 'email-signup']  // ✅ ALL 7 actions
    });
  }
} catch (error) {
  console.error('Referral API error:', error);
  res.status(500).json({ error: 'Internal server error' });
}

}

function buildDisplayName(data = {}) {
  const firstName = String(data.firstname || data.firstName || '').trim();
  const lastName = String(data.lastname || data.lastName || '').trim();
  const fullName = String(data.name || '').trim();

  if (firstName || lastName) return `${firstName} ${lastName}`.trim();
  if (fullName) return fullName;
  return '';
}

async function handleGetReferrer(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });

  const userId = String(req.query.userId || req.query.referrerId || '').trim();

  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  try {
    const userSnap = await db.ref(`users/${userId}`).once('value');

    if (userSnap.exists()) {
      const user = userSnap.val() || {};
      const displayName = buildDisplayName(user);

      return res.json({
        success: true,
        userId,
        firstname: user.firstname || user.firstName || '',
        lastname: user.lastname || user.lastName || '',
        displayName: displayName || 'A friend',
      });
    }

    const mainformSnap = await db.ref('Mainformdata')
      .orderByChild('uid')
      .equalTo(userId)
      .once('value');

    let referrerData = null;
    if (mainformSnap.exists()) {
      mainformSnap.forEach((child) => {
        if (!referrerData) referrerData = child.val();
      });
    }

    if (!referrerData) {
      return res.status(404).json({ error: 'Referrer not found' });
    }

    const displayName = buildDisplayName(referrerData);

    return res.json({
      success: true,
      userId,
      firstname: referrerData.firstname || referrerData.firstName || '',
      lastname: referrerData.lastname || referrerData.lastName || '',
      displayName: displayName || 'A friend',
    });
  } catch (error) {
    console.error('Get referrer error:', error);
    return res.status(500).json({ error: 'Failed to fetch referrer' });
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
  const { clerkUserId, destination } = req.query;
  if (!clerkUserId) return res.status(400).json({ error: 'Missing clerkUserId' });

  const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const referralBaseUrl = 'https://join.elysiumcommunities.com/referralpost';
  const referralLink = destination === 'funnel-v3'
    ? `https://join.elysiumcommunities.com/join-waitlist?userId=${encodeURIComponent(clerkUserId)}&uniqueId=${encodeURIComponent(uniqueId)}`
    : `${referralBaseUrl}?userId=${encodeURIComponent(clerkUserId)}&uniqueId=${encodeURIComponent(uniqueId)}`;

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
    const allowedReferralHosts = [
      'https://elysiumcommunities.com',
      'https://www.elysiumcommunities.com',
      'https://elysium-apis.vercel.app',
    ];
    if (!referralLink || !allowedReferralHosts.some((host) => referralLink.startsWith(host))) {
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
    const { referralId, status, referrerId } = body;

    if (!referrerId || !referralId || !status) {
      return res.status(400).json({ error: 'Missing referrerId, referralId, or status' });
    }

    const refKey = referralId;
    const mainformRef = db.ref('Mainformdata');
    const snapshot = await mainformRef.orderByChild('uid').equalTo(referrerId).once('value');

    let targetNodeKey = null;

    if (snapshot.exists()) {
      // ✅ CURRENT FUNCTIONALITY PRESERVED - Multiple entries supported
      const promises = [];
      snapshot.forEach((child) => {
        targetNodeKey = child.key;  // Store first key found
        promises.push(
          db.ref(`Mainformdata/${child.key}/referrals/${refKey}`).set({
            status,
            timestamp: Date.now()
          })
        );
      });
      await Promise.all(promises);
    } else {
      // ✅ NEW FUNCTIONALITY - Auto-create Mainformdata for email-signup users
      console.log('🔗 Creating Mainformdata entry for referrer:', referrerId);
      targetNodeKey = Date.now().toString();

      // Create minimal Mainformdata entry
      await mainformRef.child(targetNodeKey).set({
        uid: referrerId,
        createdAt: Date.now(),
        referrals: {}
      });

      // Immediately add this referral
      await mainformRef.child(`${targetNodeKey}/referrals/${refKey}`).set({
        status,
        timestamp: Date.now()
      });
    }

    res.json({ success: true, refKey });  // ✅ SAME RESPONSE - Frontend unchanged

  } catch (error) {
    console.error('Track referral error:', error);
    res.status(500).json({ error: 'Tracking failed' });
  }
}


// NEW: Track referral opens
// ✅ FIXED: Elysium EXACT structure (status + timestamp only)
// async function handleTrackReferral(req, res) {
//   // ALL CORS HEADERS FIRST
//   res.setHeader('Access-Control-Allow-Origin', '*');
//   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
//   res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

//   if (req.method === 'OPTIONS') {
//     res.status(200).end();
//     return;
//   }

//   if (req.method !== 'POST') {
//     res.status(405).json({ error: 'POST required' });
//     return;
//   }

//   try {
//     const body = await parseBody(req);
//     const { referralId, status, referrerId } = body;  // ← ONLY NEED THESE 2

//     if (!referralId || !status) {
//       return res.status(400).json({ error: 'Missing referralId or status' });
//     }

//     // ✅ GENERATE EXACT Elysium-style key: "ref-[TIMESTAMP]"
//     const refKey = referralId;

//     // ✅ FIND referrer by uid and SAVE under THEIR referrals
//     const mainformRef = db.ref('Mainformdata');
//     const snapshot = await mainformRef.orderByChild('uid').equalTo(referrerId).once('value');

//     if (snapshot.exists()) {
//       const promises = [];
//       snapshot.forEach((child) => {
//         promises.push(
//           db.ref(`Mainformdata/${child.key}/referrals/${refKey}`).set({
//             status,
//             timestamp: Date.now()
//           })
//         );
//       });
//       await Promise.all(promises);
//       res.json({ success: true, refKey });  // Return SAME ID
//     } else {
//       res.status(404).json({ error: 'Referrer not found' });
//     }

//   } catch (error) {
//     console.error('Track referral error:', error);
//     res.status(500).json({ error: 'Tracking failed' });
//   }
// }


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
  console.log('🔥 handleEmailSignup START');

  try {
    console.log('📥 Parsing body...');
    const body = await parseBody(req);
    console.log('📧 Body:', body);

    const { email, captchaToken } = body;
    console.log('🔍 Validating:', { email, hasCaptcha: !!captchaToken });

    if (!email || !isValidEmail(email)) {
      console.log('❌ Invalid email');
      return res.status(400).json({ error: 'Valid email required' });
    }

    const firstname = email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1);
    const randomPassword = generateRandomPassword();
    console.log('👤 Generated:', { firstname, passwordLength: randomPassword.length });

    // Clerk
    console.log('🔗 Creating Clerk user...');
    const clerkUser = await clerkClient.users.createUser({
      emailAddress: [email],
      username: firstname,
      password: randomPassword,
      skipEmailVerification: true
    });
    console.log('✅ Clerk OK:', clerkUser.id);

    // Firebase
    console.log('💾 Saving Firebase...');
    const userRef = db.ref(`users/${clerkUser.id}`);
    await userRef.set({ firstname, email });
    console.log('✅ Firebase OK');

    res.json({
      success: true,
      userId: clerkUser.id,
      firstname, email,
      tempPassword: randomPassword
    });
    console.log('🎉 SUCCESS');

  } catch (error) {
    console.error('💥 EXACT ERROR:', {
      message: error.message,
      code: error.code,
      stack: error.stack?.split('\n')[0]
    });

    if (error.code === 'user_already_exists') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    res.status(500).json({ error: 'Signup failed: ' + error.message });
  }
}
