import Stripe from 'stripe';
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({
    credential: cert(serviceAccount),
    databaseURL: process.env.FIREBASE_URL
});
const db = getDatabase(app);

export default async function handler(req, res) {
    if (req.headers['user-agent'] !== 'vercel-cron/1.0') {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        const today = new Date().toISOString().split('T')[0];
        const snapshot = await db.ref('Mainformdata').orderByChild('builderPlan/nextDue').equalTo(today).once('value');

        if (!snapshot.exists()) {
            console.log('📅 No payments due today');
            return res.json({ success: true, processed: 0 });
        }

        const users = [];
        snapshot.forEach((childSnapshot) => {
            users.push(childSnapshot.val());
        });

        let processed = 0;
        let successCount = 0;

        // 🔥 FIXED: Process ONE BY ONE (waits!)
       for (const data of users) {
  const clerkUserId = data.uid;
  if (!clerkUserId) continue;

  try {
    const userSnapshot = await db.ref('Mainformdata')
      .orderByChild('uid')
      .equalTo(clerkUserId)
      .once('value');

    const userData = userSnapshot.val();
    const userEntryKey = Object.keys(userData)[0];
    const builderPlan = userData[userEntryKey]?.builderPlan;

    if (!builderPlan?.schedule?.length) continue;

    // ✅ FIND WHICH INSTALLMENT MATCHES nextDue
    const installmentIndex = builderPlan.schedule.findIndex(
      s => s.date === builderPlan.nextDue && s.status !== 'paid'
    );

    // nothing to process
    if (installmentIndex === -1) {
      processed++;
      continue;
    }

    const installment = builderPlan.schedule[installmentIndex];

    // already has link generated → skip
    if (installment.status === 'pending') {
      processed++;
      continue;
    }

    // ✅ CREATE STRIPE LINK FOR CORRECT INSTALLMENT
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Founding Builder Installment #${installmentIndex + 1}`,
            description: `Due ${installment.date} - $${installment.amount}`
          },
          unit_amount: Math.round(installment.amount * 100)
        },
        quantity: 1
      }],
      payment_intent_data: {
        metadata: {
          clerkUserId,
          firebaseEntryKey: userEntryKey,
          installmentIndex: installmentIndex.toString(),
          planType: builderPlan.planType,
          paymentType: 'builder_installment'
        }
      }
    });

    // ✅ UPDATE CORRECT SCHEDULE NODE
    await db.ref(`Mainformdata/${userEntryKey}/builderPlan/schedule/${installmentIndex}`).update({
      status: 'pending',
      stripeLink: paymentLink.url,
      linkGeneratedAt: Date.now(),
      reminderCount: 0
    });

    // ✅ MOVE nextDue TO NEXT UNPAID INSTALLMENT
    const nextUnpaid = builderPlan.schedule.find(
      (s, i) => i > installmentIndex && s.status !== 'paid'
    );

    if (nextUnpaid) {
      await db.ref(`Mainformdata/${userEntryKey}/builderPlan`).update({
        nextDue: nextUnpaid.date
      });
    }

    console.log(`✅ AUTO: ${userEntryKey} installment #${installmentIndex + 1}`);
    successCount++;
    processed++;

  } catch (err) {
    console.error(`❌ Cron failed ${data.entryKey}:`, err);
  }
}

        console.log(`📅 Cron complete: ${successCount}/${processed}`);
        res.json({ success: true, processed, successCount });

    } catch (error) {
        console.error('❌ Cron error:', error);
        res.status(500).json({ error: 'Cron failed' });
    }
}
