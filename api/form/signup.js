import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { v4 as uuidv4 } from 'uuid';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: `https://${serviceAccount.project_id}.firebaseio.com/`  // ← ADD THIS LINE
});
const db = getDatabase(app);


export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const startTime = Date.now();
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  try {
    const {
      name, email, mobile, selectedCity, profession, income, household, why,
      captchaToken, referredBy, referralId
    } = req.body;

    // 1. RATE LIMITING (1/min per IP)
    const rateKey = `rate:${ip}:${Math.floor(startTime / 60000)}`;
    const rateCheck = await db.ref(rateKey).once('value');
    if (rateCheck.val() >= 2) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    await db.ref(rateKey).transaction(current => (current || 0) + 1);

    // 2. CAPTCHA VALIDATION
    const captchaRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${process.env.TURNSTILE_SECRET_KEY}&response=${captchaToken}&remoteip=${ip}`
    });
    const captchaData = await captchaRes.json();
    if (!captchaData.success) return res.status(400).json({ error: 'Invalid CAPTCHA' });

    // 3. VALIDATION + SANITIZATION
    const emailLower = email.toLowerCase().trim();
    if (!emailLower.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    // 4. EMAIL DEDUPLICATION
    const emailCheck = await db.ref('users').orderByChild('email').equalTo(emailLower).once('value');
    if (emailCheck.exists()) return res.status(400).json({ error: 'Email already registered' });

    // 5. CLERK USER CREATION (SERVER-SIDE)
    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '';

    const clerkRes = await fetch('https://api.clerk.com/v1/users', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${process.env.CLERK_SECRET_KEY}:`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        email_addresses: [{ email_address: emailLower }],
        unsafe_metadata: { mobile, selectedCity, profession, income, household, why, createdAt: Date.now() }
      })
    });

    const clerkUser = await clerkRes.json();
    if (!clerkUser.id || clerkRes.status !== 200) {
      return res.status(400).json({ error: 'Failed to create account' });
    }

    const userId = clerkUser.id;
    const timestampKey = Date.now().toString();

    // 6. FIREBASE WRITES (Admin SDK bypasses rules)
    await Promise.all([
      // Mainformdata
      db.ref(`Mainformdata/${timestampKey}`).set({
        uid: userId,
        name: name.trim(),
        email: emailLower,
        mobile: mobile?.trim() || '',
        selectedCity: selectedCity || 'Not selected',
        profession: profession || '',
        income: income || 'Not selected',
        household: household || 'Not selected',
        why: why?.trim() || '',
        referredBy,
        createdAt: Date.now()
      }),

      // Users collection
      db.ref(`users/${userId}`).set({
        firstname: firstName,
        lastname: lastName,
        email: emailLower,
        mobile: mobile?.trim() || '',
        createdAt: Date.now()
      })
    ]);

    // 7. REFERRAL CHAIN (if exists)
    let referrerDetails = {};
    if (referredBy && referralId) {
      const referrerSnap = await db.ref(`users/${referredBy}`).once('value');
      if (referrerSnap.exists()) {
        referrerDetails = referrerSnap.val();
      }

      // Find referrer's Mainformdata entry
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
    }

    // 8. GOOGLE SHEETS (Secure webhook)
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
      referredBy,
      referralId,
      referrerFirstName: referrerDetails.firstname || '',
      referrerLastName: referrerDetails.lastname || '',
      referrerEmail: referrerDetails.email || ''
    };

    fetch(process.env.GOOGLE_SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sheetsData)
    }).catch(console.error);

    console.log(`Signup complete: ${userId} (${ip}) in ${Date.now() - startTime}ms`);

    res.json({
      success: true,
      userId,
      redirect: '/thank-you',
      message: 'Welcome to Elysium!'
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
//fsafstejinder