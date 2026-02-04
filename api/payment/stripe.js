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

  // 🔥 WEBHOOK - Unchanged
  const signature = req.headers['stripe-signature'];
  if (signature) {
    try {
      const body = await buffer(req);
      const event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);

      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        const { firebaseEntryKey } = paymentIntent.metadata;
        if (firebaseEntryKey) {
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

  // 🔥 CREATE PAYMENT INTENT - FIXED FOR DYNAMIC PRICING
  if (req.method === 'POST') {
    try {
      const body = await buffer(req);
      const bodyString = body.toString();
      const { clerkUserId, amount = 49.99, plan = 'basic' } = JSON.parse(bodyString); // 🔥 NEW: plan parameter

      await clerkClient.users.getUser(clerkUserId);
      const snapshot = await db.ref('Mainformdata').orderByChild('uid').equalTo(clerkUserId).once('value');

      if (!snapshot.exists()) {
        return res.status(404).json({ error: 'User data not found' });
      }

      let entryKey = null;
      snapshot.forEach(child => { entryKey = child.key; });

      // 🔥 FIXED: Always use same Firebase record, update amount/plan
      const currentPayment = await db.ref(`Mainformdata/${entryKey}/stripePayment`).once('value');

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // ✅ Dynamic amount (4999 or 5999 cents)
        currency: 'usd',
        metadata: {
          clerkUserId,
          firebaseEntryKey: entryKey,
          plan // 🔥 Store plan in metadata
        }
      });

      // 🔥 FIXED: Update EXISTING record (don't create new one)
      await db.ref(`Mainformdata/${entryKey}`).update({
        stripePayment: {
          sessionId: `payment_${Date.now()}`,
          stripePaymentIntentId: paymentIntent.id, // ✅ Updates to new PI
          amount, // ✅ Dynamic amount
          plan,   // 🔥 NEW: Track plan
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

  // 🔥 STATUS CHECK (GET only) - Unchanged
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

  res.status(405).json({ error: 'Method not allowed' });
}





// import Stripe from 'stripe';
// import { initializeApp, cert } from 'firebase-admin/app';
// import { getDatabase } from 'firebase-admin/database';
// import { createClerkClient } from '@clerk/backend';
// import { buffer } from 'micro';

// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
// const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
// const app = initializeApp({
//   credential: cert(serviceAccount),
//   databaseURL: process.env.FIREBASE_URL
// });
// const db = getDatabase(app);
// const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

// export const config = {
//   api: {
//     bodyParser: false
//   }
// };

// export default async function handler(req, res) {
//   res.setHeader('Access-Control-Allow-Origin', '*');
//   res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
//   res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

//   if (req.method === 'OPTIONS') {
//     res.status(200).end();
//     return;
//   }

//   // 🔥 WEBHOOK - Always needs raw body
//   const signature = req.headers['stripe-signature'];
//   if (signature) {
//     try {
//       const body = await buffer(req);
//       const event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);

//       if (event.type === 'payment_intent.succeeded') {
//         const paymentIntent = event.data.object;
//         const { firebaseEntryKey } = paymentIntent.metadata;
//         if (firebaseEntryKey) {
//           await db.ref(`Mainformdata/${firebaseEntryKey}`).update({
//             'stripePayment.paymentStatus': 'success',
//             'stripePayment.stripeChargeId': paymentIntent.charges.data[0]?.id,
//             'stripePayment.processedAt': Date.now()
//           });
//         }
//       }

//       if (event.type === 'payment_intent.payment_failed') {
//         const paymentIntent = event.data.object;
//         const { firebaseEntryKey } = paymentIntent.metadata;
//         if (firebaseEntryKey) {
//           await db.ref(`Mainformdata/${firebaseEntryKey}`).update({
//             'stripePayment.paymentStatus': 'failed',
//             'stripePayment.error': paymentIntent.last_payment_error?.message,
//             'stripePayment.processedAt': Date.now()
//           });
//         }
//       }

//       res.json({ received: true });
//     } catch (error) {
//       console.error('Webhook error:', error);
//       res.status(400).send('Webhook error');
//     }
//     return;
//   }

//   // 🔥 CREATE PAYMENT INTENT (POST only)
//   if (req.method === 'POST') {
//     try {
//       const body = await buffer(req);
//       const bodyString = body.toString();
//       const { clerkUserId, amount = 49.99 } = JSON.parse(bodyString);

//       await clerkClient.users.getUser(clerkUserId);
//       const snapshot = await db.ref('Mainformdata').orderByChild('uid').equalTo(clerkUserId).once('value');

//       if (!snapshot.exists()) {
//         return res.status(404).json({ error: 'User data not found' });
//       }

//       let entryKey = null;
//       snapshot.forEach(child => { entryKey = child.key; });

//       const paymentIntent = await stripe.paymentIntents.create({
//         amount: Math.round(amount * 100),
//         currency: 'usd',
//         metadata: { clerkUserId, firebaseEntryKey: entryKey }
//       });

//       await db.ref(`Mainformdata/${entryKey}`).update({
//         stripePayment: {
//           sessionId: `payment_${Date.now()}`,
//           stripePaymentIntentId: paymentIntent.id,
//           amount,
//           paymentStatus: 'pending',
//           createdAt: Date.now()
//         }
//       });

//       res.json({
//         success: true,
//         clientSecret: paymentIntent.client_secret,
//         entryKey
//       });
//     } catch (error) {
//       console.error('Stripe create error:', error);
//       res.status(500).json({ error: 'Payment setup failed' });
//     }
//     return;
//   }

//   // 🔥 STATUS CHECK (GET only - NO BUFFERING!)
//   if (req.method === 'GET') {
//     try {
//       const { clerkUserId } = req.query;
//       if (!clerkUserId) {
//         return res.status(400).json({ paymentStatus: 'unknown' });
//       }

//       await clerkClient.users.getUser(clerkUserId);
//       const snapshot = await db.ref('Mainformdata').orderByChild('uid').equalTo(clerkUserId).once('value');

//       if (!snapshot.exists()) {
//         return res.json({ paymentStatus: 'no_data' });
//       }

//       let paymentStatus = 'no_data';
//       snapshot.forEach(child => {
//         const data = child.val();
//         if (data.stripePayment?.paymentStatus === 'success') {
//           paymentStatus = 'success';
//         } else if (data.stripePayment?.paymentStatus === 'failed') {
//           paymentStatus = 'failed';
//         }
//       });

//       res.json({ paymentStatus });
//     } catch (error) {
//       console.error('Status check error:', error);
//       res.status(500).json({ paymentStatus: 'error' });
//     }
//     return;
//   }

//   res.status(405).json({ error: 'Method not allowed' });
// }
