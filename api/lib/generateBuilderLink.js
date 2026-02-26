import Stripe from 'stripe';
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

// 🔥 INIT (same as stripe.js)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: process.env.FIREBASE_URL
});
const db = getDatabase(app);

export async function generateBuilderLink(clerkUserId, installmentIndex) {
  try {
    // Find user
    const snapshot = await db.ref('Mainformdata').orderByChild('uid').equalTo(clerkUserId).once('value');
    if (!snapshot.exists()) {
      return { success: false, error: 'No user data' };
    }

    const snapshotVal = snapshot.val();
    const entryKey = Object.keys(snapshotVal)[0];
    const builderPlan = snapshotVal[entryKey]?.builderPlan;

    if (!builderPlan?.schedule) {
      return { success: false, error: 'No builder plan found' };
    }

    const installment = builderPlan.schedule[installmentIndex];
    if (!installment || installment.status === 'paid') {
      return { success: false, error: 'Invalid or already paid installment' };
    }

    // Check date
    const today = new Date().toISOString().split('T')[0];
    const dueDate = installment.date;
    const daysDiff = (new Date(dueDate) - new Date(today)) / (1000 * 60 * 60 * 24);

    if (daysDiff > 0) {
      return {
        success: false,
        reason: 'too_early',
        daysUntilDue: Math.ceil(daysDiff),
        message: `Link available ${Math.ceil(daysDiff)} days before due date`
      };
    }

    // Create Stripe Payment Link
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
      metadata: {
        clerkUserId,
        firebaseEntryKey: entryKey,
        installmentIndex: installmentIndex.toString(),
        planType: builderPlan.planType
      }
    });

    // Update Firebase
    await db.ref(`Mainformdata/${entryKey}/builderPlan/schedule/${installmentIndex}`).update({
      status: 'pending',
      stripeLink: paymentLink.url,
      linkGeneratedAt: Date.now(),
      reminderCount: 0
    });

    // Update nextDue if first installment
    if (installmentIndex === 0 && builderPlan.nextDue === installment.date) {
      const nextIndex = 1;
      if (builderPlan.schedule[nextIndex]) {
        await db.ref(`Mainformdata/${entryKey}/builderPlan`).update({
          nextDue: builderPlan.schedule[nextIndex].date
        });
      }
    }

    console.log(`✅ Builder link generated: ${entryKey}[${installmentIndex}]`);
    return {
      success: true,
      stripeLink: paymentLink.url,
      entryKey,
      installmentIndex,
      amount: installment.amount
    };

  } catch (error) {
    console.error('❌ Builder link error:', error);
    return { success: false, error: 'Link generation failed' };
  }
}
