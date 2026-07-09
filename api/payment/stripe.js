import Stripe from 'stripe';
import crypto from 'crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { createClerkClient } from '@clerk/backend';
import { buffer } from 'micro';
import { BrevoClient } from "@getbrevo/brevo";


// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
//   apiVersion: '2024-06-20'
// });

const isLive = process.env.STRIPE_MODE === 'live';
const STRIPE_TEST_PUBLISHABLE_KEY_FALLBACK = 'pk_test_51QO13Y01LGnCTELaFaus9Grax4NeSyEroahRIfs2fQhd3gqbO676LKIl8y4qCjYWYBiSTgGTYy7wSy96zNlmrR1V00ys63HzBF';

function getStripeSecretKey(mode) {
  return mode === 'live'
    ? process.env.STRIPE_SECRET_KEY_LIVE
    : process.env.STRIPE_SECRET_KEY_TEST;
}

function getStripePublishableKey(mode) {
  return mode === 'live'
    ? process.env.STRIPE_PUBLISHABLE_KEY_LIVE || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE
    : process.env.STRIPE_PUBLISHABLE_KEY_TEST || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST || STRIPE_TEST_PUBLISHABLE_KEY_FALLBACK;
}

function getStripeClient(mode) {
  const secretKey = getStripeSecretKey(mode);

  if (!secretKey) {
    throw new Error(`Missing Stripe secret key for ${mode} mode`);
  }

  return new Stripe(secretKey, {
    apiVersion: '2024-06-20'
  });
}

const stripe = new Stripe(
  getStripeSecretKey(isLive ? 'live' : 'test'),
  {
    apiVersion: '2024-06-20'
  }
);

const STRIPE_WEBHOOK_SECRET = isLive
  ? process.env.STRIPE_WEBHOOK_SECRET_LIVE
  : process.env.STRIPE_WEBHOOK_SECRET_TEST;

const STRIPE_PUBLISHABLE_KEY = getStripePublishableKey(isLive ? 'live' : 'test');
const X_PIXEL_ID = 'rcajc';
const X_EVENT_STEP5_ID = process.env.X_EVENT_STEP5_ID;

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: process.env.FIREBASE_URL
});
const db = getDatabase(app);
const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

// 🔥 MASTER PLAN PRICES
const PLAN_PRICES = {
  loft: 1925,
  studio: 1925,
  "1BR": 2530,
  "2BR": 3135,
};
const PRICING = {
  deposit: 99.00,
  addon: 49.00
};

const REFUND_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
export const config = {
  api: { bodyParser: false }
};

function getPaymentFormAmount(paymentFormData) {
  const legacyPrice = parseFloat(paymentFormData?.priceperfoot);
  if (Number.isFinite(legacyPrice) && legacyPrice > 0) return legacyPrice;

  const v3MonthlyPrice = parseFloat(paymentFormData?.monthlyPerPerson);
  if (Number.isFinite(v3MonthlyPrice) && v3MonthlyPrice > 0) return v3MonthlyPrice;

  return 0;
}

