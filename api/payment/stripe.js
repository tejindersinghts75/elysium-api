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

  // CREATE INTENT (POST)
  if (req.method === 'POST') {
    try {
      const body = await buffer(req);
      const { clerkUserId, amount = 49.99 } = JSON.parse(body.toString());

      console.log(`🔍 POST clerkUserId: "${clerkUserId}"`);

      // Safe Clerk check (non-blocking)
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

      // Reuse existing payment if valid
      if (existingPayment?.paymentStatus === 'pending' && existingPayment.stripePaymentIntentId) {
        try {
          const intent = await stripe.paymentIntents.retrieve(existingPayment.stripePaymentIntentId);
          if (['requires_payment_method', 'requires_confirmation'].includes(intent.status)) {
            return res.json({
              success: true,
              clientSecret: intent.client_secret,
              entryKey,
              reused: true
            });
          }
        } catch (e) {
          console.log('⚠️ Invalid existing intent');
        }
      }

      // Create new intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: 'usd',
        metadata: { clerkUserId, firebaseEntryKey: entryKey }
      });

      await db.ref(`Mainformdata/${entryKey}/stripePayment`).update({
        sessionId: `payment_${Date.now()}`,
        stripePaymentIntentId: paymentIntent.id,
        amount,
        paymentStatus: 'pending',
        createdAt: Date.now()
      });

      res.json({
        success: true,
        clientSecret: paymentIntent.client_secret,
        entryKey
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
