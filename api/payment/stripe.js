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
    bodyParser: false // Required for webhook
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

  // 🔥 WEBHOOK (raw body - NO BUFFER until signature confirmed)
  if (signature) {
    try {
      const body = await buffer(req); // ✅ Buffer ONLY for webhook
      const event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);

      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        const { firebaseEntryKey } = paymentIntent.metadata;
        if (firebaseEntryKey) {
          console.log(`✅ Webhook success: ${firebaseEntryKey}`);
          await db.ref(`Mainformdata/${firebaseEntryKey}`).update({
            'stripePayment.paymentStatus': 'success',
            'stripePayment.stripeChargeId': paymentIntent.charges.data[0]?.id,
            'stripePayment.processedAt': Date.now()
          });
        }
      }

      if (event.type === 'payment_intent.payment_failed') {
        const paymentIntent = event.data.object;
        const { firebaseEntryKey } = paymentIntent.metadata;
        if (firebaseEntryKey) {
          console.log(`❌ Webhook failed: ${firebaseEntryKey}`);
          await db.ref(`Mainformdata/${firebaseEntryKey}`).update({
            'stripePayment.paymentStatus': 'failed',
            'stripePayment.error': paymentIntent.last_payment_error?.message,
            'stripePayment.processedAt': Date.now()
          });
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(400).send('Webhook error');
    }
    return;
  }

  // 🔥 CREATE INTENT (buffer only for POST)
  if (req.method === 'POST') {
    try {
      const body = await buffer(req); // ✅ Buffer ONLY for POST
      const bodyString = body.toString();
      const { clerkUserId, amount = 49.99 } = JSON.parse(bodyString);

      await clerkClient.users.getUser(clerkUserId);
      const snapshot = await db.ref('Mainformdata').orderByChild('uid').equalTo(clerkUserId).once('value');

      if (!snapshot.exists()) {
        return res.status(404).json({ error: 'User data not found' });
      }

      // ✅ FIX: Get FIRST entry only (no random forEach)
      const snapshotVal = snapshot.val();
      const entryKey = Object.keys(snapshotVal)[0];

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: 'usd',
        metadata: { clerkUserId, firebaseEntryKey: entryKey }
      });

      await db.ref(`Mainformdata/${entryKey}`).update({
        stripePayment: {
          sessionId: `payment_${Date.now()}`,
          stripePaymentIntentId: paymentIntent.id,
          amount,
          paymentStatus: 'pending',
          createdAt: Date.now()
        }
      });

      console.log(`Created intent ${paymentIntent.id} for ${entryKey}`);
      res.json({
        success: true,
        clientSecret: paymentIntent.client_secret,
        entryKey
      });
    } catch (error) {
      console.error('Create intent error:', error);
      res.status(500).json({ error: 'Payment setup failed' });
    }
    return;
  }

  // 🔥 STATUS CHECK (no body needed)
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

      // ✅ FIX: Check FIRST entry only
      const snapshotVal = snapshot.val();
      const entryKey = Object.keys(snapshotVal)[0];
      const data = snapshotVal[entryKey];
      const paymentStatus = data.stripePayment?.paymentStatus || 'no_data';

      res.json({ paymentStatus });
    } catch (error) {
      console.error('Status check error:', error);
      res.status(500).json({ paymentStatus: 'error' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
