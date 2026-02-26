import Stripe from 'stripe';
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { buffer } from 'micro';

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
    let successCount = 0;

    // Process each user
    snapshot.forEach(async (childSnapshot) => {
      const entryKey = childSnapshot.key;
      const data = childSnapshot.val();
      const clerkUserId = data.uid;

      if (clerkUserId) {
        try {
          // MANUAL CALL - same logic as stripe.js (no date check for cron)
          const userSnapshot = await db.ref('Mainformdata').orderByChild('uid').equalTo(clerkUserId).once('value');
          const userData = userSnapshot.val();
          const userEntryKey = Object.keys(userData)[0];
          const builderPlan = userData[userEntryKey]?.builderPlan;

          if (builderPlan?.schedule && builderPlan.schedule[0] && builderPlan.schedule[0].status !== 'paid') {
            const installment = builderPlan.schedule[0];

            // Create Stripe link (same logic)
            const paymentLink = await stripe.paymentLinks.create({
              line_items: [{
                price_data: {
                  currency: 'usd',
                  product_data: {
                    name: `Founding Builder Installment #1`,
                    description: `Due ${installment.date} - $${installment.amount}`
                  },
                  unit_amount: Math.round(installment.amount * 100)
                },
                quantity: 1
              }],
              metadata: {
                clerkUserId,
                firebaseEntryKey: userEntryKey,
                installmentIndex: '0',
                planType: builderPlan.planType
              }
            });

            // Update Firebase
            await db.ref(`Mainformdata/${userEntryKey}/builderPlan/schedule/0`).update({
              status: 'pending',
              stripeLink: paymentLink.url,
              linkGeneratedAt: Date.now(),
              reminderCount: 0
            });

            // Update nextDue
            if (builderPlan.schedule[1]) {
              await db.ref(`Mainformdata/${userEntryKey}/builderPlan`).update({
                nextDue: builderPlan.schedule[1].date
              });
            }

            console.log(`✅ Cron: ${userEntryKey} link generated`);
            successCount++;
          }
          processed++;
        } catch (err) {
          console.error(`❌ Cron failed ${entryKey}:`, err);
        }
      }
    });

    console.log(`📅 Cron complete: ${successCount}/${processed} users processed`);
    res.json({ success: true, processed, successCount });

  } catch (error) {
    console.error('❌ Cron error:', error);
    res.status(500).json({ error: 'Cron failed' });
  }
}
