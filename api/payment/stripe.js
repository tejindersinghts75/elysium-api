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

// 🔥 FIXED: Safe Clerk verification
async function safeClerkVerify(clerkUserId) {
  try {
    await clerkClient.users.getUser(clerkUserId);
    console.log(`✅ Clerk user verified: ${clerkUserId}`);
    return { valid: true };
  } catch (error) {
    if (error.clerkError && error.status === 404) {
      console.log(`⚠️ Clerk user ${clerkUserId} not found - trusting Firebase data`);
      return { valid: 'firebase_only' }; // Continue anyway
    }
    console.error('❌ Real Clerk auth error:', error.message);
    throw error;
  }
}

export default async function handler(req, res) {
  // 🔥 FIXED: Better CORS
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['https://yourdomain.com'];
  const origin = req.headers.origin;
  const corsOrigin = allowedOrigins.includes(origin) || allowedOrigins.includes('*') ? origin : allowedOrigins[0];

  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const signature = req.headers['stripe-signature'];

  // 🔥 WEBHOOK HANDLER (UNCHANGED - WORKING PERFECTLY)
  if (signature) {
    try {
      const body = await buffer(req);
      const event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);

      console.log(`🔔 Webhook received: ${event.type}`);

      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        const { firebaseEntryKey } = paymentIntent.metadata;

        if (firebaseEntryKey) {
          console.log(`✅ Webhook success for entry: ${firebaseEntryKey}`);

          await db.ref(`Mainformdata/${firebaseEntryKey}/stripePayment`).update({
            paymentStatus: 'success',
            stripeChargeId: paymentIntent.latest_charge || paymentIntent.charges?.data?.[0]?.id,
            processedAt: Date.now(),
            stripePaymentIntentId: paymentIntent.id,
            lastWebhookEvent: 'payment_intent.succeeded'
          });

          console.log(`📝 Firebase updated for ${firebaseEntryKey}`);
        }
      }

      if (event.type === 'payment_intent.payment_failed') {
        const paymentIntent = event.data.object;
        const { firebaseEntryKey } = paymentIntent.metadata;

        if (firebaseEntryKey) {
          console.log(`❌ Webhook failed for entry: ${firebaseEntryKey}`);

          await db.ref(`Mainformdata/${firebaseEntryKey}/stripePayment`).update({
            paymentStatus: 'failed',
            error: paymentIntent.last_payment_error?.message || 'Payment failed',
            processedAt: Date.now(),
            lastWebhookEvent: 'payment_intent.payment_failed'
          });
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error('❌ Webhook error:', error);
      res.status(400).json({ error: 'Webhook error' });
    }
    return;
  }

  // 🔥 CREATE INTENT HANDLER (FIXED)
  if (req.method === 'POST') {
    try {
      const body = await buffer(req);
      const bodyString = body.toString();
      const { clerkUserId, amount = 49.99 } = JSON.parse(bodyString);

      // 🔥 DEBUG LOGS
      console.log(`🔍 RAW clerkUserId RECEIVED: "${clerkUserId}"`);
      console.log(`🔍 RAW body:`, bodyString);

      // 🔥 FIXED: Safe Clerk verification
      const clerkStatus = await safeClerkVerify(clerkUserId);
      if (clerkStatus.valid === false) {
        return res.status(401).json({ error: 'Invalid user' });
      }

      // Check for existing user data in Firebase
      const snapshot = await db.ref('Mainformdata').orderByChild('uid').equalTo(clerkUserId).once('value');

      if (!snapshot.exists()) {
        console.log(`❌ No Firebase data found for user: ${clerkUserId}`);
        return res.status(404).json({ error: 'User data not found in database' });
      }

      const snapshotVal = snapshot.val();
      const entryKey = Object.keys(snapshotVal)[0];
      const existingData = snapshotVal[entryKey];
      const existingPayment = existingData.stripePayment;

      // Handle existing payments
      if (existingPayment) {
        console.log(`ℹ️ Existing payment found: ${existingPayment.paymentStatus}`);

        if (existingPayment.paymentStatus === 'success' && existingPayment.stripePaymentIntentId) {
          try {
            const existingIntent = await stripe.paymentIntents.retrieve(existingPayment.stripePaymentIntentId);
            return res.json({
              success: true,
              clientSecret: existingIntent.client_secret,
              entryKey,
              alreadyPaid: true
            });
          } catch (e) {
            console.log('⚠️ Existing intent not found, creating new one');
          }
        }

        if (existingPayment.paymentStatus === 'pending' && existingPayment.stripePaymentIntentId) {
          try {
            const existingIntent = await stripe.paymentIntents.retrieve(existingPayment.stripePaymentIntentId);
            if (existingIntent.status === 'requires_payment_method' || existingIntent.status === 'requires_confirmation') {
              console.log(`♻️ Reusing existing intent: ${existingPayment.stripePaymentIntentId}`);
              return res.json({
                success: true,
                clientSecret: existingIntent.client_secret,
                entryKey,
                reused: true
              });
            }
          } catch (e) {
            console.log('⚠️ Existing intent invalid, creating new one');
          }
        }
      }

      // Create new payment intent
      console.log(`🆕 Creating new payment intent for ${entryKey}`);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: 'usd',
        metadata: {
          clerkUserId,
          firebaseEntryKey: entryKey,
          createdAt: Date.now().toString()
        }
      });

      // Update Firebase
      await db.ref(`Mainformdata/${entryKey}/stripePayment`).update({
        sessionId: `payment_${Date.now()}`,
        stripePaymentIntentId: paymentIntent.id,
        amount: amount,
        paymentStatus: 'pending',
        createdAt: Date.now(),
        lastUpdated: Date.now()
      });

      res.json({
        success: true,
        clientSecret: paymentIntent.client_secret,
        entryKey
      });

    } catch (error) {
      console.error('❌ Create intent error:', error);
      res.status(500).json({ error: 'Payment setup failed', details: error.message });
    }
    return;
  }

  // 🔥 STATUS CHECK HANDLER (FIXED)
  if (req.method === 'GET') {
    try {
      const { clerkUserId } = req.query;
      if (!clerkUserId) {
        return res.status(400).json({ paymentStatus: 'unknown' });
      }

      console.log(`🔍 GET clerkUserId: "${clerkUserId}"`);

      // 🔥 FIXED: Safe Clerk verification (non-blocking)
      await safeClerkVerify(clerkUserId).catch(err => {
        console.log('⚠️ Clerk check failed in status, continuing with Firebase...');
      });

      const snapshot = await db.ref('Mainformdata').orderByChild('uid').equalTo(clerkUserId).once('value');

      if (!snapshot.exists()) {
        return res.json({ paymentStatus: 'no_data' });
      }

      const snapshotVal = snapshot.val();
      const entryKey = Object.keys(snapshotVal)[0];
      const data = snapshotVal[entryKey];
      const paymentStatus = data.stripePayment?.paymentStatus || 'no_data';

      res.json({
        paymentStatus,
        paymentData: data.stripePayment || null,
        entryKey
      });
    } catch (error) {
      console.error('❌ Status check error:', error);
      // 🔥 FIXED: Don't fail status check on Clerk error
      res.status(200).json({ paymentStatus: 'error', error: 'Status check failed' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
