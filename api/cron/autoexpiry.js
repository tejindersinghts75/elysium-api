import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

// Prevent multiple app init
if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

  initializeApp({
    credential: cert(serviceAccount),
    databaseURL: process.env.FIREBASE_URL
  });
}

const db = getDatabase();

//const REFUND_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const REFUND_WINDOW_MS = 60 * 1000;

export default async function handler(req, res) {

  // 🔒 Protect endpoint (VERY IMPORTANT)
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const snapshot = await db.ref("Mainformdata").once("value");
    const users = snapshot.val();

    if (!users) {
      return res.json({ message: "No users found" });
    }

    const now = Date.now();
    let expiredCount = 0;

    for (const entryKey in users) {
      const backer = users[entryKey]?.backerPayment;

      if (
        backer &&
        backer.refundStatus === "eligible" &&
        backer.refundWindowStart
      ) {
        const windowEnd = backer.refundWindowStart + REFUND_WINDOW_MS;

        if (now >= windowEnd) {
          await db.ref(`Mainformdata/${entryKey}/backerPayment`).update({
            refundStatus: "expired",
            refundWindowEnd: windowEnd,
            expiredAt: now
          });

          expiredCount++;
          console.log("Expired:", entryKey);
        }
      }
    }

    return res.json({
      success: true,
      expiredCount
    });

  } catch (error) {
    console.error("Cron error:", error);
    return res.status(500).json({ error: "Cron failed" });
  }
}