async function fireXPaymentEvent({
  eventName,
  conversionId,
  email,
  phone = '',
  eventSourceUrl = '',
  twclid = '',
  req
}) {
  const eventId = eventName === 'step5_payment_info' ? X_EVENT_STEP5_ID : null;

  if (!process.env.X_PIXEL_TOKEN) {
    console.log('⚠️ X event skipped: X_PIXEL_TOKEN is missing');
    return;
  }

  if (!eventId) {
    console.log(`⚠️ X event skipped: missing event id for ${eventName}`);
    return;
  }

  const identifiers = {};
  const cleanTwclid = typeof twclid === 'string' ? twclid.trim() : '';
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const cleanPhone = typeof phone === 'string' ? phone.trim() : '';
  const forwarded = req?.headers?.['x-forwarded-for'];
  const ipAddress = typeof forwarded === 'string' && forwarded.trim()
    ? forwarded.split(',')[0].trim()
    : req?.socket?.remoteAddress || '';
  const userAgent = typeof req?.headers?.['user-agent'] === 'string'
    ? req.headers['user-agent'].trim()
    : '';

  if (cleanTwclid) identifiers.twclid = cleanTwclid;
  if (cleanEmail) identifiers.hashed_email = crypto.createHash('sha256').update(cleanEmail).digest('hex');
  if (cleanPhone) identifiers.hashed_phone_number = crypto.createHash('sha256').update(cleanPhone).digest('hex');
  if (ipAddress && userAgent) {
    identifiers.ip_address = ipAddress;
    identifiers.user_agent = userAgent;
  }

  if (!Object.keys(identifiers).length) {
    console.log(`⚠️ X event skipped: no identifiers available for ${eventName}`);
    return;
  }

  const payload = {
    conversions: [
      {
        conversion_time: new Date().toISOString(),
        event_id: eventId,
        event_source_url: eventSourceUrl || '',
        conversion_id: conversionId,
        identifiers: [identifiers],
      },
    ],
  };

  const response = await fetch(`https://ads-api.x.com/12/measurement/conversions/${X_PIXEL_ID}`, {
    method: 'POST',
    headers: {
      'X-Pixel-Token': process.env.X_PIXEL_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`X CAPI failed (${response.status}): ${responseText}`);
  }

  console.log(`✅ X event sent: ${eventName}`);
}

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

  if (req.method === 'GET' && req.query.config) {
    const requestedMode = req.query.mode === 'test'
      ? 'test'
      : req.query.mode === 'live'
        ? 'live'
        : (isLive ? 'live' : 'test');
    const publishableKey = getStripePublishableKey(requestedMode);

    if (!publishableKey) {
      return res.status(500).json({
        error: `Missing Stripe publishable key for ${requestedMode} mode`
      });
    }

    return res.json({
      publishableKey,
      mode: requestedMode
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
      // const event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
      const event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
      console.log(`🔔 Webhook: ${event.type}`);

      if (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed') {
        const paymentIntent = event.data.object;
        const { firebaseEntryKey, paymentType } = paymentIntent.metadata;

        if (!firebaseEntryKey || !paymentType) {
          console.log('⚠️ Missing metadata, skipping');
          return res.json({ received: true });
        }

        if (paymentType !== 'builder_installment') {

          const paymentPath =
            paymentType === 'backer'
              ? 'backerPayment'
              : 'stripePayment';

          const isUpgrade = paymentIntent.metadata?.upgrade === "true";

          const baseAmount = parseFloat(paymentIntent.metadata?.baseAmount || 0);
          const addonAmount = parseFloat(paymentIntent.metadata?.addonAmount || 0);
          const totalAmount = paymentIntent.amount / 100;
          const amountPaid = paymentIntent.amount / 100;
          const fullAmount = parseFloat(paymentIntent.metadata?.fullAmount || amountPaid);
          const updateData = {
            paymentStatus: event.type === 'payment_intent.succeeded' ? 'success' : 'failed',
            stripeChargeId: paymentIntent.latest_charge,
            ...(!isUpgrade && { stripePaymentIntentId: paymentIntent.id }),
            // ✅ NEW STRUCTURE
            ...(paymentType === 'deposit' && {
              depositAmount: baseAmount,
              addonAmount: addonAmount,
              totalAmount: totalAmount
            }),

            amount: paymentIntent.amount / 100,
            amountPaid: amountPaid,      // NEW (clear naming)
            fullAmount: fullAmount,
            customerId: paymentIntent.customer,           // ⭐ ADD
            paymentMethodId: paymentIntent.payment_method, // ⭐ ADD
            processedAt: Date.now(),
            lastWebhookEvent: event.type,
            paymentType,
            deviceInfo: {
              browser: paymentIntent.metadata?.browser || '',
              device: paymentIntent.metadata?.device || '',
              os: paymentIntent.metadata?.os || ''
            }
          };

          if (event.type === 'payment_intent.payment_failed') {
            updateData.error = paymentIntent.last_payment_error?.message || 'Payment failed';
          }

          await db.ref(`Mainformdata/${firebaseEntryKey}/${paymentPath}`).update(updateData);
          console.log(`✅ Webhook ${paymentType}: ${firebaseEntryKey}`);
          if (paymentType === 'deposit') {
            console.log('🚀 DEPOSIT WEBHOOK X EVENT SECTION');
          }

          if (paymentType === 'deposit' && event.type === 'payment_intent.succeeded') {
            console.log('🚀 DEPOSIT BLOCK 1/4');
            await db.ref(`Mainformdata/${firebaseEntryKey}/resume`).update({
              earlyApplicationPaid: true,
              currentStep: 3,
              lastCompletedStep: 2
            });
            const recoveryToken = paymentIntent.metadata?.recoveryToken;
            const paidFromRecoveryLink = paymentIntent.metadata?.paidFromRecoveryLink === 'true';

            if (recoveryToken) {
              await db.ref(`recoveryPaymentLinks/${recoveryToken}`).update({
                status: 'paid',
                used: true,
                paidAt: Date.now(),
                stripePaymentIntentId: paymentIntent.id
              });
            }

            if (paidFromRecoveryLink) {
              await db.ref(`Mainformdata/${firebaseEntryKey}/stripePayment`).update({
                paymentSource: 'admin_recovery_link',
                paidFromRecoveryLink: true,
                recoveryToken: recoveryToken || null
              });
            }
            console.log('🚀 DEPOSIT BLOCK 2/4 - RESUME DONE');
            console.log(`✅ Resume updated for deposit success: ${firebaseEntryKey}`);
            console.log('🚀 DEPOSIT BLOCK 3/4 - BREVO NEXT');
            console.log('🚀 DEPOSIT BLOCK 3.5/4 - X EVENT NEXT');
            try {
              const userSnap = await db.ref(`Mainformdata/${firebaseEntryKey}`).once('value');
              const userData = userSnap.val();

              const emailLower =
                userData?.email?.toLowerCase() ||
                userData?.PaymentFormData?.useremail?.toLowerCase();

              await fireXPaymentEvent({
                eventName: 'step5_payment_info',
                conversionId: `funnel-v3-step5_payment_info-${paymentIntent.id}`,
                email: emailLower || '',
                eventSourceUrl: paymentIntent.metadata?.eventSourceUrl || '',
                twclid: paymentIntent.metadata?.twclid || '',
                req,
              });
            } catch (xError) {
              console.error('❌ X payment event error:', xError.message || xError);
            }
            // BREVO CODE START

            try {
              const client = new BrevoClient({
                apiKey: process.env.BREVO_API_KEY,
              });

              const userSnap = await db.ref(`Mainformdata/${firebaseEntryKey}`).once('value');
              const userData = userSnap.val();

              const emailLower =
                userData?.email?.toLowerCase() ||
                userData?.PaymentFormData?.useremail?.toLowerCase();
              console.log("Resolved email for step 3:", emailLower);
              if (emailLower) {
                await fetch("https://api.brevo.com/v3/contacts", {
                  method: "POST",
                  headers: {
                    "api-key": process.env.BREVO_API_KEY,
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({
                    email: emailLower,
                    attributes: {
                      EARLY_APPLICATION: true,
                      EARLY_APPLICATION_PAID_AT: new Date().toISOString(),
                      EARLY_APPLICATION_AMOUNT: baseAmount
                    },
                    updateEnabled: true
                  })
                });

                await client.event.createEvent({
                  event_name: "early_application_paid",
                  identifiers: {
                    email_id: emailLower
                  }
                });

                console.log("✅ Step 3 Brevo event sent");
              } else {
                console.log("⚠️ Brevo skipped: no email found");
              }
            } catch (brevoError) {
              console.error("❌ Brevo error:", brevoError.message || brevoError);
            }
            console.log('🚀 DEPOSIT BLOCK 4/4 - ALL DONE');
            // BREVO CODE END

          }

          // 🔥 CORRECT - FIRST TIME ONLY
          // if (paymentType === 'backer' && event.type === 'payment_intent.succeeded') {
          //   const backerRef = db.ref(`Mainformdata/${firebaseEntryKey}/backerPayment`);
          //   const snap = await backerRef.once('value');
          //   if (!snap.val()?.refundWindowStart) {  // ← CHECK EXISTS
          //     await backerRef.update({
          //       refundWindowStart: Date.now(),
          //       refundStatus: 'eligible'
          //     });
          //   }
          //   await db.ref(`Mainformdata/${firebaseEntryKey}/resume`).update({
          //     foundingBackerPaid: true,
          //     currentStep: 4,
          //     lastCompletedStep: 4
          //   });
          //   console.log(`✅ Backer payment success + resume updated: ${firebaseEntryKey}`);
          // }


          if (paymentType === 'backer' && event.type === 'payment_intent.succeeded') {
            const backerRef = db.ref(`Mainformdata/${firebaseEntryKey}/backerPayment`);
            const snap = await backerRef.once('value');

            if (!snap.val()?.refundWindowStart) {

              // 🔹 1. Update DB
              await backerRef.update({
                refundWindowStart: Date.now(),
                refundStatus: 'eligible'
              });

              await db.ref(`Mainformdata/${firebaseEntryKey}/resume`).update({
                foundingBackerPaid: true,
                currentStep: 4,
                lastCompletedStep: 3
              });

              console.log(`✅ Backer payment success: ${firebaseEntryKey}`);

              // 🔹 2. BREVO TRIGGER (Workflow 5)
              try {
                const client = new BrevoClient({
                  apiKey: process.env.BREVO_API_KEY,
                });

                const userSnap = await db.ref(`Mainformdata/${firebaseEntryKey}`).once('value');
                const userData = userSnap.val();

                const email =
                  userData?.email?.toLowerCase() ||
                  userData?.PaymentFormData?.useremail?.toLowerCase();


                if (email) {
                  const pledge = getPaymentFormAmount(userData?.PaymentFormData);
                  const depositAmount = parseFloat(userData?.stripePayment?.totalAmount || 0);

                  const amountDueNow = depositAmount > 0
                    ? Math.max(0, pledge - depositAmount)
                    : pledge;
                  const refundDeadline = new Date(Date.now() + (90 * 24 * 60 * 60 * 1000));
                  const formattedDeadline = refundDeadline.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric"
                  });
                  // ✅ Update attributes
                  await fetch("https://api.brevo.com/v3/contacts", {
                    method: "POST",
                    headers: {
                      "api-key": process.env.BREVO_API_KEY,
                      "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                      email,
                      attributes: {
                        FOUNDING_BACKER: true,
                        FOUNDING_BACKER_PAID_AT: new Date().toISOString(),
                        FOUNDING_BACKER_PLEDGE_TOTAL: pledge,
                        FOUNDING_BACKER_AMOUNT_DUE_NOW: amountDueNow,
                        FOUNDING_BACKER_TOTAL_PAID: pledge,
                        FOUNDING_BACKER_REFUND_DEADLINE: formattedDeadline,
                        APPLICATION_STATUS: "PENDING"
                      },
                      updateEnabled: true
                    })
                  });

                  // ✅ Fire event → starts Workflow 5
                  await client.event.createEvent({
                    event_name: "founding_backer_purchased",
                    identifiers: { email_id: email }
                  });

                  console.log("✅ Workflow 5 triggered");

                } else {
                  console.log("⚠️ No email found");
                }

              } catch (err) {
                console.error("❌ Brevo error:", err.message || err);
              }
            }
          }

          /* 🔥 PLAN UPGRADE HANDLER */
          if (event.type === 'payment_intent.succeeded' && paymentIntent.metadata?.upgrade === "true") {
            const targetPlan = paymentIntent.metadata.targetPlan;
            const newPlanPrice = parseFloat(paymentIntent.metadata.newPlanPrice);

            const userRef = db.ref(`Mainformdata/${firebaseEntryKey}`);
            const snap = await userRef.once('value');
            const userData = snap.val();
            const oldPlanPrice = getPaymentFormAmount(userData?.PaymentFormData);

            // Update current plan
            await userRef.child('PaymentFormData').update({
              priceperfoot: newPlanPrice,
              selectedPlan: targetPlan
            });

            // Set full backer amount
            await userRef.child('backerPayment').update({
              fullAmount: newPlanPrice,
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
        /* 🔥 BUILDER INSTALLMENT WEBHOOK */
        if (
          event.type === 'payment_intent.succeeded' &&
          paymentIntent.metadata?.installmentIndex !== undefined
        ) {
          const { firebaseEntryKey, installmentIndex } = paymentIntent.metadata;

          console.log(
            `🔥 BUILDER WEBHOOK: ${firebaseEntryKey}[${installmentIndex}] $${paymentIntent.amount / 100}`
          );

          try {
            const scheduleRef = db.ref(
              `Mainformdata/${firebaseEntryKey}/builderPlan/schedule/${installmentIndex}`
            );

            // ✅ 1. PREVENT DUPLICATE WEBHOOK (VERY IMPORTANT)
            const existingSnap = await scheduleRef.once('value');
            const existingData = existingSnap.val();

            if (existingData?.status === 'paid') {
              console.log('⚠️ Already processed, skipping');
              return;
            }

            // ✅ 2. MARK AS PAID
            await scheduleRef.update({
              status: 'paid',
              paymentStatus: 'success',
              stripePaymentIntentId: paymentIntent.id,
              stripeChargeId: paymentIntent.latest_charge,
              amountPaid: paymentIntent.amount / 100,
              paidAt: Date.now()
            });
            try {
              const userSnap = await db.ref(`Mainformdata/${firebaseEntryKey}`).once('value');
              const userData = userSnap.val();

              const email =
                userData?.email?.toLowerCase() ||
                userData?.PaymentFormData?.useremail?.toLowerCase();

              if (email) {

                const amount = paymentIntent.amount / 100;
                const installmentNumber = parseInt(installmentIndex) + 1;

                // ✅ 1. Update contact (optional but recommended)
                await fetch("https://api.brevo.com/v3/contacts", {
                  method: "POST",
                  headers: {
                    "api-key": process.env.BREVO_API_KEY,
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({
                    email,
                    attributes: {
                      LAST_BUILDER_PAYMENT_AMOUNT: amount,
                      LAST_BUILDER_INSTALLMENT: installmentNumber,
                      LAST_BUILDER_PAYMENT_AT: new Date().toISOString()
                    },
                    updateEnabled: true
                  })
                });

                // ✅ 2. Trigger event
                const client = new BrevoClient({
                  apiKey: process.env.BREVO_API_KEY,
                });

                await client.event.createEvent({
                  event_name: "builder_installment_paid",
                  identifiers: {
                    email_id: email
                  },
                  data: {
                    amount,
                    installmentNumber
                  }
                });

                console.log("✅ Builder success workflow triggered");

              } else {
                console.log("⚠️ No email found");
              }

            } catch (err) {
              console.error("❌ Brevo error:", err.message);
            }
            console.log(`✅ SCHEDULE UPDATED: ${firebaseEntryKey}[${installmentIndex}]`);


            // ✅ 3. REMOVE FROM duePayments
            const planRef = db.ref(`Mainformdata/${firebaseEntryKey}/builderPlan`);
            const planSnap = await planRef.once('value');
            const planData = planSnap.val();

            const installmentDate = planData?.schedule?.[installmentIndex]?.date;

            if (installmentDate) {
              await db
                .ref(`duePayments/${installmentDate}/${firebaseEntryKey}`)
                .remove();

              console.log(`🧹 Removed from duePayments: ${installmentDate}`);
            }

            // ✅ 4. DECREMENT INSTALLMENTS SAFELY
            if (planData?.installmentsRemaining > 0) {
              await planRef.update({
                installmentsRemaining: planData.installmentsRemaining - 1
              });

              console.log(
                `📉 Remaining: ${planData.installmentsRemaining} → ${planData.installmentsRemaining - 1
                }`
              );
            }

          } catch (error) {
            console.error('❌ BUILDER WEBHOOK ERROR:', error.message);
          }
        }




        // 🔴 BUILDER INSTALLMENT FAILED
        if (event.type === 'payment_intent.payment_failed' && paymentIntent.metadata?.installmentIndex !== undefined) {
          const { firebaseEntryKey, installmentIndex } = paymentIntent.metadata;

          console.log(`❌ BUILDER PAYMENT FAILED: ${firebaseEntryKey}[${installmentIndex}]`);

          try {
            const scheduleRef = db.ref(`Mainformdata/${firebaseEntryKey}/builderPlan/schedule/${installmentIndex}`);

            await scheduleRef.update({
              status: 'failed',
              paymentStatus: 'failed',
              failedAt: Date.now(),
              error: paymentIntent.last_payment_error?.message || "Payment failed"
            });

            console.log(`❌ SCHEDULE MARKED FAILED: ${firebaseEntryKey}[${installmentIndex}]`);

          } catch (err) {
            console.error("❌ FAILED HANDLER ERROR:", err);
          }
        }

      }
      /* ===============================================
          REFUND EVENTS
        =============================================== */
      if (event.type === 'refund.updated' || event.type === 'charge.refunded') {
        const eventId = event.id;

        const alreadyProcessed =
          (await db.ref(`stripeWebhookEvents/${eventId}`).once('value')).exists();

        if (alreadyProcessed) {
          console.log('⚠️ Duplicate webhook ignored:', eventId);
          return res.json({ received: true });
        }

        await db.ref(`stripeWebhookEvents/${eventId}`).set({
          type: event.type,
          processedAt: Date.now()
        });
        let refund;

        if (event.type === 'refund.updated') {
          refund = event.data.object;
        }

        if (event.type === 'charge.refunded') {
          const charge = event.data.object;
          refund = charge.refunds.data[charge.refunds.data.length - 1];
        }

        if (!refund) {
          console.log('⚠️ No refund object found');
          return res.json({ received: true });
        }

        console.log("💸 Refund webhook:", refund.id, refund.status);

        try {

          const index =
            (await db.ref(`refundIndex/${refund.id}`).once('value')).val();

          if (index?.path) {
            await db.ref(index.path).update({
              status: refund.status,
              updatedAt: Date.now(),
              lastWebhookEvent: event.type
            });

            console.log("✅ Refund synced:", refund.id);
          } else {
            console.log("⚠️ Refund not found:", refund.id);
          }

        } catch (err) {
          console.error("❌ Refund webhook error:", err);
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
      deposit: PRICING.deposit,
      backer: 2000.00,
      addon: PRICING.addon,
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

      const backerPrice = getPaymentFormAmount(paymentFormData);
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
   🔥 REFUND STATUS CHECK (30s TEST - FULLY FIXED)
======================================================== */
  if (req.method === 'GET' && req.query.refundStatus) {
    try {
      const { clerkUserId } = req.query;
      if (!clerkUserId) return res.status(400).json({ refundEligible: false });

      const snapshot = await db.ref('Mainformdata').orderByChild('uid').equalTo(clerkUserId).once('value');
      if (!snapshot.exists()) return res.json({ refundEligible: true });

      const snapshotVal = snapshot.val();
      const entryKey = Object.keys(snapshotVal)[0];

      // 🔥 REFRESH DATA AFTER ANY POSSIBLE UPDATE
      const backerSnapshot = await db.ref(`Mainformdata/${entryKey}/backerPayment`).once('value');
      const backerData = backerSnapshot.val();

      // No backer payment → show plans
      if (!backerData || !backerData.paymentStatus) {
        return res.json({
          refundStatus: 'none',
          refundEligible: false,
          showPlans: true
        });
      }

      // Payment not success → show plans
      if (backerData.paymentStatus !== 'success') {
        return res.json({
          refundStatus: 'failed',
          refundEligible: false,
          showPlans: true
        });
      }

      const windowStart = backerData?.refundWindowStart;

      // 🔥 AUTO-EXPIRE LOGIC
      if (backerData.refundStatus === 'eligible' && windowStart) {

        const windowEnd = backerData.refundWindowStart + REFUND_WINDOW_MS;
        const now = Date.now();

        if (now >= windowEnd) {
          // 🔥 UPDATE DB TO EXPIRED
          await db.ref(`Mainformdata/${entryKey}/backerPayment`).update({
            refundStatus: 'expired',
            refundWindowEnd: windowEnd,
            expiredAt: now
          });
          console.log(`✅ Auto-expired ${entryKey}`);

          // 🔥 REFRESH DATA AGAIN (get updated status)
          const updatedSnapshot = await db.ref(`Mainformdata/${entryKey}/backerPayment`).once('value');
          const updatedData = updatedSnapshot.val();

          return res.json({
            refundStatus: updatedData.refundStatus,  // "expired"
            refundEligible: updatedData.refundStatus === 'eligible',
            entryKey,
            testInfo: `Updated at ${new Date(now).toISOString()}`
          });
        }
      }

      // // Normal case
      // return res.json({
      //   refundStatus: backerData.refundStatus,
      //   refundEligible: backerData.refundStatus === 'eligible',
      //   entryKey
      // });

      const stripeStatus = backerData?.refund?.status || null;

      return res.json({
        refundStatus: backerData.refundStatus,   // ✅ existing (unchanged)
        stripeRefundStatus: stripeStatus,        // ✅ new
        refundEligible: backerData.refundStatus === 'eligible', // unchanged
        allRefund: snapshotVal[entryKey]?.allRefund || false,   // new
        entryKey
      });

    } catch (error) {
      console.error('❌ Refund error:', error);
      return res.status(500).json({ refundEligible: false });
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
      if (!snapshot.exists()) return res.json({
        paymentStatus: 'no_data', searchedUid: clerkUserId,
        firebaseUrl: process.env.FIREBASE_URL
      });

      const snapshotVal = snapshot.val();
      const entryKey = Object.keys(snapshotVal)[0];
      const paymentPath = paymentType === 'backer' ? 'backerPayment' : 'stripePayment';
      const paymentData = snapshotVal[entryKey]?.[paymentPath];

      // return res.json({
      //   paymentStatus: paymentData?.paymentStatus || 'no_data',
      //   paymentData,
      //   entryKey,
      //   paymentType,
      //   paymentPath
      // });
      return res.json({
        paymentStatus: paymentData?.paymentStatus || 'no_data',
        paymentData,
        paymentFormData: snapshotVal[entryKey]?.PaymentFormData || null,
        resume: snapshotVal[entryKey]?.resume || null,
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
     🔥 BUILDER PLAN | FOUNDING BUILDER
  ===================================================== */
  if (req.method === 'POST' && req.query.save === 'builder-plan') {
    try {
      const body = await buffer(req);
      const {
        clerkUserId,
        planType,
        months,
        totalBuilderAmount,
        backerAmount,
        installmentAmount,
        schedule
      } = JSON.parse(body.toString());

      const snapshot = await db.ref('Mainformdata').orderByChild('uid').equalTo(clerkUserId).once('value');
      if (!snapshot.exists()) return res.status(404).json({ error: 'No user data' });

      const snapshotVal = snapshot.val();
      const entryKey = Object.keys(snapshotVal)[0];
      // ⭐ ADD THIS BLOCK
      const userSnap = await db.ref(`Mainformdata/${entryKey}`).once('value');
      const userData = userSnap.val();

      const customerId = userData?.stripeCustomerId;
      const paymentMethodId =
        userData?.backerPayment?.paymentMethodId ||
        userData?.stripePayment?.paymentMethodId;

      await db.ref(`Mainformdata/${entryKey}/builderPlan`).set({
        planType,
        ...(months && { months }),
        customerId,        // ⭐ ADDED
        paymentMethodId,   // ⭐ ADDED
        totalBuilderAmount: parseFloat(totalBuilderAmount),
        backerAmount: parseFloat(backerAmount),
        installmentAmount: parseFloat(installmentAmount),
        schedule: schedule.map(p => ({
          date: p.date,
          amount: parseFloat(p.amount),
          paymentStatus: p.paymentStatus || "pending",
          status: p.status || "pending"
        })),
        installmentsRemaining: schedule.length,
        nextDue: schedule[0]?.date,
        status: 'active',
        createdAt: Date.now()
      });
      await Promise.all(
        schedule.map(item =>
          db.ref(`duePayments/${item.date}/${entryKey}`).set(true)
        )
      );

      console.log(`✅ Builder plan saved: ${entryKey}`);
      try {
        const client = new BrevoClient({
          apiKey: process.env.BREVO_API_KEY,
        });

        const userSnap = await db.ref(`Mainformdata/${entryKey}`).once('value');
        const userData = userSnap.val();

        const email = userData?.email.toLowerCase();
        // userData?.email?.toLowerCase() ||
        // userData?.PaymentFormData?.useremail?.toLowerCase();

        if (email) {
          console.log("Foundign builder email", email)
          // ✅ Update attributes
          await fetch("https://api.brevo.com/v3/contacts", {
            method: "POST",
            headers: {
              "api-key": process.env.BREVO_API_KEY,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              email,
              attributes: {
                FOUNDING_BUILDER: true,
                FOUNDING_BUILDER_OPTED_AT: new Date().toISOString(),
                BUILDER_SCHEDULE_SELECTED: true,
                BUILDER_PLAN_SELECTED: planType || "CUSTOM",
                BUILDER_TOTAL_COMMITMENT: parseFloat(totalBuilderAmount)
              },
              updateEnabled: true
            })
          });

          // ✅ Trigger event → starts Workflow 7
          await client.event.createEvent({
            event_name: "founding_builder_opted_in",
            identifiers: {
              email_id: email
            }
          });

          console.log("✅ Workflow 7 triggered");

        } else {
          console.log("⚠️ No email found for builder");
        }

      } catch (err) {
        console.error("❌ Brevo Builder error:", err.message || err);
      }
      return res.json({
        success: true,
        entryKey,
        nextPayment: schedule[0],
        totalRemaining: schedule.length
      });

    } catch (error) {
      console.error('❌ Builder save error:', error);
      return res.status(500).json({ error: 'Builder plan save failed' });
    }
  }


  /* =====================================================
   🔥 FINAL PRODUCTION MULTI PAYMENT REFUND API
   - full rollback
   - per-payment refund tracking
   - upgrade aware
   - builder installment aware
   - failure safe
===================================================== */
  if (req.method === 'POST' && req.query.refund === 'payment') {
    try {
      const body = await buffer(req);
      const { clerkUserId } = JSON.parse(body.toString());

      if (!clerkUserId) {
        return res.status(400).json({ error: 'Missing clerkUserId' });
      }

      /* -------------------------------------------------
         1️⃣ FETCH USER
      ------------------------------------------------- */
      const snapshot = await db.ref('Mainformdata')
        .orderByChild('uid')
        .equalTo(clerkUserId)
        .once('value');

      if (!snapshot.exists()) {
        return res.status(404).json({ error: 'User not found' });
      }

      const snapshotVal = snapshot.val();
      const entryKey = Object.keys(snapshotVal)[0];
      const userData = snapshotVal[entryKey];

      const backer = userData?.backerPayment;
      const upgrades = userData?.upgradeHistory || {};
      const schedule = userData?.builderPlan?.schedule || [];

      if (!backer) {
        return res.status(400).json({ error: 'No backer payment found' });
      }

      /* -------------------------------------------------
         2️⃣ REFUND WINDOW CHECK
      ------------------------------------------------- */


      if (!backer?.refundWindowStart) {
        return res.status(400).json({ error: 'Upgrade window not available' });
      }

      if (backer.refundStatus !== 'eligible') {
        return res.status(400).json({ error: 'Upgrade not allowed' });
      }

      const windowEnd = backer.refundWindowStart + REFUND_WINDOW_MS;

      if (Date.now() > windowEnd) {
        return res.status(400).json({ error: 'Upgrade window expired (90 days passed)' });
      }

      /* -------------------------------------------------
         3️⃣ BUILD PAYMENT MAP
         path tells where to store refund result
      ------------------------------------------------- */
      /* 3️⃣ BUILD PAYMENT LIST TO REFUND */
      const payments = [];

      /* 1️⃣ ORIGINAL DEPOSIT ($99) */
      if (userData?.stripePayment?.stripePaymentIntentId) {
        payments.push({
          pi: userData.stripePayment.stripePaymentIntentId,
          path: `Mainformdata/${entryKey}/stripePayment/refund`
        });
      }

      /* 2️⃣ BACKER PAYMENT */
      if (backer?.stripePaymentIntentId) {
        payments.push({
          pi: backer.stripePaymentIntentId,
          path: `Mainformdata/${entryKey}/backerPayment/refund`
        });
      }

      /* 3️⃣ ALL UPGRADES */
      Object.entries(upgrades).forEach(([key, val]) => {
        if (val?.stripePaymentIntentId) {
          payments.push({
            pi: val.stripePaymentIntentId,
            path: `Mainformdata/${entryKey}/upgradeHistory/${key}/refund`
          });
        }
      });

      /* 4️⃣ BUILDER INSTALLMENTS (PAID ONLY) */
      schedule.forEach((item, index) => {
        if (item?.stripePaymentIntentId && item?.paymentStatus === 'success') {
          payments.push({
            pi: item.stripePaymentIntentId,
            path: `Mainformdata/${entryKey}/builderPlan/schedule/${index}/refund`
          });
        }
      });

      // BUILDER INSTALLMENTS (only paid ones)
      // schedule.forEach((item, index) => {
      //   if (item?.stripePaymentIntentId && item?.paymentStatus === 'success') {
      //     payments.push({
      //       pi: item.stripePaymentIntentId,
      //       path: `Mainformdata/${entryKey}/builderPlan/schedule/${index}/refund`
      //     });
      //   }
      // });

      if (payments.length === 0) {
        return res.status(400).json({ error: 'No payments to refund' });
      }

      /* -------------------------------------------------
         4️⃣ MARK GLOBAL REFUND PROCESSING
      ------------------------------------------------- */
      await db.ref(`Mainformdata/${entryKey}/backerPayment`).update({
        refundStatus: 'processing',
        refundStartedAt: Date.now()
      });

      /* -------------------------------------------------
         5️⃣ PROCESS REFUNDS ONE BY ONE
      ------------------------------------------------- */
      let successCount = 0;
      let failedCount = 0;

      for (const p of payments) {
        try {
          // mark node processing
          await db.ref(p.path).set({
            status: 'processing',
            startedAt: Date.now(),


          });

          const pi = await stripe.paymentIntents.retrieve(p.pi);

          if (pi.status !== 'succeeded') {
            throw new Error('Payment not succeeded');
          }

          const charges = await stripe.charges.list({
            payment_intent: p.pi
          });

          if (charges.data[0]?.amount_refunded > 0) {
            throw new Error('Already refunded');
          }

          const refund = await stripe.refunds.create(
            { payment_intent: p.pi },
            { idempotencyKey: `refund_${p.pi}` }
          );

          await db.ref(p.path).set({
            status: refund.status,
            refundId: refund.id,
            refundedAt: Date.now(),
            amount: refund.amount / 100,
            currency: refund.currency
          });
          await db.ref(`refundIndex/${refund.id}`).set({
            path: p.path
          });
          successCount++;

        } catch (err) {
          await db.ref(p.path).set({
            status: 'failed',
            error: err.message,
            failedAt: Date.now()
          });

          failedCount++;
        }
      }

      /* -------------------------------------------------
         6️⃣ FINAL GLOBAL STATUS
      ------------------------------------------------- */
      const finalStatus = failedCount === 0 ? 'success' : 'failed';

      await db.ref(`Mainformdata/${entryKey}/backerPayment`).update({
        refundStatus: finalStatus,
        refundCompletedAt: Date.now(),
        refundSummary: {
          totalPayments: payments.length,
          successCount,
          failedCount
        }
      });

      if (finalStatus === 'success') {
        await db.ref(`Mainformdata/${entryKey}`).update({
          allRefund: true,
          allRefundAt: Date.now()
        });
      }
      return res.json({
        success: finalStatus === 'success',
        refundStatus: finalStatus,
        totalPayments: payments.length,
        successCount,
        failedCount
      });

    } catch (error) {
      console.error('❌ Refund error:', error.message);
      return res.status(500).json({ error: error.message });
    }
  }



  /* =====================================================
   🔥 GENERATE BUILDER INSTALLMENT LINK (Pay Early)
 ======================================================== */
  if (req.method === 'POST' && req.query.generate === 'builder-link') {
    try {
      const body = await buffer(req);
      const { clerkUserId, installmentIndex } = JSON.parse(body.toString());

      if (!clerkUserId || installmentIndex === undefined) {
        return res.status(400).json({ error: 'Missing clerkUserId or installmentIndex' });
      }

      // Find user
      const snapshot = await db.ref('Mainformdata').orderByChild('uid').equalTo(clerkUserId).once('value');
      if (!snapshot.exists()) return res.status(404).json({ error: 'No user data' });

      const snapshotVal = snapshot.val();
      const entryKey = Object.keys(snapshotVal)[0];
      const builderPlan = snapshotVal[entryKey]?.builderPlan;

      if (!builderPlan?.schedule) {
        return res.status(404).json({ error: 'No builder plan found' });
      }

      const installment = builderPlan.schedule[installmentIndex];
      if (!installment || installment.status === 'paid') {
        return res.status(400).json({ error: 'Invalid or already paid installment' });
      }

      // 🔥 PAY EARLY: Generate link ANYTIME for unpaid (no date check!)


      // Create Stripe Payment Link
      const paymentLink = await stripe.paymentLinks.create({
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Founding Builder Installment #${installmentIndex + 1}`,
              description: `Due ${installment.date} - $${installment.amount}`,
              metadata: { earlyPayment: 'true' }
            },
            unit_amount: Math.round(installment.amount * 100)
          },
          quantity: 1
        }],
        payment_intent_data: {  // ← ✅ ADD THIS
          metadata: {           // ← ✅ ADD THIS
            firebaseEntryKey: entryKey,
            installmentIndex: installmentIndex.toString(),
            clerkUserId,
            planType: builderPlan.planType,
            paymentType: 'builder_installment'
          }
        }
      });


      // Update Firebase
      await db.ref(`Mainformdata/${entryKey}/builderPlan/schedule/${installmentIndex}`).update({
        status: 'pending',
        stripeLink: paymentLink.url,
        linkGeneratedAt: Date.now(),
        reminderCount: 0
      });

      // Update nextDue if first installment
      if (installmentIndex === 0 && builderPlan.nextDue === installment.date) {
        const nextIndex = 1;
        if (builderPlan.schedule[nextIndex]) {
          await db.ref(`Mainformdata/${entryKey}/builderPlan`).update({
            nextDue: builderPlan.schedule[nextIndex].date
          });
        }
      }

      console.log(`✅ Builder link generated: ${entryKey}[${installmentIndex}] (early: ${installment.date})`);
      return res.json({
        success: true,
        stripeLink: paymentLink.url,
        entryKey,
        installmentIndex,
        amount: installment.amount,
        dueDate: installment.date // Show original due for reference
      });

    } catch (error) {
      console.error('❌ Builder link error:', error);
      return res.status(500).json({ error: 'Link generation failed' });
    }
  }

  // ==========================================
  // FREE FOUNDING BACKER FLOW
  // ==========================================
  if (req.method === 'POST' && req.query.freeBacker === 'true') {
    try {

      const body = await buffer(req);
      const { clerkUserId } = JSON.parse(body.toString());

      if (!clerkUserId) {
        return res.status(400).json({ error: 'Missing clerkUserId' });
      }

      // Find user in Firebase
      const snapshot = await db.ref('Mainformdata')
        .orderByChild('uid')
        .equalTo(clerkUserId)
        .once('value');

      if (!snapshot.exists()) {
        return res.status(404).json({ error: 'User not found' });
      }

      const snapshotVal = snapshot.val();
      const firebaseEntryKey = Object.keys(snapshotVal)[0];

      // Update resume node
      await db.ref(`Mainformdata/${firebaseEntryKey}/resume`).update({
        earlyApplicationPaid: false,
        currentStep: 4,
        lastCompletedStep: 3
      });

      console.log(`✅ Free founding backer updated: ${firebaseEntryKey}`);

      return res.json({
        success: true,
        firebaseEntryKey
      });

    } catch (error) {
      console.error('❌ Free backer error:', error);

      return res.status(500).json({
        error: 'Free backer update failed'
      });
    }
  }

  // ==========================================
  // PAID EARLY APPLICATION CONTINUE FLOW
  // ==========================================
  if (req.method === 'POST' && req.query.paidEarlyContinue === 'true') {
    try {
      const body = await buffer(req);
      const { clerkUserId } = JSON.parse(body.toString());

      if (!clerkUserId) {
        return res.status(400).json({ error: 'Missing clerkUserId' });
      }

      const snapshot = await db.ref('Mainformdata')
        .orderByChild('uid')
        .equalTo(clerkUserId)
        .once('value');

      if (!snapshot.exists()) {
        return res.status(404).json({ error: 'User not found' });
      }

      const snapshotVal = snapshot.val();
      const firebaseEntryKey = Object.keys(snapshotVal)[0];
      const userData = snapshotVal[firebaseEntryKey];

      if (userData?.resume?.earlyApplicationPaid !== true) {
        return res.status(400).json({ error: 'Early application payment not completed' });
      }

      await db.ref(`Mainformdata/${firebaseEntryKey}/resume`).update({
        earlyApplicationPaid: true,
        currentStep: 4,
        lastCompletedStep: 3
      });

      console.log(`✅ Paid early application continued: ${firebaseEntryKey}`);

      return res.json({
        success: true,
        firebaseEntryKey
      });

    } catch (error) {
      console.error('❌ Paid early continue error:', error);

      return res.status(500).json({
        error: 'Paid early continue update failed'
      });
    }
  }


  /* =====================================================
   GENERATE $99 RECOVERY PAYMENT LINK
===================================================== */
  if (req.method === 'POST' && req.query.generateRecoveryLink === 'true') {
    try {
      const body = await buffer(req);
      const { clerkUserId } = JSON.parse(body.toString());

      if (!clerkUserId) {
        return res.status(400).json({ error: 'Missing clerkUserId' });
      }

      const snapshot = await db.ref('Mainformdata')
        .orderByChild('uid')
        .equalTo(clerkUserId)
        .once('value');

      if (!snapshot.exists()) {
        return res.status(404).json({ error: 'User not found' });
      }

      const snapshotVal = snapshot.val();
      const entryKey = Object.keys(snapshotVal)[0];
      const userData = snapshotVal[entryKey];

      const token = Date.now().toString(36) + Math.random().toString(36).substring(2, 12);

      await db.ref(`recoveryPaymentLinks/${token}`).set({
        token,
        clerkUserId,
        entryKey,
        email: userData?.email || userData?.PaymentFormData?.useremail || '',
        name: userData?.name || '',
        amount: 99,
        status: 'created',
        paymentSource: 'admin_recovery_link',
        createdAt: Date.now(),
        used: false
      });

      const paymentLink = `https://elysiumcommunities.com/pay-99?token=${token}`;

      return res.json({
        success: true,
        paymentLink,
        token,
        entryKey
      });

    } catch (error) {
      console.error('❌ Recovery link error:', error);
      return res.status(500).json({ error: 'Recovery link generation failed' });
    }
  }
  /* =====================================================
     🔥 CREATE PAYMENT INTENT (DEPOSIT/BACKER/UPGRADE)
  ===================================================== */


  if (req.method === 'POST') {
    try {
      const body = await buffer(req);
      // const {
      //   clerkUserId,
      //   paymentType = 'deposit',
      //   addons = [],
      //   dynamicAmount,
      //   targetPlan  // 🔥 UPGRADE SUPPORT
      // } = JSON.parse(body.toString());

      // if (!clerkUserId) {
      //   return res.status(400).json({ error: 'Missing clerkUserId' });
      // }

      // console.log(`🔍 ${paymentType} for ${clerkUserId}, targetPlan: ${targetPlan}`);

      // // 🔥 FETCH USER FIRST
      // const snapshot = await db.ref('Mainformdata').orderByChild('uid').equalTo(clerkUserId).once('value');
      // if (!snapshot.exists()) {
      //   return res.status(404).json({ error: 'No user data found' });
      // }

      // const snapshotVal = snapshot.val();
      // const entryKey = Object.keys(snapshotVal)[0];
      // const userData = snapshotVal[entryKey];
      const {
        clerkUserId,
        recoveryToken,
        paymentType = 'deposit',
        addons = [],
        deviceInfo = {},
        dynamicAmount,
        targetPlan,
        stripeMode
      } = JSON.parse(body.toString());
      const requestedStripeMode = stripeMode === 'test'
        ? 'test'
        : stripeMode === 'live'
          ? 'live'
          : (isLive ? 'live' : 'test');
      const activeStripe = requestedStripeMode === (isLive ? 'live' : 'test')
        ? stripe
        : getStripeClient(requestedStripeMode);

      if (!clerkUserId && !recoveryToken) {
        return res.status(400).json({ error: 'Missing clerkUserId or recoveryToken' });
      }

      console.log(`🔍 ${paymentType} for ${clerkUserId || recoveryToken}, targetPlan: ${targetPlan}, stripeMode: ${requestedStripeMode}`);

      let entryKey;
      let userData;
      let finalClerkUserId = clerkUserId;
      let isRecoveryPayment = false;

      if (recoveryToken) {
        const tokenSnap = await db.ref(`recoveryPaymentLinks/${recoveryToken}`).once('value');

        if (!tokenSnap.exists()) {
          return res.status(404).json({ error: 'Invalid payment link' });
        }

        const tokenData = tokenSnap.val();

        if (tokenData.used === true || tokenData.status === 'paid') {
          return res.status(400).json({ error: 'This payment link has already been used' });
        }

        entryKey = tokenData.entryKey;
        finalClerkUserId = tokenData.clerkUserId;
        isRecoveryPayment = true;

        const userSnap = await db.ref(`Mainformdata/${entryKey}`).once('value');

        if (!userSnap.exists()) {
          return res.status(404).json({ error: 'User record not found' });
        }

        userData = userSnap.val();

      } else {
        const snapshot = await db.ref('Mainformdata')
          .orderByChild('uid')
          .equalTo(clerkUserId)
          .once('value');

        if (!snapshot.exists()) {
          return res.status(404).json({ error: 'No user data found' });
        }

        const snapshotVal = snapshot.val();
        entryKey = Object.keys(snapshotVal)[0];
        userData = snapshotVal[entryKey];
      }

      const customerIdField = requestedStripeMode === 'test' ? 'stripeCustomerIdTest' : 'stripeCustomerId';
      let customerId = userData?.[customerIdField];

      if (!customerId) {
        const customer = await activeStripe.customers.create({
          email: userData?.email || "noemail@example.com"
        });

        customerId = customer.id;

        await db.ref(`Mainformdata/${entryKey}`).update({
          [customerIdField]: customerId
        });

        console.log(`✅ New ${requestedStripeMode} customer created:`, customerId);
      }

      // 🔥 PRICING LOGIC
      let totalAmount;

      /* UPGRADE */
      if (paymentType === 'backer' && targetPlan) {
        const backer = userData?.backerPayment;

        if (!backer?.refundWindowStart) {
          return res.status(400).json({ error: 'Upgrade window not available' });
        }

        if (backer.refundStatus !== 'eligible') {
          return res.status(400).json({ error: 'Upgrade not allowed' });
        }

        const windowEnd = backer.refundWindowStart + REFUND_WINDOW_MS;

        if (Date.now() > windowEnd) {
          return res.status(400).json({ error: 'Upgrade window expired (90 days passed)' });
        }

        const currentPaid = parseFloat(backer?.fullAmount || 0);
        const newPlanPrice = PLAN_PRICES[targetPlan];

        if (!newPlanPrice) {
          return res.status(400).json({ error: 'Invalid plan' });
        }

        const upgradeAmount = newPlanPrice - currentPaid;

        if (upgradeAmount <= 0) {
          return res.status(400).json({ error: 'Nothing to upgrade' });
        }

        totalAmount = upgradeAmount;
      }
      /* FIRST FULL BACKER */
      // else if (paymentType === 'backer') {
      //   const dbPrice = parseFloat(userData?.PaymentFormData?.priceperfoot || 0);
      //   if (!dbPrice) {
      //     return res.status(400).json({ error: 'No unit price in DB' });
      //   }
      //   totalAmount = dbPrice;
      // }

      else if (paymentType === 'backer') {
        const dbPrice = getPaymentFormAmount(userData?.PaymentFormData);

        // ✅ ONLY deduct if webhook has confirmed deposit
        const depositPaid = userData?.resume?.earlyApplicationPaid === true;

        const depositAmount = parseFloat(userData?.stripePayment?.depositAmount || 99);

        if (depositPaid) {
          console.log(`✅ Deposit verified → deducting $${depositAmount}`);
        } else {
          console.log("⚠️ No verified deposit → full amount charged");
        }

        totalAmount = depositPaid
          ? Math.max(0, dbPrice - depositAmount)
          : dbPrice;
      }
      /* DEPOSIT */
      else {
        const BASE_PRICE = PRICING.deposit;
        const ADDON_PRICE = PRICING.addon;
        totalAmount = BASE_PRICE + (Array.isArray(addons) && addons.length > 0 ? ADDON_PRICE : 0);
      }

      if (totalAmount < 0.50) {
        return res.status(400).json({ error: 'Amount too small' });
      }

      // Clerk verify
      // await safeClerkVerify(clerkUserId).catch(() => {
      //   console.log('⚠️ Clerk check skipped');
      // });
      if (finalClerkUserId) {
        await safeClerkVerify(finalClerkUserId).catch(() => {
          console.log('⚠️ Clerk check skipped');
        });
      }

      const paymentPath = paymentType === 'backer' ? 'backerPayment' : 'stripePayment';
      // const existingPayment = userData?.[paymentPath];
      const existingPayment = isRecoveryPayment ? null : userData?.[paymentPath];

      let paymentIntent;
      let intentAction = 'created';

      // 🔥 REUSE EXISTING INTENT (your original logic)
      if (existingPayment?.stripePaymentIntentId) {
        try {
          paymentIntent = await activeStripe.paymentIntents.retrieve(existingPayment.stripePaymentIntentId);
          const canUpdate = ['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(paymentIntent.status);

          if (canUpdate) {
            const existingAmount = paymentIntent.amount / 100;
            if (Math.abs(existingAmount - totalAmount) < 0.01) {
              intentAction = 'reused';
            } else {
              intentAction = 'updated';
              paymentIntent = await activeStripe.paymentIntents.update(existingPayment.stripePaymentIntentId, {
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
        let baseAmount = 0;
        let addonAmount = 0;

        if (paymentType === 'deposit') {
          baseAmount = PRICING.deposit;
          addonAmount = Array.isArray(addons) && addons.length > 0 ? PRICING.addon : 0;
        }
        paymentIntent = await activeStripe.paymentIntents.create({
          amount: Math.round(totalAmount * 100),
          currency: 'usd',
          customer: customerId, // ⭐ IMPORTANT

          setup_future_usage: 'off_session', // ⭐ IMPORTANT
          metadata: {
            clerkUserId: finalClerkUserId,
            firebaseEntryKey: entryKey,
            paymentType,
            stripeMode: requestedStripeMode,
            browser: deviceInfo?.browser || '',
            device: deviceInfo?.device || '',
            os: deviceInfo?.os || '',
            recoveryToken: recoveryToken || '',
            paymentSource: isRecoveryPayment ? 'admin_recovery_link' : 'normal_funnel',
            paidFromRecoveryLink: isRecoveryPayment ? 'true' : 'false',
            fullAmount: getPaymentFormAmount(userData?.PaymentFormData).toString(),
            ...(targetPlan && {
              upgrade: "true",
              targetPlan,
              newPlanPrice: PLAN_PRICES[targetPlan]?.toString()
            }),
            ...(paymentType === 'backer' && { dynamicAmount: totalAmount.toString() }),
            addons: JSON.stringify(addons),
            addonAmount: addonAmount.toString(),
            baseAmount: baseAmount.toString(),
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
        mode: requestedStripeMode,
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
