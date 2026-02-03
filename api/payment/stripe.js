import Stripe from 'stripe';
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { createClerkClient } from '@clerk/backend';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: process.env.FIREBASE_URL
});
const db = getDatabase(app);
const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export default async function handler(req, res) {
  // 🔥 CORS HEADERS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 🔥 1. WEBHOOK FIRST - ONLY if stripe-signature header exists
  const signature = req.headers['stripe-signature'];
  if (signature) {
    try {
      const event = stripe.webhooks.constructEvent(
        typeof req.body === 'string' ? req.body : JSON.stringify(req.body),
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        const { firebaseEntryKey } = paymentIntent.metadata;
        if (firebaseEntryKey) {
          await db.ref(`Mainformdata/${firebaseEntryKey}`).update({
            'stripePayment.paymentStatus': 'success',
            'stripePayment.stripeChargeId': paymentIntent.charges.data[0]?.id,
            'stripePayment.processedAt': Date.now()
          });
          console.log(`✅ Payment success → Firebase: ${firebaseEntryKey}`);
        }
      }

      if (event.type === 'payment_intent.payment_failed') {
        const paymentIntent = event.data.object;
        const { firebaseEntryKey } = paymentIntent.metadata;
        if (firebaseEntryKey) {
          await db.ref(`Mainformdata/${firebaseEntryKey}`).update({
            'stripePayment.paymentStatus': 'failed',
            'stripePayment.error': paymentIntent.last_payment_error?.message,
            'stripePayment.processedAt': Date.now()
          });
        }
      }

      res.json({ received: true });
      return; // 🔥 EXIT HERE
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(400).send('Webhook error');
      return; // 🔥 EXIT HERE
    }
  }

  // 🔥 2. CREATE PAYMENT INTENT (POST from frontend)
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { clerkUserId, amount = 49.99 } = body;

      // Validate Clerk user
      await clerkClient.users.getUser(clerkUserId);

      // Find existing Mainformdata entry
      const snapshot = await db.ref('Mainformdata').orderByChild('uid').equalTo(clerkUserId).once('value');
      if (!snapshot.exists()) {
        return res.status(404).json({ error: 'User data not found' });
      }

      let entryKey = null;
      snapshot.forEach(child => { entryKey = child.key; });

      // Create Stripe PaymentIntent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100, // cents
        currency: 'usd',
        metadata: {
          clerkUserId,
          firebaseEntryKey: entryKey
        }
      });

      // Store PENDING status
      await db.ref(`Mainformdata/${entryKey}`).update({
        stripePayment: {
          sessionId: `payment_${Date.now()}`,
          stripePaymentIntentId: paymentIntent.id,
          amount,
          paymentStatus: 'pending',
          createdAt: Date.now()
        }
      });

      res.json({
        success: true,
        clientSecret: paymentIntent.client_secret,
        entryKey
      });
    } catch (error) {
      console.error('Stripe create error:', error);
      res.status(500).json({ error: 'Payment setup failed' });
    }
    return;
  }

  // 🔥 3. CHECK PAYMENT STATUS (GET from frontend)
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

      let paymentStatus = 'no_data';
      snapshot.forEach(child => {
        const data = child.val();
        if (data.stripePayment?.paymentStatus === 'success') {
          paymentStatus = 'success';
        } else if (data.stripePayment?.paymentStatus === 'failed') {
          paymentStatus = 'failed';
        }
      });

      res.json({ paymentStatus });
    } catch (error) {
      console.error('Status check error:', error);
      res.status(500).json({ paymentStatus: 'error' });
    }
    return;
  }

  // 🔥 4. INVALID METHOD
  res.status(405).json({ error: 'Method not allowed' });
}
