import formidable from 'formidable';
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { createClerkClient } from '@clerk/backend';


const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: "https://alcester-578d6-default-rtdb.firebaseio.com/"
});
const db = getDatabase(app);

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});



// 🔥 SINGLE HANDLER (NO DUPLICATES)
export default async function handler(req, res) {
  // 🔥 CORS HEADERS (CORRECT POSITION)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }


  const startTime = Date.now();
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  try {
    // 🔥 FIX 1: Parse FormData PROPERLY
    const form = formidable({ multiples: false });
    const [fields] = await form.parse(req);

    // Convert to plain object
    const body = {};
    for (const key of Object.keys(fields)) {
      body[key] = fields[key][0] || fields[key];
    }

    // 🔥 FIX 2: Use `body` not `req.body`
    const {
      name, email, mobile, selectedCity, profession, income, household, why,
      captchaToken, referredBy, referralId
    } = body;

    console.log('📥 Received form data:', { name, email, captchaToken: captchaToken ? '✓' : '✗' });

    // 1. RATE LIMITING
    const cleanIp = ip.replace(/\./g, '_').replace(/:/g, '_');
    const minuteBucket = Math.floor(startTime / 60000);
    const rateKey = `rate/${cleanIp}/${minuteBucket}`;
    const rateCheck = await db.ref(rateKey).once('value');
    if (rateCheck.val() >= 2) {
      return res.status(429).json({ error: 'Too many requests. Please wait 1 minute.' });
    }
    await db.ref(rateKey).transaction(current => (current || 0) + 1);

    // 2. CAPTCHA VALIDATION
    if (captchaToken) {
      const captchaRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `secret=${process.env.TURNSTILE_SECRET_KEY}&response=${captchaToken}&remoteip=${ip}`
      });
      const captchaData = await captchaRes.json();
      if (!captchaData.success) {
        return res.status(400).json({ error: 'Invalid CAPTCHA' });
      }
    }

    // 3. VALIDATION
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email required' });
    }

    const emailLower = email.toLowerCase().trim();
  if (!emailLower.match(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)) {
  return res.status(400).json({ error: 'Invalid email format' });
}

    // 4. DUAL VALIDATION: CLERK + FIREBASE
    console.log('🔍 Checking dual validation for:', emailLower);

    // CLERK CHECK
    let clerkUserExists = false;
    try {
      const userListResponse = await clerkClient.users.getUserList({
        emailAddress: [emailLower],
        limit: 1,
      });
      if (userListResponse.data.length > 0) {
        console.log('❌ User exists in Clerk:', userListResponse.data[0].id);
        clerkUserExists = true;
      }
    } catch (clerkError) {
      console.error('Clerk check failed:', clerkError.message);
    }

    if (clerkUserExists) {
      return res.status(400).json({ error: 'User already registered with this email' });
    }

    // FIREBASE CHECK
    const emailCheck = await db.ref('users').orderByChild('email').equalTo(emailLower).once('value');
    if (emailCheck.exists()) {
      console.log('❌ User exists in Firebase');
      return res.status(400).json({ error: 'User already registered with this email' });
    }

// ✅ SANITIZE NAME FOR USERNAME
const cleanName = name.trim().replace(/[^a-zA-Z\s]/g, '');
const firstName = cleanName.split(' ')[0] || 'User';
const lastName = cleanName.split(' ').slice(1).join(' ') || '';
const username = `${firstName.toLowerCase().replace(/\s+/g, '')}${Math.floor(Math.random() * 10000)}`;


    // ✅ DECLARE OUTSIDE TRY BLOCK
    let userId
    let randomPassword = null;


    try {
      randomPassword = `auto_${Math.random().toString(36).slice(-8)}`;
      const user = await clerkClient.users.createUser({
        emailAddress: [emailLower],
        username: username,
        firstName,
        lastName,
        password: randomPassword,
        skipEmailVerification: true,  // ✅ CRITICAL - Add this
        // skipPasswordChecks: true,
        unsafeMetadata: {
          mobile: mobile?.trim() || '',
          selectedCity: selectedCity || 'Not selected',
          profession: profession || '',
          income: income || 'Not selected',
          household: household || 'Not selected',
          why: why?.trim() || '',
          createdAt: Date.now()
        }
      });
      userId = user.id;
      console.log('✅ New Clerk user created:', userId);
    } catch (clerkError) {
      console.error('❌ Clerk creation failed:', clerkError.errors || clerkError.message);
      userId = `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    const timestampKey = Date.now().toString();

    // 6. FIREBASE WRITES
    await Promise.all([
      db.ref(`Mainformdata/${timestampKey}`).set({
        uid: userId,
        name: name.trim(),
        email: emailLower,
        mobile: mobile?.trim() || '',
        selectedCity: selectedCity || '',
        profession: profession || '',
        income: income || '',
        household: household || '',
        why: why?.trim() || '',
        referredBy: referredBy || '',
        createdAt: Date.now()
      }),
      db.ref(`users/${userId}`).set({
        firstname: firstName,
        lastname: lastName,
        email: emailLower,
        mobile: mobile?.trim() || '',
        createdAt: Date.now()
      })
    ]);

    // 7. MLM REFERRAL CHAIN (unchanged)
    if (referredBy && referralId) {
      try {
        const referrerSnap = await db.ref(`users/${referredBy}`).once('value');
        if (referrerSnap.exists()) {
          const referrerFormSnap = await db.ref('Mainformdata')
            .orderByChild('uid').equalTo(referredBy).once('value');

          referrerFormSnap.forEach(snapshot => {
            const referrerKey = snapshot.key;
            db.ref(`Mainformdata/${referrerKey}/referrals/${referralId}`).update({
              name: name.trim(),
              email: emailLower,
              mobile: mobile?.trim() || '',
              status: 'completed',
              completedAt: Date.now()
            });
          });
          console.log('✅ Referral chain updated');
        }
      } catch (referralError) {
        console.log('⚠️ Referral update skipped:', referralError.message);
      }
    }

    // 8. GOOGLE SHEETS (unchanged)
    if (process.env.GOOGLE_SHEETS_URL) {
      const sheetsData = {
        formType: "formmodal",
        timestamp: new Date().toISOString(),
        ip,
        name: name.trim(),
        email: emailLower,
        mobile: mobile?.trim() || '',
        selectedCity: selectedCity || 'Not selected',
        profession: profession || '',
        income: income || 'Not selected',
        household: household || 'Not selected',
        why: why?.trim() || '',
        referredBy: referredBy || '',
        referralId: referralId || '',
        clerkUserId: userId,
        status: 'success'
      };
      fetch(process.env.GOOGLE_SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sheetsData)
      }).catch(console.error);
    }

    console.log(`✅ FULL SUCCESS: ${userId} (${ip}) in ${Date.now() - startTime}ms`);

    res.json({
      success: true,
      userId: userId,
      email: emailLower,
      tempPassword: randomPassword,
      firstName,
      redirect: '/thank-you '
    });



  } catch (error) {
    console.error('💥 CRITICAL ERROR:', error);

    if (process.env.GOOGLE_SHEETS_URL) {
      fetch(process.env.GOOGLE_SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formType: "formmodal",
          timestamp: new Date().toISOString(),
          ip,
          status: 'error',
          error: error.message
        })
      }).catch(console.error);
    }

    res.status(500).json({ error: 'Internal server error' });
  }
}
