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

// Cache for pending payment intents to prevent duplicates
const pendingIntents = new Map();

export default async function handler(req, res) {
  console.log(`📦 ${new Date().toISOString()} ${req.method} ${req.url}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const signature = req.headers['stripe-signature'];

  // ========== WEBHOOK HANDLER ==========
  if (signature) {
    try {
      const body = await buffer(req);
      const event = stripe.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      console.log(`🔔 Webhook: ${event.type} (${event.id})`);
      console.log('📋 Event data:', JSON.stringify(event.data.object, null, 2));

      // Handle successful payment
      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        const { clerkUserId, firebaseEntryKey } = paymentIntent.metadata;

        console.log(`💰 Payment succeeded:`, {
          intentId: paymentIntent.id,
          amount: paymentIntent.amount / 100,
          clerkUserId,
          firebaseEntryKey,
          metadata: paymentIntent.metadata
        });

        if (!firebaseEntryKey) {
          console.error('❌ Missing firebaseEntryKey in metadata');
          return res.json({ received: true });
        }

        // Verify user exists
        try {
          await clerkClient.users.getUser(clerkUserId);
          console.log(`✅ User verified: ${clerkUserId}`);
        } catch (userError) {
          console.error(`❌ User not found: ${clerkUserId}`, userError.message);
          // Still update Firebase if we have the entry key
        }

        // Update Firebase with atomic transaction
        const paymentRef = db.ref(`Mainformdata/${firebaseEntryKey}/stripePayment`);
        await paymentRef.update({
          paymentStatus: 'success',
          stripeChargeId: paymentIntent.latest_charge || paymentIntent.charges?.data?.[0]?.id,
          stripePaymentIntentId: paymentIntent.id,
          processedAt: Date.now(),
          lastUpdated: Date.now(),
          amount: paymentIntent.amount / 100,
          lastWebhookEvent: 'payment_intent.succeeded',
          webhookReceivedAt: Date.now()
        });

        console.log(`✅ Firebase updated for ${firebaseEntryKey}`);

        // Clear from pending cache
        pendingIntents.delete(firebaseEntryKey);
      }

      // Handle failed payment
      if (event.type === 'payment_intent.payment_failed') {
        const paymentIntent = event.data.object;
        const { clerkUserId, firebaseEntryKey } = paymentIntent.metadata;

        if (firebaseEntryKey) {
          await db.ref(`Mainformdata/${firebaseEntryKey}/stripePayment`).update({
            paymentStatus: 'failed',
            error: paymentIntent.last_payment_error?.message || 'Payment failed',
            processedAt: Date.now(),
            lastUpdated: Date.now(),
            lastWebhookEvent: 'payment_intent.payment_failed'
          });

          pendingIntents.delete(firebaseEntryKey);
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error('❌ Webhook error:', error);
      res.status(400).json({ error: 'Webhook error', details: error.message });
    }
    return;
  }

  // ========== CREATE PAYMENT INTENT ==========
  if (req.method === 'POST') {
    try {
      const body = await buffer(req);
      const { clerkUserId, amount = 49.99 } = JSON.parse(body.toString());

      console.log(`🎯 Creating intent for user: ${clerkUserId}`);

      // Verify user exists FIRST
      let clerkUser;
      try {
        clerkUser = await clerkClient.users.getUser(clerkUserId);
        console.log(`✅ User verified: ${clerkUser.id} (${clerkUser.emailAddresses?.[0]?.emailAddress})`);
      } catch (error) {
        console.error(`❌ Invalid user ID: ${clerkUserId}`, error.message);
        return res.status(404).json({
          error: 'User not found',
          details: `No user with ID: ${clerkUserId}`
        });
      }

      // Get user's data from Firebase
      const snapshot = await db.ref('Mainformdata')
        .orderByChild('uid')
        .equalTo(clerkUserId)
        .once('value');

      if (!snapshot.exists()) {
        console.log(`❌ No Firebase data for user: ${clerkUserId}`);
        return res.status(404).json({ error: 'User data not found in database' });
      }

      const snapshotVal = snapshot.val();
      const entryKey = Object.keys(snapshotVal)[0];
      const existingData = snapshotVal[entryKey];

      console.log(`📝 Found entry: ${entryKey}`);

      // Check for existing payment
      const existingPayment = existingData.stripePayment;

      // If payment already succeeded, return success
      if (existingPayment?.paymentStatus === 'success') {
        console.log(`✅ Payment already completed for ${entryKey}`);
        return res.json({
          success: true,
          alreadyPaid: true,
          paymentStatus: 'success',
          entryKey
        });
      }

      // Check cache for pending intent
      if (pendingIntents.has(entryKey)) {
        const cachedIntent = pendingIntents.get(entryKey);
        console.log(`♻️ Using cached intent for ${entryKey}`);
        return res.json({
          success: true,
          clientSecret: cachedIntent.client_secret,
          entryKey,
          reused: true
        });
      }

      // Check for existing pending intent in Stripe
      if (existingPayment?.stripePaymentIntentId && existingPayment.paymentStatus === 'pending') {
        try {
          const existingIntent = await stripe.paymentIntents.retrieve(
            existingPayment.stripePaymentIntentId
          );

          if (existingIntent.status === 'requires_payment_method' ||
              existingIntent.status === 'requires_confirmation') {
            console.log(`♻️ Reusing existing Stripe intent: ${existingIntent.id}`);

            pendingIntents.set(entryKey, existingIntent);

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

      // Create new payment intent
      console.log(`🆕 Creating new intent for ${entryKey}`);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: 'usd',
        metadata: {
          clerkUserId: clerkUserId,
          firebaseEntryKey: entryKey,
          userEmail: clerkUser.emailAddresses?.[0]?.emailAddress || '',
          createdAt: Date.now().toString(),
          source: 'create_intent_api'
        },
        description: `Payment for user ${clerkUserId.substring(0, 8)}...`,
        automatic_payment_methods: {
          enabled: true,
        }
      });

      console.log(`✅ Created intent: ${paymentIntent.id}`);

      // Cache the intent
      pendingIntents.set(entryKey, paymentIntent);

      // Save to Firebase
      await db.ref(`Mainformdata/${entryKey}/stripePayment`).update({
        sessionId: `payment_${Date.now()}`,
        stripePaymentIntentId: paymentIntent.id,
        amount: amount,
        paymentStatus: 'pending',
        createdAt: Date.now(),
        lastUpdated: Date.now(),
        metadata: {
          clerkUserId,
          intentCreatedAt: new Date().toISOString()
        }
      });

      res.json({
        success: true,
        clientSecret: paymentIntent.client_secret,
        entryKey,
        intentId: paymentIntent.id
      });

    } catch (error) {
      console.error('❌ Create intent error:', error);
      res.status(500).json({
        error: 'Payment setup failed',
        details: error.message,
        code: error.code
      });
    }
    return;
  }

  // ========== STATUS CHECK ==========
  if (req.method === 'GET') {
    try {
      const { clerkUserId } = req.query;

      if (!clerkUserId) {
        return res.status(400).json({
          paymentStatus: 'invalid_request',
          error: 'Missing clerkUserId parameter'
        });
      }

      console.log(`🔍 Status check for: ${clerkUserId}`);

      // Try to verify user, but don't fail if not found
      let userValid = false;
      try {
        await clerkClient.users.getUser(clerkUserId);
        userValid = true;
      } catch (clerkError) {
        console.warn(`⚠️ Clerk user verification failed: ${clerkUserId}`, clerkError.message);
        // Continue anyway - user might be deleted but payment exists
      }

      // Get payment data from Firebase
      const snapshot = await db.ref('Mainformdata')
        .orderByChild('uid')
        .equalTo(clerkUserId)
        .once('value');

      if (!snapshot.exists()) {
        return res.json({
          paymentStatus: 'no_data',
          userValid,
          timestamp: Date.now()
        });
      }

      const snapshotVal = snapshot.val();
      const entryKey = Object.keys(snapshotVal)[0];
      const data = snapshotVal[entryKey];
      const paymentData = data.stripePayment || {};

      // If payment succeeded more than 5 minutes ago, consider it stale
      const isStaleSuccess = paymentData.paymentStatus === 'success' &&
        paymentData.processedAt &&
        (Date.now() - paymentData.processedAt) > 5 * 60 * 1000;

      res.json({
        paymentStatus: paymentData.paymentStatus || 'no_data',
        paymentData: {
          ...paymentData,
          isStale: isStaleSuccess
        },
        entryKey,
        userValid,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('❌ Status check error:', error);
      res.status(500).json({
        paymentStatus: 'error',
        error: error.message,
        timestamp: Date.now()
      });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}