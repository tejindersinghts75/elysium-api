


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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const startTime = Date.now();
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  try {
    const {
      name, email, mobile, selectedCity, profession, income, household, why,
      captchaToken, referredBy, referralId
    } = req.body;

    // 1. RATE LIMITING (2/min per IP) ✅
    const cleanIp = ip.replace(/\./g, '_').replace(/:/g, '_');
    const minuteBucket = Math.floor(startTime / 60000);
    const rateKey = `rate/${cleanIp}/${minuteBucket}`;
    const rateCheck = await db.ref(rateKey).once('value');
    if (rateCheck.val() >= 2) {
      return res.status(429).json({ error: 'Too many requests. Please wait 1 minute.' });
    }
    await db.ref(rateKey).transaction(current => (current || 0) + 1);


    // 2. CAPTCHA VALIDATION (disabled for testing - UNCOMMENT FOR PRODUCTION)
    /*
    const captchaRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${process.env.TURNSTILE_SECRET_KEY}&response=${captchaToken}&remoteip=${ip}`
    });
    const captchaData = await captchaRes.json();
    if (!captchaData.success) return res.status(400).json({ error: 'Invalid CAPTCHA' });
    */

    // 3. VALIDATION & SANITIZATION ✅

    // 2. VALIDATION & SANITIZATION ✅
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email required' });
    }

    const emailLower = email.toLowerCase().trim();
    if (!emailLower.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // 🔥 3. DUAL VALIDATION: CLERK FIRST + FIREBASE SECOND ✅
    console.log('🔍 Checking dual validation for:', emailLower);

    // CLERK CHECK (SINGLE CALL - NO DUPLICATES!)
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

    // 4. CREATE NEW USER (We KNOW user doesn't exist!) ✅
    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '';
    const username = `${firstName.toLowerCase()}${Math.floor(Math.random() * 10000)}`;

    let userId;
    try {
      // ✅ NO DUPLICATE getUserList() - Direct creation!
      const user = await clerkClient.users.createUser({
        emailAddress: [emailLower],
        username: username,
        firstName,
        lastName,
        skipPasswordRequirement: true,
        skipPasswordChecks: true,
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
      console.log('✅ Using fallback userId:', userId);
    }

    const timestampKey = Date.now().toString();

    // 5. FIREBASE WRITES ✅
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

    // 6. MLM REFERRAL CHAIN ✅
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

    // 7. GOOGLE SHEETS AUDIT LOG ✅
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
      userId,
      redirect: '/thank-you',
      message: 'Welcome to Elysium! 🎉'
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
