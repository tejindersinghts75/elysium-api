import Stripe from "stripe";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const isLive = process.env.STRIPE_MODE === 'live';

const stripe = new Stripe(
    isLive
        ? process.env.STRIPE_SECRET_KEY_LIVE
        : process.env.STRIPE_SECRET_KEY_TEST
);

if (!getApps().length) {
    initializeApp({
        credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
        databaseURL: process.env.FIREBASE_URL
    });
}

const db = getDatabase();

export default async function handler(req, res) {

    // 🔒 Protect endpoint
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    try {
        const today = new Date().toISOString().split("T")[0];

        const dueRef = db.ref(`duePayments/${today}`);
        const snapshot = await dueRef.once("value");
        const users = snapshot.val();

        if (!users) {
            return res.json({ message: "No due payments" });
        }

        const entryKeys = Object.keys(users).slice(0, 50);

        let processed = 0;

        for (const entryKey of entryKeys) {

            const userSnap = await db.ref(`Mainformdata/${entryKey}`).once("value");
            const user = userSnap.val();

            const plan = user?.builderPlan;
            if (!plan) continue;

            const installmentIndex = plan.schedule.findIndex(
                i => i.date === today && i.status !== "paid"
            );

            if (installmentIndex === -1) continue;

            const installment = plan.schedule[installmentIndex];

            // 🔴 Fresh DB check
            const freshSnap = await db
                .ref(`Mainformdata/${entryKey}/builderPlan/schedule/${installmentIndex}`)
                .once("value");

            const freshInstallment = freshSnap.val();

            if (freshInstallment?.status === "paid") continue;
            // ⏳ Retry delay check
            if (freshInstallment?.nextRetryAt && Date.now() < freshInstallment.nextRetryAt) {
                continue; // skip until retry time
            }
            // 🔴 Payment data check
            if (!plan.customerId || !plan.paymentMethodId) {
                console.log("❌ Missing payment data:", entryKey);
                continue;
            }

            try {
                // 🔴 Mark processing
                await db.ref(`Mainformdata/${entryKey}/builderPlan/schedule/${installmentIndex}`).update({
                    status: "processing"
                });

                // 💳 AUTO CHARGE
                const paymentIntent = await stripe.paymentIntents.create(
                    {
                        amount: Math.round(installment.amount * 100),
                        currency: "usd",
                        customer: plan.customerId,
                        payment_method: plan.paymentMethodId,
                        off_session: true,
                        confirm: true,
                        metadata: {
                            firebaseEntryKey: entryKey,
                            installmentIndex: installmentIndex.toString(),
                            paymentType: "builder_installment"
                        }
                    },
                    {
                        idempotencyKey: `${entryKey}-${installmentIndex}`
                    }
                );

                // 🔥 HANDLE NON-SUCCESS
                if (paymentIntent.status !== "succeeded") {
                    throw new Error(`Autopay incomplete: ${paymentIntent.status}`);
                }

                // ✅ Success
                await dueRef.child(entryKey).remove();
                processed++;
                await db.ref(`Mainformdata/${entryKey}/builderPlan/schedule/${installmentIndex}`).update({
                    retryCount: 0,
                    nextRetryAt: null
                });

            } catch (err) {
                console.error("❌ Charge failed:", entryKey, err.message);

                const scheduleRef = db.ref(`Mainformdata/${entryKey}/builderPlan/schedule/${installmentIndex}`);

                const snap = await scheduleRef.once("value");
                const data = snap.val();

                const retryCount = data?.retryCount || 0;

                // 🔴 STOP after 3 attempts
                if (retryCount >= 2) {
                    console.log("⛔ Max retries reached:", entryKey);

                    // remove from duePayments → stop retry
                    await dueRef.child(entryKey).remove();

                    await scheduleRef.update({
                        status: "failed",
                        paymentStatus: "failed",
                        finalFailure: true,
                        failedAt: Date.now(),
                        error: err.message
                    });

                } else {
                    console.log(`🔁 Retry ${retryCount + 1} for ${entryKey}`);

                    // increment retry count
                    let nextRetryAt;

                    if (retryCount === 0) {
                        nextRetryAt = Date.now() + (60 * 60 * 1000); // 1 hour
                    } else if (retryCount === 1) {
                        nextRetryAt = Date.now() + (6 * 60 * 60 * 1000); // 6 hours
                    } else {
                        nextRetryAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
                    }

                    await scheduleRef.update({
                        status: "failed",
                        paymentStatus: "failed",
                        retryCount: retryCount + 1,
                        failedAt: Date.now(),
                        nextRetryAt, // 🔥 important
                        error: err.message
                    });

                    // keep in duePayments for retry
                    await dueRef.child(entryKey).set(true);
                }

                // 🔥 GLOBAL LOG (keep this)
                await db.ref(`Mainformdata/${entryKey}/builderPlan`).update({
                    lastAutoChargeError: err.message,
                    lastAttemptAt: Date.now()
                });
            }
        }

        return res.json({
            success: true,
            processed
        });

    } catch (error) {
        console.error("❌ Cron error:", error);
        return res.status(500).json({ error: "Cron failed" });
    }
}