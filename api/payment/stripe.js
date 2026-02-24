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
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Health check
  if (req.method === 'GET' && req.query.health) {
    return res.json({
      status: 'ok',
      timestamp: Date.now(),
      supports: ['deposit', 'backer']
    });
  }

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const signature = req.headers['stripe-signature'];

  // 🔥 WEBHOOK - HANDLES BOTH $99 + DYNAMIC BACKER
  if (signature) {
    try {
      const body = await buffer(req);
      const event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
      console.log(`🔔 Webhook: ${event.type}`);

      if (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed') {
        const paymentIntent = event.data.object;
        const { firebaseEntryKey, paymentType } = paymentIntent.metadata;

        if (firebaseEntryKey && paymentType) {
          const paymentPath = paymentType === 'backer' ? 'backerPayment' : 'stripePayment';

          const updateData = {
            paymentStatus: event.type === 'payment_intent.succeeded' ? 'success' : 'failed',
            stripeChargeId: paymentIntent.latest_charge,
            processedAt: Date.now(),
            stripePaymentIntentId: paymentIntent.id,
            lastWebhookEvent: event.type,
            paymentType
          };

          if (event.type === 'payment_intent.payment_failed') {
            updateData.error = paymentIntent.last_payment_error?.message || 'Payment failed';
          }

          await db.ref(`Mainformdata/${firebaseEntryKey}/${paymentPath}`).update(updateData);
          console.log(`✅ Webhook ${paymentType} ${paymentPath}: ${firebaseEntryKey}`);
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error('❌ Webhook error:', error);
      res.status(400).json({ error: 'Webhook error' });
    }
    return;
  }

  // 🔥 STATIC PRICING (deposit + addon)
  if (req.method === 'GET' && req.query.pricing) {
    return res.json({
      deposit: 99.00,
      backer: 2000.00,  // Fallback only
      addon: 29.95
    });
  }

  // 🔥 NEW: DYNAMIC BACKER PRICING FROM paymentFormData/priceperfoot
  if (req.method === 'GET' && req.query.backerPricing) {
    try {
      const { clerkUserId } = req.query;
      if (!clerkUserId) return res.status(400).json({ error: 'Missing clerkUserId' });

      const snapshot = await db.ref('Mainformdata').orderByChild('uid').equalTo(clerkUserId).once('value');
      if (!snapshot.exists()) return res.status(404).json({ error: 'No user data found for uid' });

      const snapshotVal = snapshot.val();
      const entryKey = Object.keys(snapshotVal)[0];
      const paymentFormData = snapshotVal[entryKey]?.paymentFormData;

      const backerPrice = parseFloat(paymentFormData?.priceperfoot) || 0;
      if (backerPrice === 0) return res.status(404).json({ error: 'No priceperfoot in paymentFormData' });

      console.log(`💰 User ${clerkUserId} (${entryKey}): $${backerPrice.toFixed(2)} from priceperfoot`);

      res.json({
        backerPrice,  // Direct final price: 1574.1 → $1,574.10
        entryKey,
        pricePerFootRaw: paymentFormData.priceperfoot,
        currency: 'usd'
      });
    } catch (error) {
      console.error('❌ Backer pricing error:', error);
      res.status(500).json({ error: 'Pricing fetch failed' });
    }
    return;
  }

  // 🔥 CREATE PAYMENT INTENT (BOTH TYPES - NOW DYNAMIC FOR BACKER)
  if (req.method === 'POST') {
    try {
      const body = await buffer(req);
      const { clerkUserId, paymentType = 'deposit', addons = [], dynamicAmount } = JSON.parse(body.toString());

      console.log(`🔍 ${paymentType} for user ${clerkUserId}, dynamicAmount: ${dynamicAmount}`);

      // 🔥 DYNAMIC PRICING LOGIC
      let totalAmount;
      if (paymentType === 'backer' && dynamicAmount) {
        // Use fetched priceperfoot directly
        totalAmount = parseFloat(dynamicAmount);
        console.log(`💰 Dynamic backer: $${totalAmount.toFixed(2)}`);
      } else {
        // Static deposit pricing
        const PRICES = { deposit: 99.00 };
        const BASE_PRICE = PRICES[paymentType] || 99.00;
        const ADDON_PRICE = 29.95;
        const hasAddon = addons.length > 0 && paymentType === 'deposit';
        totalAmount = BASE_PRICE + (hasAddon ? ADDON_PRICE : 0);
        console.log(`💰 ${paymentType}: $${totalAmount.toFixed(2)}`);
      }

      if (totalAmount < 0.50) {
        return res.status(400).json({ error: 'Amount too small (min $0.50)' });
      }

      // Clerk verify
      await safeClerkVerify(clerkUserId).catch(() => {
        console.log('⚠️ Skipping Clerk check');
      });

      // Find Mainformdata entry
      const snapshot = await db.ref('Mainformdata').orderByChild('uid').equalTo(clerkUserId).once('value');
      if (!snapshot.exists()) {
        return res.status(404).json({ error: 'No user data found' });
      }

      const snapshotVal = snapshot.val();
      const entryKey = Object.keys(snapshotVal)[0];

      const paymentPath = paymentType === 'backer' ? 'backerPayment' : 'stripePayment';
      const existingPayment = snapshotVal[entryKey]?.[paymentPath];

      let paymentIntent;
      let intentAction = 'created';

      // Reuse existing intent
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
                  dynamicAmount: totalAmount.toString(),
                  updatedAt: new Date().toISOString()
                }
              });
            }
          } else {
            paymentIntent = null;
          }
        } catch (error) {
          console.log('⚠️ Existing intent error:', error.message);
          paymentIntent = null;
        }
      }

      // Create new intent
      if (!paymentIntent) {
        paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(totalAmount * 100),
          currency: 'usd',
          metadata: {
            clerkUserId,
            firebaseEntryKey: entryKey,
            paymentType,
            ...(paymentType === 'backer' && { dynamicAmount: totalAmount.toString() }),
            addons: JSON.stringify(addons),
            totalAmount: totalAmount.toString(),
            createdAt: new Date().toISOString()
          }
        });
        console.log(`🚀 Created ${paymentType} intent: $${totalAmount.toFixed(2)}`);
      }

      // Update Firebase
      await db.ref(`Mainformdata/${entryKey}/${paymentPath}`).update({
        sessionId: `${paymentType}_${Date.now()}`,
        stripePaymentIntentId: paymentIntent.id,
        amount: totalAmount,
        ...(paymentType === 'backer' && { priceperfoot: totalAmount }),
        paymentStatus: 'pending',
        paymentType,
        lastUpdated: Date.now(),
        intentAction
      });

      res.json({
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
      res.status(500).json({ error: 'Payment setup failed', details: error.message });
    }
    return;
  }

  // 🔥 STATUS CHECK (BOTH TYPES)
  if (req.method === 'GET') {
    try {
      const { clerkUserId, paymentType = 'deposit' } = req.query;

      if (!clerkUserId) {
        return res.status(400).json({ paymentStatus: 'unknown' });
      }

      const snapshot = await db.ref('Mainformdata').orderByChild('uid').equalTo(clerkUserId).once('value');
      if (!snapshot.exists()) {
        return res.json({ paymentStatus: 'no_data' });
      }

      const snapshotVal = snapshot.val();
      const entryKey = Object.keys(snapshotVal)[0];
      const paymentPath = paymentType === 'backer' ? 'backerPayment' : 'stripePayment';
      const paymentData = snapshotVal[entryKey]?.[paymentPath];
      const paymentStatus = paymentData?.paymentStatus || 'no_data';

      res.json({
        paymentStatus,
        paymentData,
        entryKey,
        paymentType,
        paymentPath
      });
    } catch (error) {
      console.error('❌ GET error:', error.message);
      res.status(200).json({ paymentStatus: 'error' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
