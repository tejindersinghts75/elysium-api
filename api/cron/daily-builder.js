import Stripe from 'stripe';
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { generateBuilderLink } from '../../lib/generateBuilderLink.js';  // Fixed path

// 🔥 INIT (same as others)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: process.env.FIREBASE_URL
});
const db = getDatabase(app);

export default async function handler(req, res) {
  // Security: Only Vercel cron
  if (req.headers['user-agent'] !== 'vercel-cron/1.0') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const today = new Date().toISOString().split('T')[0];

    // Find ALL users due TODAY
    const snapshot = await db.ref('Mainformdata').orderByChild('builderPlan/nextDue').equalTo(today).once('value');

    if (!snapshot.exists()) {
      console.log('📅 No payments due today');
      return res.json({ success: true, processed: 0 });
    }

    let processed = 0;

    // 🔥 FIXED: Process users one by one (await each)
    snapshot.forEach(async (childSnapshot) => {
      const entryKey = childSnapshot.key;
      const data = childSnapshot.val();
      const clerkUserId = data.uid;

      if (clerkUserId) {
        try {
          await generateBuilderLink(clerkUserId, 0);  // Await!
          console.log(`✅ Cron processed: ${entryKey}`);
          processed++;
        } catch (err) {
          console.error(`❌ Cron failed ${entryKey}:`, err);
        }
      }
    });

    console.log(`📅 Cron finished. Processed ${processed} users due today`);
    res.json({ success: true, processed });

  } catch (error) {
    console.error('❌ Cron error:', error);
    res.status(500).json({ error: 'Cron failed' });
  }
}
