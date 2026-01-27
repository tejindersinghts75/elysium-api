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

export default async function handler(req, res) {
  // 🔥 CORS HEADERS FIRST
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

  const startTime = Date.now();
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  try {
    // 🔥 PARSE FORMDATA
    const form = formidable({ multiples: false });
    const [fields] = await form.parse(req);

    const body = {};
    for (const key of Object.keys(fields)) {
      body[key] = fields[key][0] || fields[key];
    }

    const {
      name, email, mobile, selectedCity, profession, income, household, why,
      captchaToken, referredBy, referralId
    } = body;

    console.log('📥 Form data:', { name, email, captchaToken: captchaToken ? '✓' : '✗' });

    // 1. RATE LIMITING
    const cleanIp = ip.replace(/\./g, '_').replace(/:/g, '_');
    const minuteBucket = Math.floor(startTime / 60000);
    const rateKey = `rate/${cleanIp}/${minuteBucket}`;
    const rateCheck = await db.ref(rateKey).once('value');
    if (rateCheck.val() >= 2) {
      return res.status(429).json({ error: 'Too many requests. Please wait 1 minute.' });
    }
    await db.ref(rateKey).transaction(current => (current || 0) + 1);

    // 2. CAPTCHA
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

    // 3. BASIC VALIDATION
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email required' });
    }

    const emailLower = email.toLowerCase().trim();
    if (!emailLower.match(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // 🔥 4. SMART 3-STAGE REGISTRATION FLOW
    console.log('🔍 Smart registration flow for:', emailLower);

    // STAGE 1: CLERK CHECK
    let clerkUserExists = false;
    let existingClerkUserId = null;
    try {
      const userListResponse = await clerkClient.users.getUserList({
        emailAddress: [emailLower],
        limit: 1,
      });
      if (userListResponse.data.length > 0) {
        clerkUserExists = true;
        existingClerkUserId = userListResponse.data[0].id;
        console.log('✅ Stage 1 - Clerk user found:', existingClerkUserId);
      }
    } catch (clerkError) {
      console.error('Clerk check failed:', clerkError.message);
    }

    // STAGE 2 & 3: If Clerk exists → Check users/ + Mainformdata
    if (clerkUserExists) {
      // Check users/ collection
      const userCheck = await db.ref(`users/${existingClerkUserId}`).once('value');
      const firebaseUserExists = userCheck.exists();
      console.log('✅ Stage 2 - Firebase users/ check:', firebaseUserExists ? 'EXISTS' : 'NOT FOUND');

      if (firebaseUserExists) {
        // Check Mainformdata
        const mainformCheck = await db.ref('Mainformdata').orderByChild('uid').equalTo(existingClerkUserId).once('value');
        if (mainformCheck.exists()) {
          let targetEntryKey = null;
          mainformCheck.forEach((snapshot) => {
            targetEntryKey = snapshot.key;
          });
          console.log('🎉 Stage 3 - UPDATE MODE! Entry:', targetEntryKey);





          // 🔥 IMMEDIATELY UPDATE EXISTING ENTRY
          await db.ref(`Mainformdata/${targetEntryKey}`).update({
            name: name.trim(),
            email: emailLower,
            mobile: mobile?.trim() || '',
            selectedCity: selectedCity || '',
            profession: profession || '',
            income: income || '',
            household: household || '',
            why: why?.trim() || '',
            referredBy: referredBy || '',
            updatedAt: Date.now()
          });






// 🔥 DEBUG VERSION - WILL REVEAL EXACT PROBLEM
console.log('🔗=== DEBUG: User B UPDATE MODE ===');
console.log('📧 User B:', emailLower);
console.log('🔑 targetEntryKey:', targetEntryKey);

// STEP 1: Check User B's referredBy
const userBData = await db.ref(`Mainformdata/${targetEntryKey}`).once('value').then(s => s.val());
console.log('👤 User B referredBy:', userBData?.referredBy);

if (userBData?.referredBy) {
  const userAUID = userBData.referredBy;
  console.log('🔍 Looking for User A UID:', userAUID);

  // STEP 2: Find User A
  const userASnap = await db.ref('Mainformdata').orderByChild('uid').equalTo(userAUID).once('value');
  console.log('✅ User A exists?', userASnap.exists());

  if (userASnap.exists()) {
    userASnap.forEach((snap) => {
      const userAKey = snap.key;
      console.log('📁 User A key:', userAKey);

      // STEP 3: Check referrals
      db.ref(`Mainformdata/${userAKey}/referrals`).once('value').then((refs) => {
        console.log('📊 User A referrals exist?', refs.exists());
        if (refs.exists()) {
          let foundMatch = false;
          refs.forEach((refSnap) => {
            const refData = refSnap.val();
            console.log('🔍 REF:', refData?.email, refData?.status);

            if (refData?.email === emailLower && refData?.status === 'opened') {
              console.log('🎯 MATCH! Updating referral:', refSnap.key);
              foundMatch = true;
              db.ref(`Mainformdata/${userAKey}/referrals/${refSnap.key}`).update({
                name: name.trim(),
                email: emailLower,
                mobile: mobile || '',
                status: 'completed',
                completedAt: Date.now()
              }).then(() => {
                console.log('✅🎉 USER A REFERRAL UPDATED!');
              });
            }
          });
          if (!foundMatch) console.log('❌ No matching referral found');
        }
      });
    });
  }
} else {
  console.log('❌ User B has NO referredBy field!');
}
console.log('🔗=== DEBUG END ===');











          // Update users/ collection too
          const cleanName = name.trim().replace(/[^a-zA-Z\s]/g, '');
          const firstName = cleanName.split(' ')[0] || 'User';
          const lastName = cleanName.split(' ').slice(1).join(' ') || '';
          await db.ref(`users/${existingClerkUserId}`).update({
            firstname: firstName,
            lastname: lastName,
            email: emailLower,
            mobile: mobile?.trim() || '',
            updatedAt: Date.now()
          });

          console.log('✅ UPDATE MODE COMPLETE!');
          return res.json({
            success: true,
            mode: 'update',
            userId: existingClerkUserId,
            email: emailLower,
            firstName,
            message: 'Welcome back! Form updated successfully!',
            redirect: '/paymentpagetest'
          });
        }
      }
    }

    // ✅ NEW USER - Continue with full creation flow
    console.log('✅ NEW USER - Creating everything fresh');

    // 🔥 Clerk + Firebase dual check for new users (FINAL SAFETY)
    const firebaseEmailCheck = await db.ref('users').orderByChild('email').equalTo(emailLower).once('value');
    if (firebaseEmailCheck.exists()) {
      return res.status(400).json({ error: 'User already registered with this email' });
    }

    // Sanitize name
    const cleanName = name.trim().replace(/[^a-zA-Z\s]/g, '');
    const firstName = cleanName.split(' ')[0] || 'User';
    const lastName = cleanName.split(' ').slice(1).join(' ') || '';
    const username = `${firstName.toLowerCase().replace(/\s+/g, '')}${Math.floor(Math.random() * 10000)}`;

    const randomPassword = `auto_${Math.random().toString(36).slice(-8)}`;
    let userId;
    let clerkSuccess = false;

    // Create Clerk user
    try {
      const user = await clerkClient.users.createUser({
        emailAddress: [emailLower],
        username: username,
        firstName,
        lastName,
        password: randomPassword,
        skipEmailVerification: true,
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
      clerkSuccess = true;
      console.log('✅ Clerk user created:', userId);
    } catch (clerkError) {
      console.error('❌ Clerk creation FAILED:', clerkError.message);
      userId = `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    const timestampKey = Date.now().toString();

    // Firebase writes
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

    // 🔥 REFERRAL CHAIN UPDATE
    if (referredBy && referralId) {
      try {
        console.log('🔗 Updating referral chain:', { referredBy, referralId });
        const referrerFormSnap = await db.ref('Mainformdata')
          .orderByChild('uid').equalTo(referredBy).once('value');

        const updatePromises = [];
        referrerFormSnap.forEach((snapshot) => {
          const referrerKey = snapshot.key;
          updatePromises.push(
            db.ref(`Mainformdata/${referrerKey}/referrals/${referralId}`).update({
              name: name.trim(),
              email: emailLower,
              mobile: mobile?.trim() || '',
              status: 'completed',
              completedAt: Date.now()
            })
          );
        });

        await Promise.all(updatePromises);
        console.log('✅ Referral updated:', referralId);
      } catch (referralError) {
        console.log('⚠️ Referral update skipped:', referralError.message);
      }
    }

    // Google Sheets
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

    if (clerkSuccess) {
      res.json({
        success: true,
        userId: userId,
        email: emailLower,
        tempPassword: randomPassword,
        firstName,
        redirect: '/paymentpagetest'
      });
    } else {
      res.json({
        success: true,
        userId: userId,
        email: emailLower,
        tempPassword: null,
        firstName,
        redirect: null,
        warning: 'Clerk unavailable, account saved but payment requires login'
      });
    }

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
