import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

const app = initializeApp({
    credential: cert(serviceAccount),
    databaseURL: process.env.FIREBASE_URL
});

const db = getDatabase(app);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    if (req.method === 'POST') {
        try {
            const { clerkUserId } = req.body;

            if (!clerkUserId) {
                return res.status(400).json({ error: 'Missing clerkUserId' });
            }

            const ref = db.ref('Mainformdata');
            const snapshot = await ref
                .orderByChild('uid')
                .equalTo(clerkUserId)
                .once('value');

            if (!snapshot.exists()) {
                return res.status(404).json({ error: 'User not found' });
            }

            const updates = [];

            snapshot.forEach((child) => {
                updates.push(
                    db.ref(`Mainformdata/${child.key}/resume`).update({
                        callBooked: true,
                        currentStep: 6
                    })
                );
            });

            await Promise.all(updates);

            return res.json({ success: true });

        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: 'Update failed' });
        }
    }
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }



    try {
        const { clerkUserId } = req.query;

        if (!clerkUserId) {
            return res.status(400).json({ error: 'Missing clerkUserId' });
        }

        const mainformdataRef = db.ref('Mainformdata');
        const snapshot = await mainformdataRef
            .orderByChild('uid')
            .equalTo(clerkUserId)
            .once('value');

        if (!snapshot.exists()) {
            return res.json({ step: 1, target: "/" });
        }

        let resume = null;
        snapshot.forEach((child) => {
            resume = child.val().resume;
        });

        if (!resume) {
            return res.json({ step: 1, target: "/" });
        }

        let step = resume.currentStep || 1;

        // // 🔥 MAIN LOGIC (ONLY PAYMENT CONTROLS FINAL STEP)
        // if (resume.foundingBackerPaid) {
        //     step = 5; // go to calendly directly
        // }
        // 🔥 FINAL CONTROL
        // if (resume.callBooked) {
        //     step = 6; // FINAL LOCK
        // }
        // else if (resume.foundingBackerPaid) {
        //     step = 5; // Calendly
        // }


        const foundingBackerPaid = resume.foundingBackerPaid === true;
        const foundingBuilderPaid = resume.foundingBuilderPaid === true;

        if (resume.callBooked) {
            step = 6;
        }
        else if (foundingBackerPaid && foundingBuilderPaid) {
            step = 5;
        }
        else if (step === 4) {
            step = 4;
        }
        let target = "/";
        if (step === 2) target = "/living-spaces";
        else if (step === 3) target = "/thankyou";
        else if (step === 4) target = "/webinar";
        else if (step === 5) target = "/book-your-call"; // ✅ FINAL STEP
        else if (step === 6) target = "/booking-success"; // ✅ FINAL

        return res.json({ step, target });

    } catch (error) {
        console.error("Resolve step error:", error);
        return res.status(500).json({ error: "Server error" });
    }
}

