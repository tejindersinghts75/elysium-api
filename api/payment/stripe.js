import Stripe from 'stripe';
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { createClerkClient } from '@clerk/backend';
import { buffer } from 'micro';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20'
});

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: process.env.FIREBASE_URL
});
const db = getDatabase(app);
const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

// 🔥 MASTER PLAN PRICES
const PLAN_PRICES = {
  loft: 1574.1,
  studio: 2000,
  "2bhk": 2500,
  "4bhk": 3000
};

export const config = {
  api: { bodyParser: false }
};

/* =========================
   CLERK VERIFY
========================= */
async function safeClerkVerify(clerkUserId) {
  try {
    await clerkClient.users.getUser(clerkUserId);
    console.log(`✅ Clerk user verified: ${clerkUserId}`);
    return { valid: true };
  } catch (error) {
    if (error.clerkError && error.status === 404) {
      console.log(`⚠️ Clerk user ${clerkUserId} not found - trusting Firebase`);
      return { valid: 'firebase_only' };
    }
    console.error('❌ Clerk error:', error.message);
    throw error;
  }
}

/* =========================
   MAIN HANDLER - FULL FEATURED
========================= */
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Health check
  if (req.method === 'GET' && req.query.health) {
    return res.json({
      status: 'ok',
      timestamp: Date.now(),
      supports: ['deposit', 'backer', 'upgrade']
    });
  }

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const signature = req.headers['stripe-signature'];

  /* =====================================================
     🔥 STRIPE WEBHOOK (DEPOSIT + BACKER + UPGRADE)
  ===================================================== */
  if (signature) {
    try {
      const body = await buffer(req);
      const event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
      console.log(`🔔 Webhook: ${event.type}`);

      if (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed') {
        const paymentIntent = event.data.object;
        const { firebaseEntryKey, paymentType } = paymentIntent.metadata;

        if (!firebaseEntryKey || !paymentType) {
          console.log('⚠️ Missing metadata, skipping');
          return res.json({ received: true });
        }

        const paymentPath = paymentType === 'backer' ? 'backerPayment' : 'stripePayment';
        const updateData = {
          paymentStatus: event.type === 'payment_intent.succeeded' ? 'success' : 'failed',
          stripeChargeId: paymentIntent.latest_charge,
          stripePaymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount / 100,
          processedAt: Date.now(),
          lastWebhookEvent: event.type,
          paymentType


        };


        if (event.type === 'payment_intent.payment_failed') {
          updateData.error = paymentIntent.last_payment_error?.message || 'Payment failed';
        }

        await db.ref(`Mainformdata/${firebaseEntryKey}/${paymentPath}`).update(updateData);
        console.log(`✅ Webhook ${paymentType}: ${firebaseEntryKey}`);

        // 🔥 CORRECT - FIRST TIME ONLY
        if (paymentType === 'backer' && event.type === 'payment_intent.succeeded') {
          const backerRef = db.ref(`Mainformdata/${firebaseEntryKey}/backerPayment`);
          const snap = await backerRef.once('value');
          if (!snap.val()?.refundWindowStart) {  // ← CHECK EXISTS
            await backerRef.update({
              refundWindowStart: Date.now(),
              refundStatus: 'eligible'
            });
          }
        }

        /* 🔥 PLAN UPGRADE HANDLER */
        if (event.type === 'payment_intent.succeeded' && paymentIntent.metadata?.upgrade === "true") {
          const targetPlan = paymentIntent.metadata.targetPlan;
          const newPlanPrice = parseFloat(paymentIntent.metadata.newPlanPrice);

          const userRef = db.ref(`Mainformdata/${firebaseEntryKey}`);
          const snap = await userRef.once('value');
          const userData = snap.val();
          const oldPlanPrice = parseFloat(userData?.PaymentFormData?.priceperfoot || 0);

          // Update current plan
          await userRef.child('PaymentFormData').update({
            priceperfoot: newPlanPrice,
            selectedPlan: targetPlan
          });

          // Set full backer amount
          await userRef.child('backerPayment').update({
            amount: newPlanPrice,
            lastWebhookEvent: "upgrade_success"
          });

          // Upgrade history
          await userRef.child(`upgradeHistory/${Date.now()}`).set({
            fromPlanPrice: oldPlanPrice,
            toPlan: targetPlan,
            newPlanPrice,
            upgradePaid: paymentIntent.amount / 100,
            upgradedAt: Date.now(),
            stripePaymentIntentId: paymentIntent.id
          });

          console.log(`✅ UPGRADE → ${targetPlan} ($${newPlanPrice})`);
        }
      }

      return res.json({ received: true });
    } catch (error) {
      console.error('❌ Webhook error:', error.message);
      return res.status(400).json({ error: 'Webhook error' });
    }
  }

  /* =====================================================
     🔥 STATIC PRICING ENDPOINT
  ===================================================== */
  if (req.method === 'GET' && req.query.pricing) {
    return res.json({
      deposit: 99.00,
      backer: 2000.00,  // Fallback
      addon: 29.95,
      plans: PLAN_PRICES
    });
  }

  /* =====================================================
     🔥 DYNAMIC BACKER PRICING (from Firebase)
  ===================================================== */
  if (req.method === 'GET' && req.query.backerPricing) {
    try {
      const { clerkUserId } = req.query;
      if (!clerkUserId) return res.status(400).json({ error: 'Missing clerkUserId' });

      const snapshot = await db.ref('Mainformdata').orderByChild('uid').equalTo(clerkUserId).once('value');
      if (!snapshot.exists()) return res.status(404).json({ error: 'No user data' });

      const snapshotVal = snapshot.val();
      const entryKey = Object.keys(snapshotVal)[0];
      const paymentFormData = snapshotVal[entryKey]?.PaymentFormData;

      const backerPrice = parseFloat(paymentFormData?.priceperfoot) || 0;
      if (backerPrice === 0) {
        return res.status(404).json({ error: 'No priceperfoot found' });
      }

      console.log(`💰 Backer pricing: $${backerPrice.toFixed(2)}`);
      return res.json({
        backerPrice,
        entryKey,
        pricePerFootRaw: paymentFormData.priceperfoot,
        currency: 'usd'
      });
    } catch (error) {
      console.error('❌ Pricing error:', error);
      return res.status(500).json({ error: 'Pricing fetch failed' });
    }
  }

  /* =====================================================
     🔥 PAYMENT STATUS CHECK
  ===================================================== */
  if (req.method === 'GET' && (req.query.status || !req.query.backerPricing)) {
    try {
      const { clerkUserId, paymentType = 'deposit' } = req.query;
      if (!clerkUserId) return res.status(400).json({ paymentStatus: 'unknown' });

      const snapshot = await db.ref('Mainformdata').orderByChild('uid').equalTo(clerkUserId).once('value');
      if (!snapshot.exists()) return res.json({ paymentStatus: 'no_data' });

      const snapshotVal = snapshot.val();
      const entryKey = Object.keys(snapshotVal)[0];
      const paymentPath = paymentType === 'backer' ? 'backerPayment' : 'stripePayment';
      const paymentData = snapshotVal[entryKey]?.[paymentPath];

      return res.json({
        paymentStatus: paymentData?.paymentStatus || 'no_data',
        paymentData,
        entryKey,
        paymentType,
        paymentPath
      });
    } catch (error) {
      console.error('❌ Status error:', error);
      return res.status(200).json({ paymentStatus: 'error' });
    }
  }
  /* =====================================================
   🔥 REFUND STATUS CHECK
======================================================== */
if (req.method === 'GET' && req.query.refundStatus) {
  try {
    const { clerkUserId } = req.query;
    if (!clerkUserId) return res.status(400).json({ refundEligible: false });

    const snapshot = await db.ref('Mainformdata').orderByChild('uid').equalTo(clerkUserId).once('value');
    if (!snapshot.exists()) return res.json({ refundEligible: false, reason: 'no_user' });

    const snapshotVal = snapshot.val();
    const entryKey = Object.keys(snapshotVal)[0];
    const backerData = snapshotVal[entryKey]?.backerPayment;

    const windowStart = backerData?.refundWindowStart;
    if (!windowStart || backerData?.refundStatus !== 'eligible') {
      return res.json({ refundEligible: false, entryKey });
    }

    const now = Date.now();
   // const windowEnd = windowStart + (90 * 24 * 60 * 60 * 1000);
      const windowEnd = windowStart + (30 * 1000);
    const expired = now >= windowEnd;

    return res.json({
      refundEligible: !expired,
       daysLeft: Math.max(0, Math.ceil((windowEnd - now) / 1000)),
    //  daysLeft: Math.max(0, Math.ceil((windowEnd - now) / (86400000))),
      entryKey
    });
  } catch (error) {
    console.error('❌ Refund status error:', error);
    return res.status(500).json({ refundEligible: false });
  }
}


  /* =====================================================
     🔥 CREATE PAYMENT INTENT (DEPOSIT/BACKER/UPGRADE)
  ===================================================== */
  if (req.method === 'POST') {
    try {
      const body = await buffer(req);
      const {
        clerkUserId,
        paymentType = 'deposit',
        addons = [],
        dynamicAmount,
        targetPlan  // 🔥 UPGRADE SUPPORT
      } = JSON.parse(body.toString());

      if (!clerkUserId) {
        return res.status(400).json({ error: 'Missing clerkUserId' });
      }

      console.log(`🔍 ${paymentType} for ${clerkUserId}, targetPlan: ${targetPlan}`);

      // 🔥 FETCH USER FIRST
      const snapshot = await db.ref('Mainformdata').orderByChild('uid').equalTo(clerkUserId).once('value');
      if (!snapshot.exists()) {
        return res.status(404).json({ error: 'No user data found' });
      }

      const snapshotVal = snapshot.val();
      const entryKey = Object.keys(snapshotVal)[0];
      const userData = snapshotVal[entryKey];

      // 🔥 PRICING LOGIC
      let totalAmount;

      /* UPGRADE */
      if (paymentType === 'backer' && targetPlan) {
        const currentPaid = parseFloat(userData?.backerPayment?.amount || 0);
        const newPlanPrice = PLAN_PRICES[targetPlan];

        if (!newPlanPrice) {
          return res.status(400).json({ error: 'Invalid plan' });
        }

        const upgradeAmount = newPlanPrice - currentPaid;
        if (upgradeAmount <= 0) {
          return res.status(400).json({ error: 'Nothing to upgrade' });
        }

        totalAmount = upgradeAmount;
        console.log(`🔼 Upgrade charge: $${upgradeAmount.toFixed(2)}`);
      }
      /* FIRST FULL BACKER */
      else if (paymentType === 'backer') {
        const dbPrice = parseFloat(userData?.PaymentFormData?.priceperfoot || 0);
        if (!dbPrice) {
          return res.status(400).json({ error: 'No unit price in DB' });
        }
        totalAmount = dbPrice;
      }
      /* DEPOSIT */
      else {
        const BASE_PRICE = 99.00;
        const ADDON_PRICE = 29.95;
        totalAmount = BASE_PRICE + (addons.length ? ADDON_PRICE : 0);
      }

      if (totalAmount < 0.50) {
        return res.status(400).json({ error: 'Amount too small' });
      }

      // Clerk verify
      await safeClerkVerify(clerkUserId).catch(() => {
        console.log('⚠️ Clerk check skipped');
      });

      const paymentPath = paymentType === 'backer' ? 'backerPayment' : 'stripePayment';
      const existingPayment = userData?.[paymentPath];

      let paymentIntent;
      let intentAction = 'created';

      // 🔥 REUSE EXISTING INTENT (your original logic)
      if (existingPayment?.stripePaymentIntentId) {
        try {
          paymentIntent = await stripe.paymentIntents.retrieve(existingPayment.stripePaymentIntentId);
          const canUpdate = ['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(paymentIntent.status);

          if (canUpdate) {
            const existingAmount = paymentIntent.amount / 100;
            if (Math.abs(existingAmount - totalAmount) < 0.01) {
              intentAction = 'reused';
            } else {
              intentAction = 'updated';
              paymentIntent = await stripe.paymentIntents.update(existingPayment.stripePaymentIntentId, {
                amount: Math.round(totalAmount * 100),
                metadata: {
                  ...paymentIntent.metadata,
                  paymentType,
                  firebaseEntryKey: entryKey,
                  ...(targetPlan && {
                    upgrade: "true",
                    targetPlan,
                    newPlanPrice: PLAN_PRICES[targetPlan]?.toString()
                  }),
                  updatedAt: new Date().toISOString()
                }
              });
            }
          } else {
            paymentIntent = null;
          }
        } catch (error) {
          console.log('⚠️ Intent reuse failed:', error.message);
          paymentIntent = null;
        }
      }

      // 🔥 CREATE NEW INTENT
      if (!paymentIntent) {
        paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(totalAmount * 100),
          currency: 'usd',
          metadata: {
            clerkUserId,
            firebaseEntryKey: entryKey,
            paymentType,
            ...(targetPlan && {
              upgrade: "true",
              targetPlan,
              newPlanPrice: PLAN_PRICES[targetPlan]?.toString()
            }),
            ...(paymentType === 'backer' && { dynamicAmount: totalAmount.toString() }),
            addons: JSON.stringify(addons),
            totalAmount: totalAmount.toString(),
            createdAt: new Date().toISOString()
          }
        });
        console.log(`🚀 ${intentAction} ${paymentType}: $${totalAmount.toFixed(2)}`);
      }

      // 🔥 SAVE TO FIREBASE
      // await db.ref(`Mainformdata/${entryKey}/${paymentPath}`).update({
      //   sessionId: `${paymentType}_${Date.now()}`,
      //   stripePaymentIntentId: paymentIntent.id,
      //   amount: totalAmount,
      //   ...(paymentType === 'backer' && !targetPlan && { priceperfoot: totalAmount }),
      //   paymentStatus: 'pending',
      //   paymentType,
      //   lastUpdated: Date.now(),
      //   intentAction
      // });

      return res.json({
        success: true,
        clientSecret: paymentIntent.client_secret,
        entryKey,
        paymentType,
        paymentPath,
        amount: totalAmount,
        status: 'ready'
      });

    } catch (error) {
      console.error('❌ POST error:', error.message);
      return res.status(500).json({ error: 'Payment setup failed', details: error.message });
    }
  }

  // 405 for everything else
  return res.status(405).json({ error: 'Method not allowed' });
}
