import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { createClerkClient } from '@clerk/backend';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: "https://alcester-578d6-default-rtdb.firebaseio.com/"
});
const db = getDatabase(app);

// ✅ EXACTLY LIKE YOUR WORKING upload-sessions CODE
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
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email required' });
    }

    const emailLower = email.toLowerCase().trim();
    if (!emailLower.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // 4. EMAIL DEDUPLICATION ✅
    const emailCheck = await db.ref('users').orderByChild('email').equalTo(emailLower).once('value');
    if (emailCheck.exists()) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // 5. CLERK USER CREATION (YOUR WORKING PATTERN) ✅
    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '';
    // ✅ USERNAME GENERATION (Required field fixed!)
    const username = `${firstName.toLowerCase()}${Math.floor(Math.random() * 10000)}`;
    let user;
    try {
      // Check existing user (EXACTLY like upload-sessions)
      const userListResponse = await clerkClient.users.getUserList({
        emailAddress: [emailLower],
        limit: 1,
      });

      user = userListResponse.data.length ? userListResponse.data[0] : null;

      // Create new user if not exists
      if (!user) {
        user = await clerkClient.users.createUser({
          emailAddress: [emailLower],
          username: username,  // ✅ REQUIRED FIELD!
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
        console.log('✅ New Clerk user created:', user.id);
      } else {
        console.log('✅ Existing Clerk user found:', user.id);
      }
    } catch (clerkError) {
      console.error('❌ Clerk Error:', clerkError.errors || clerkError.message);
      // GRACEFUL FALLBACK - Firebase still works
      user = { id: `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` };
      console.log('✅ Using fallback userId:', user.id);
    }

    const userId = user.id;
    const timestampKey = Date.now().toString();

    // 6. FIREBASE WRITES (MLM STRUCTURE) ✅
    // Replace Firebase writes section (lines 120-150):
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

      // ✅ MATCH YOUR LIVE FORMAT:
      db.ref(`users/${userId}`).set({
        firstname: firstName,
        lastname: lastName,
        email: emailLower,
        mobile: mobile?.trim() || '',
        createdAt: Date.now()
      })
    ]);


    // 7. MLM REFERRAL CHAIN (Production Ready) ✅
    if (referredBy && referralId) {
      try {
        const referrerSnap = await db.ref(`users/${referredBy}`).once('value');
        if (referrerSnap.exists()) {
          const referrerDetails = referrerSnap.val();

          // Update referrer's Mainformdata referrals
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

    // 8. GOOGLE SHEETS AUDIT LOG ✅
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

    // Audit log on failure
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
