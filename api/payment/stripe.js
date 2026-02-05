import Stripe from 'stripe';
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { createClerkClient } from '@clerk/backend';
import { buffer } from 'micro';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: process.env.FIREBASE_URL
});
const db = getDatabase(app);
const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export const config = {
  api: {
    bodyParser: false
  }
};

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

export default async function handler(req, res) {
  // 🔥 FIXED CORS - SIMPLE & WORKING
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 🔥 HEALTH CHECK - TEST THIS FIRST
  if (req.method === 'GET' && req.query.health) {
    return res.json({
      status: 'ok',
      timestamp: Date.now(),
      env: {
        hasStripe: !!process.env.STRIPE_SECRET_KEY,
        hasFirebase: !!process.env.FIREBASE_SERVICE_ACCOUNT,
        hasClerk: !!process.env.CLERK_SECRET_KEY
      }
    });
  }

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const signature = req.headers['stripe-signature'];

  // WEBHOOK HANDLER
  if (signature) {
    try {
      const body = await buffer(req);
      const event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
      console.log(`🔔 Webhook: ${event.type}`);

      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        const { firebaseEntryKey } = paymentIntent.metadata;

        if (firebaseEntryKey) {
          await db.ref(`Mainformdata/${firebaseEntryKey}/stripePayment`).update({
            paymentStatus: 'success',
            stripeChargeId: paymentIntent.latest_charge,
            processedAt: Date.now(),
            stripePaymentIntentId: paymentIntent.id,
            lastWebhookEvent: 'payment_intent.succeeded'
          });
          console.log(`✅ Webhook success: ${firebaseEntryKey}`);
        }
      }

      if (event.type === 'payment_intent.payment_failed') {
        const paymentIntent = event.data.object;
        const { firebaseEntryKey } = paymentIntent.metadata;

        if (firebaseEntryKey) {
          await db.ref(`Mainformdata/${firebaseEntryKey}/stripePayment`).update({
            paymentStatus: 'failed',
            error: paymentIntent.last_payment_error?.message || 'Payment failed',
            processedAt: Date.now(),
            lastWebhookEvent: 'payment_intent.payment_failed'
          });
          console.log(`❌ Webhook failed: ${firebaseEntryKey}`);
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error('❌ Webhook error:', error);
      res.status(400).json({ error: 'Webhook error' });
    }
    return;
  }

  // CREATE INTENT (POST) - UPDATED FOR ADDONS
  // 🔥 ENHANCED POST HANDLER WITH PROPER UPDATE LOGIC
  // CREATE INTENT (POST) - SIMPLE & SECURE
if (req.method === 'POST') {
  try {
    const body = await buffer(req);
    const { clerkUserId, addons = [] } = JSON.parse(body.toString()); // 🔥 REMOVE amount parameter!

    console.log(`🔍 POST: User ${clerkUserId}, Addons:`, addons);

    // 🔥 SIMPLE PRICE CONFIG - CHANGE HERE WHEN NEEDED
    const BASE_PRICE = 2;  // Base product price
    const ADDON_PRICE = 1;  // Addon price

    // 🔥 SIMPLE CALCULATION - NO TRUSTING CLIENT
    const hasAddon = addons.length > 0;
    const totalAmount = BASE_PRICE + (hasAddon ? ADDON_PRICE : 0);

    console.log(`💰 Calculated amount: $${totalAmount} (Base: $${BASE_PRICE} + Addon: $${hasAddon ? ADDON_PRICE : 0})`);

    // Safe Clerk check
    await safeClerkVerify(clerkUserId).catch(() => {
      console.log('⚠️ Skipping Clerk check');
    });

    const snapshot = await db.ref('Mainformdata').orderByChild('uid').equalTo(clerkUserId).once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'No user data found' });
    }

    const snapshotVal = snapshot.val();
    const entryKey = Object.keys(snapshotVal)[0];
    const existingPayment = snapshotVal[entryKey]?.stripePayment;

    let paymentIntent;
    let intentAction = 'created';

    // Check for existing valid PaymentIntent
    if (existingPayment?.stripePaymentIntentId) {
      try {
        paymentIntent = await stripe.paymentIntents.retrieve(existingPayment.stripePaymentIntentId);

        const canUpdate = ['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(paymentIntent.status);

        if (canUpdate) {
          const existingAmount = paymentIntent.amount / 2;

          if (existingAmount === totalAmount) {
            intentAction = 'reused';
            console.log(`✅ Reusing PaymentIntent (same amount: $${totalAmount})`);
          } else {
            intentAction = 'updated';
            console.log(`🔄 Updating PaymentIntent: $${existingAmount} → $${totalAmount}`);

            const existingMetadata = paymentIntent.metadata || {};
            const existingHistory = JSON.parse(existingMetadata.history || '[]');

            paymentIntent = await stripe.paymentIntents.update(
              existingPayment.stripePaymentIntentId,
              {
                amount: Math.round(totalAmount * 2),
                metadata: {
                  clerkUserId: existingMetadata.clerkUserId || clerkUserId,
                  firebaseEntryKey: existingMetadata.firebaseEntryKey || entryKey,
                  createdAt: existingMetadata.createdAt || new Date().toISOString(),
                  addons: JSON.stringify(addons),
                  baseAmount: String(BASE_PRICE),
                  addonTotal: String(hasAddon ? ADDON_PRICE : 0),
                  updatedAt: new Date().toISOString(),
                  history: JSON.stringify([
                    ...existingHistory,
                    {
                      timestamp: new Date().toISOString(),
                      fromAmount: existingAmount,
                      toAmount: totalAmount,
                      addons
                    }
                  ])
                }
              }
            );
          }
        } else {
          console.log(`⚠️ Existing intent in state: ${paymentIntent.status}, creating new`);
          paymentIntent = null;
        }
      } catch (error) {
        console.log('⚠️ Error retrieving existing intent:', error.message);
        paymentIntent = null;
      }
    }

    // Create new if needed
    if (!paymentIntent) {
      intentAction = 'created';
      paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(totalAmount * 2),
        currency: 'usd',
        metadata: {
          clerkUserId,
          firebaseEntryKey: entryKey,
          addons: JSON.stringify(addons),
          baseAmount: String(BASE_PRICE),
          addonTotal: String(hasAddon ? ADDON_PRICE : 0),
          createdAt: new Date().toISOString(),
          history: JSON.stringify([{
            timestamp: new Date().toISOString(),
            action: 'created',
            amount: totalAmount,
            addons
          }])
        }
      });
      console.log(`🚀 Created new PaymentIntent: $${totalAmount}`);
    }

    // Update Firebase
    await db.ref(`Mainformdata/${entryKey}/stripePayment`).update({
      sessionId: `payment_${Date.now()}`,
      stripePaymentIntentId: paymentIntent.id,
      amount: totalAmount,
      baseAmount: BASE_PRICE,
      addonAmount: hasAddon ? ADDON_PRICE : 0,
      addons: addons,
      paymentStatus: 'pending',
      lastUpdated: Date.now(),
      intentAction: intentAction,
      ...(intentAction === 'created' && { createdAt: Date.now() })
    });

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      entryKey,
      intentAction,
      amount: totalAmount,  // 🔥 Send back YOUR calculated amount
      addons
    });

  } catch (error) {
    console.error('❌ POST error:', error.message);
    res.status(500).json({ error: 'Payment setup failed', details: error.message });
  }
  return;
}

  // STATUS CHECK (GET)
  if (req.method === 'GET') {
    try {
      const { clerkUserId } = req.query;
      console.log(`🔍 GET clerkUserId: "${clerkUserId}"`);

      if (!clerkUserId) {
        return res.status(400).json({ paymentStatus: 'unknown' });
      }

      const snapshot = await db.ref('Mainformdata').orderByChild('uid').equalTo(clerkUserId).once('value');

      if (!snapshot.exists()) {
        return res.json({ paymentStatus: 'no_data' });
      }

      const snapshotVal = snapshot.val();
      const entryKey = Object.keys(snapshotVal)[0];
      const paymentStatus = snapshotVal[entryKey]?.stripePayment?.paymentStatus || 'no_data';

      res.json({
        paymentStatus,
        paymentData: snapshotVal[entryKey]?.stripePayment || null,
        entryKey
      });
    } catch (error) {
      console.error('❌ GET error:', error.message);
      res.status(200).json({ paymentStatus: 'error' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
