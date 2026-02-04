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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const signature = req.headers['stripe-signature'];

  // 🔥 WEBHOOK HANDLER
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
          console.log(`💰 Payment Intent ID: ${paymentIntent.id}`);
          console.log(`🔑 Charge ID: ${paymentIntent.charges?.data?.[0]?.id}`);

          // 🔥 FIX: Update ALL payment fields at once
          await db.ref(`Mainformdata/${firebaseEntryKey}/stripePayment`).update({
            paymentStatus: 'success',
            stripeChargeId: paymentIntent.charges?.data?.[0]?.id || paymentIntent.latest_charge,
            processedAt: Date.now(),
            stripePaymentIntentId: paymentIntent.id, // Keep this reference
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

  // 🔥 CREATE INTENT HANDLER
  if (req.method === 'POST') {
    try {
      const body = await buffer(req);
      const bodyString = body.toString();
      const { clerkUserId, amount = 49.99 } = JSON.parse(bodyString);

      console.log(`📝 Creating intent for user: ${clerkUserId}`);

      // Verify user exists
      await clerkClient.users.getUser(clerkUserId);

      // Check for existing user data
      const snapshot = await db.ref('Mainformdata').orderByChild('uid').equalTo(clerkUserId).once('value');

      if (!snapshot.exists()) {
        console.log(`❌ No data found for user: ${clerkUserId}`);
        return res.status(404).json({ error: 'User data not found' });
      }

      const snapshotVal = snapshot.val();
      const entryKey = Object.keys(snapshotVal)[0];
      const existingData = snapshotVal[entryKey];

      // 🔥 FIX: Check if there's already a pending/successful payment
      const existingPayment = existingData.stripePayment;

      if (existingPayment) {
        console.log(`ℹ️ Existing payment found: ${existingPayment.paymentStatus}`);

        // If payment is already successful, don't create new intent
        if (existingPayment.paymentStatus === 'success') {
          console.log(`✅ Payment already successful for ${entryKey}`);

          // Check if payment intent still exists in Stripe
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

        // If payment is pending, reuse the same intent
        if (existingPayment.paymentStatus === 'pending' && existingPayment.stripePaymentIntentId) {
          try {
            const existingIntent = await stripe.paymentIntents.retrieve(existingPayment.stripePaymentIntentId);

            if (existingIntent.status === 'requires_payment_method' ||
                existingIntent.status === 'requires_confirmation') {
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

      console.log(`✅ Created intent: ${paymentIntent.id}`);

      // 🔥 FIX: Update ONLY the stripePayment object
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

  // 🔥 STATUS CHECK HANDLER
  if (req.method === 'GET') {
    try {
      const { clerkUserId } = req.query;
      if (!clerkUserId) {
        return res.status(400).json({ paymentStatus: 'unknown' });
      }

      await clerkClient.users.getUser(clerkUserId);
      const snapshot = await db.ref('Mainformdata').orderByChild('uid').equalTo(clerkUserId).once('value');

      if (!snapshot.exists()) {
        return res.json({ paymentStatus: 'no_data' });
      }

      const snapshotVal = snapshot.val();
      const entryKey = Object.keys(snapshotVal)[0];
      const data = snapshotVal[entryKey];

      // 🔥 FIX: Get payment status with fallback
      const paymentStatus = data.stripePayment?.paymentStatus || 'no_data';

      // Also return the full payment data for debugging
      res.json({
        paymentStatus,
        paymentData: data.stripePayment || null,
        entryKey
      });
    } catch (error) {
      console.error('❌ Status check error:', error);
      res.status(500).json({ paymentStatus: 'error', error: error.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}