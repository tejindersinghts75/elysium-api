import { BrevoClient } from "@getbrevo/brevo";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

const app =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
      credential: cert(serviceAccount),
      databaseURL: process.env.FIREBASE_URL,
    });

const db = getDatabase(app);

export default async function handler(req, res) {
  // ✅ CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed",
    });
  }

  try {
    const { uid } = req.body;

    if (!uid) {
      return res.status(400).json({
        success: false,
        message: "uid is required",
      });
    }

    // ✅ Fetch user by UID (optimized)
    const snap = await db
      .ref("Mainformdata")
      .orderByChild("uid")
      .equalTo(uid)
      .once("value");

    const data = snap.val();
    const matchedUser = data ? Object.values(data)[0] : null;

    if (!matchedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    // ==============================================
    // 🔥 ADD THIS CODE HERE (AFTER finding matchedUser)
    // ==============================================

    // Get the Firebase push key
    const firebaseKey = Object.keys(data)[0];

    // Update the resume node - set webinarWatched to true
    try {
      await db.ref(`Mainformdata/${firebaseKey}/resume`).update({
        webinarWatched: true,
        webinarWatchedAt: new Date().toISOString()
      });
      console.log(`✅ Updated webinarWatched for user ${uid}`);
    } catch (updateError) {
      console.error('❌ Failed to update resume:', updateError);
    }

    // ==============================================
    // END OF ADDED CODE
    // ==============================================

    // ✅ Extract email
    const emailLower =
      matchedUser?.email?.toLowerCase() ||
      matchedUser?.PaymentFormData?.useremail?.toLowerCase();

    if (!emailLower) {
      return res.status(400).json({
        success: false,
        message: "No email found",
      });
    }

    // ✅ Calculate amount dynamically (IMPORTANT)
    const pledge = parseFloat(
      matchedUser?.PaymentFormData?.priceperfoot || 0
    );

    const depositAmount = parseFloat(
      matchedUser?.stripePayment?.amount || 0
    );

    const amountDueNow =
      depositAmount > 0
        ? Math.max(0, pledge - depositAmount)
        : pledge;

    // ✅ Brevo client
    const client = new BrevoClient({
      apiKey: process.env.BREVO_API_KEY,
    });

    // ✅ Update contact
    await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: emailLower,
        attributes: {
          WEBINAR_WATCHED: true,
          WEBINAR_WATCHED_AT: new Date().toISOString(),
          FOUNDING_BACKER_AMOUNT_DUE_NOW: amountDueNow,
        },
        updateEnabled: true,
      }),
    });

    // ✅ Send event
    await client.event.createEvent({
      event_name: "webinar_watched",
      identifiers: {
        email_id: emailLower,
      },
    });

    return res.status(200).json({
      success: true,
      message: "webinar_watched sent successfully",
      data: {
        hasBackerPayment: matchedUser?.backerPayment?.paymentStatus === 'success'
      }
    });
  } catch (error) {
    console.error("❌ Error:", error.message || error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}