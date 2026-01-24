import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { v4 as uuidv4 } from 'uuid';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: "https://alcester-578d6-default-rtdb.firebaseio.com/"  // ✅ Fixed
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

    // 1. RATE LIMITING ✅ Already fixed
    const cleanIp = ip.replace(/\./g, '_').replace(/:/g, '_');
    const minuteBucket = Math.floor(startTime / 60000);
    const rateKey = `rate/${cleanIp}/${minuteBucket}`;
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

    // 3-8. Rest of your code is PERFECT ✅

    // 5. CLERK USER CREATION (FIXED BUFFER)
    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '';

    const clerkRes = await fetch('https://api.clerk.com/v1/users', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${process.env.CLERK_SECRET_KEY}:`)}`,  // ✅ FIXED
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        email_addresses: [{ email_address: emailLower }],
        unsafe_metadata: { mobile, selectedCity, profession, income, household, why, createdAt: Date.now() }
      })
    });

    // Rest of your code unchanged...
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
