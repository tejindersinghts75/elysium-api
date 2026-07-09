import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { createClerkClient } from '@clerk/backend';
import { BrevoClient } from '@getbrevo/brevo';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

const app = getApps().length
    ? getApps()[0]
    : initializeApp({
        credential: cert(serviceAccount),
        databaseURL: process.env.FIREBASE_URL,
    });

const db = getDatabase(app);

const clerkClient = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
});

function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';

        req.on('data', (chunk) => {
            data += chunk;
        });

        req.on('end', () => {
            try {
                resolve(JSON.parse(data || '{}'));
            } catch {
                reject(new Error('Invalid JSON'));
            }
        });

        req.on('error', reject);
    });
}

function cleanString(value) {
    return String(value || '').trim();
}

function cleanEmail(value) {
    return String(value || '').toLowerCase().trim();
}

function normalizeArray(value) {
    if (Array.isArray(value)) return value.map(cleanString).filter(Boolean);
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed.map(cleanString).filter(Boolean);
        } catch { }
        return value ? [value.trim()] : [];
    }
    return [];
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body = await parseJsonBody(req);

        console.log('📥 V2 DATA RECEIVED:', body);
        if (body.action === 'emailOnly') {
            const useremail = cleanEmail(body.useremail || body.email);

            if (!useremail) {
                return res.status(400).json({ error: 'Email is required' });
            }

            if (!useremail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
                return res.status(400).json({ error: 'Invalid email format' });
            }

            let userId = null;
            let tempPassword = null;
            let mode = 'new';

            try {
                const userListResponse = await clerkClient.users.getUserList({
                    emailAddress: [useremail],
                    limit: 1,
                });

                if (userListResponse.data.length > 0) {
                    userId = userListResponse.data[0].id;
                    mode = 'update';
                    console.log('✅ Existing Clerk user found:', userId);
                }
            } catch (error) {
                console.error('❌ Clerk check failed:', error.message);
            }

            if (!userId) {
                tempPassword = `Auto@${Date.now()}Aa1!${Math.random().toString(36).slice(-8)}`;

                const emailPrefix = useremail
                    .split('@')[0]
                    .replace(/[^a-zA-Z0-9]/g, '');

                const username = `${emailPrefix}${Math.floor(Math.random() * 10000)}`;

                try {
                    const user = await clerkClient.users.createUser({
                        emailAddress: [useremail],
                        username,
                        firstName: emailPrefix || 'User',
                        password: tempPassword,
                        skipEmailVerification: true,
                        unsafeMetadata: {
                            funnelVersion: 'v2',
                            emailOnlyStepCompleted: true,
                            createdAt: Date.now(),
                        },
                    });
                    userId = user.id;
                    mode = 'new';

                    console.log('✅ New Clerk user created:', userId);
                } catch (error) {
                    console.error('❌ Clerk creation failed:', error.message);
                    console.error('❌ Clerk errors:', JSON.stringify(error.errors || error, null, 2));
                    return res.status(500).json({
                        error: 'Unable to create Clerk user',
                        details: error.errors?.[0]?.longMessage || error.errors?.[0]?.message || error.message,
                    });
                }
            }

            const mainformdataRef = db.ref('Mainformdata');

            const snapshot = await mainformdataRef
                .orderByChild('uid')
                .equalTo(userId)
                .once('value');

            let entryKey = null;

            if (snapshot.exists()) {
                snapshot.forEach((child) => {
                    entryKey = child.key;
                });
            } else {
                entryKey = String(Date.now());
            }

            const mainUpdateData = {
                uid: userId,
                email: useremail,
                funnelVersion: 'v2',
                emailOnlyStepCompleted: true,
                updatedAt: Date.now(),
            };

            if (!snapshot.exists()) {
                mainUpdateData.createdAt = Date.now();
            }

            await db.ref(`Mainformdata/${entryKey}`).update(mainUpdateData);

            await db.ref(`Mainformdata/${entryKey}/resume`).update({
                step1Completed: true,
                step2Completed: false,
                currentStep: 2,
                lastCompletedStep: 1,
                earlyApplicationPaid: false,
                earlyApplicationPaymentRequired: false,
                webinarWatched: false,
                foundingBackerPaid: false,
                funnelVersion: 'v2',
                updatedAt: Date.now(),
            });

            await db.ref(`users/${userId}`).update({
                email: useremail,
                funnelVersion: 'v2',
                emailOnlyStepCompleted: true,
                updatedAt: Date.now(),
            });
            const signInToken = await clerkClient.signInTokens.createSignInToken({
                userId,
                expiresInSeconds: 60 * 10,
            });
            return res.json({
                success: true,
                mode,
                userId,
                email: useremail,
                signInToken: signInToken.token,
                tempPassword,
                entryKey,
                funnelVersion: 'v2',
                message: 'V2 email saved successfully',
            });
        }
        let {
            clerkUserId,
            name,
            useremail,
            mobile,
            incomeRange,
            income,
            fitAnswer,
            relocateAustin,
            topCity,
            moveTimeline,
            interestedIn,
            communityKind,
            unit,
            teslaoptions,
            chooseterm,
            selectapplication,
            diningpackage,
            priceperfoot,
        } = body;

        name = cleanString(name);
        useremail = cleanEmail(useremail);
        mobile = cleanString(mobile);
        incomeRange = cleanString(incomeRange || income);
        fitAnswer = cleanString(fitAnswer);
        relocateAustin = cleanString(relocateAustin);
        topCity = cleanString(topCity);
        moveTimeline = cleanString(moveTimeline);
        communityKind = cleanString(communityKind);
        interestedIn = normalizeArray(interestedIn);

        teslaoptions = cleanString(teslaoptions);
        chooseterm = cleanString(chooseterm);
        selectapplication = cleanString(selectapplication);
        diningpackage = cleanString(diningpackage);
        priceperfoot = cleanString(priceperfoot);

        let userId = clerkUserId || null;

        if (!useremail && userId) {
            try {
                const existingUser = await clerkClient.users.getUser(userId);
                useremail = cleanEmail(existingUser?.emailAddresses?.[0]?.emailAddress);
            } catch (error) {
                console.error('❌ Clerk email fetch failed:', error.message);
            }
        }

        if (!name) {
            return res.status(400).json({ error: 'Please enter your name' });
        }

        if (!useremail) {
            return res.status(400).json({ error: 'Email is missing. Please complete email step first.' });
        }

        if (!useremail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        if (!incomeRange) {
            return res.status(400).json({ error: 'Please select income' });
        }

        if (!fitAnswer) {
            return res.status(400).json({ error: 'Please enter why you are a good fit' });
        }

        if (!relocateAustin) {
            return res.status(400).json({ error: 'Please select Austin relocation answer' });
        }

        if (!topCity) {
            return res.status(400).json({ error: 'Please enter your top city' });
        }

        if (!moveTimeline) {
            return res.status(400).json({ error: 'Please select move-in timeline' });
        }

        if (!interestedIn.length) {
            return res.status(400).json({ error: 'Please select what you are interested in' });
        }

        if (!communityKind) {
            return res.status(400).json({ error: 'Please select community type' });
        }

        if (!priceperfoot || !chooseterm || !selectapplication) {
            return res.status(400).json({ error: 'Please complete all required selections' });
        }

        const cleanName = name.replace(/[^a-zA-Z\s]/g, '').trim();
        const firstName = cleanName.split(' ')[0] || 'User';
        const lastName = cleanName.split(' ').slice(1).join(' ') || '';
        const username = `${firstName.toLowerCase()}${Math.floor(Math.random() * 10000)}`;

        let tempPassword = null;
        let mode = 'new';
        let clerkSuccess = false;

        try {
            const userListResponse = await clerkClient.users.getUserList({
                emailAddress: [useremail],
                limit: 1,
            });

            if (userListResponse.data.length > 0) {
                userId = userListResponse.data[0].id;
                mode = 'update';
                clerkSuccess = true;
                console.log('✅ Existing Clerk user found:', userId);
            }
        } catch (error) {
            console.error('❌ Clerk check failed:', error.message);
        }

        if (!userId) {
            tempPassword = `Auto@${Date.now()}Aa1!${Math.random().toString(36).slice(-8)}`;

            try {
                const user = await clerkClient.users.createUser({
                    emailAddress: [useremail],
                    username,
                    firstName,
                    lastName,
                    password: tempPassword,
                    skipEmailVerification: true,
                    unsafeMetadata: {
                        mobile,
                        incomeRange,
                        fitAnswer,
                        relocateAustin,
                        topCity,
                        moveTimeline,
                        interestedIn,
                        communityKind,
                        funnelVersion: 'v2',
                        createdAt: Date.now(),
                    },
                });

                userId = user.id;
                clerkSuccess = true;
                mode = 'new';

                console.log('✅ New Clerk user created:', userId);
            } catch (error) {
                console.error('❌ Clerk creation failed:', error.message);
                console.error('❌ Clerk full error:', JSON.stringify(error.errors || error, null, 2));

                return res.status(500).json({
                    error: 'Unable to create Clerk user',
                    details: error.message,
                });
            }
        } else {
            try {
                await clerkClient.users.updateUser(userId, {
                    firstName,
                    lastName,
                    unsafeMetadata: {
                        mobile,
                        incomeRange,
                        fitAnswer,
                        relocateAustin,
                        topCity,
                        moveTimeline,
                        interestedIn,
                        communityKind,
                        funnelVersion: 'v2',
                        updatedAt: Date.now(),
                    },
                });
            } catch (error) {
                console.error('❌ Clerk update failed:', error.message);
            }
        }

        const mainformdataRef = db.ref('Mainformdata');

        const snapshot = await mainformdataRef.orderByChild('uid').equalTo(userId).once('value');

        let entryKey = null;

        if (snapshot.exists()) {
            snapshot.forEach((child) => {
                entryKey = child.key;
            });

            console.log('✅ Existing Firebase entry found:', entryKey);
        } else {
            entryKey = String(Date.now());
            console.log('✅ New Firebase entry will be created:', entryKey);
        }

        let parsedUnit = [];

        try {
            parsedUnit = unit ? JSON.parse(unit) : [];
        } catch (error) {
            console.warn('⚠️ Unit parse failed:', error.message);
            parsedUnit = [];
        }

        let selectedUnitName = 'N/A';

        if (Array.isArray(parsedUnit)) {
            const selectedUnit = parsedUnit.find((item) => item.selected === 'selected');
            if (selectedUnit?.text) selectedUnitName = selectedUnit.text;
        }

        const commonV2Data = {
            incomeRange,
            income: incomeRange,
            fitAnswer,
            relocateAustin,
            topCity,
            moveTimeline,
            interestedIn,
            communityKind,
        };

        const mainUpdateData = {
            uid: userId,
            name,
            email: useremail,
            mobile,
            ...commonV2Data,
            funnelVersion: 'v2',
            isFounder: false,
            updatedAt: Date.now(),
        };

        if (!snapshot.exists()) {
            mainUpdateData.createdAt = Date.now();
        }

        await db.ref(`Mainformdata/${entryKey}`).update(mainUpdateData);

        await db.ref(`users/${userId}`).update({
            firstname: firstName,
            lastname: lastName,
            email: useremail,
            mobile,
            ...commonV2Data,
            funnelVersion: 'v2',
            updatedAt: Date.now(),
        });

        await db.ref(`Mainformdata/${entryKey}/PaymentFormData`).set({
            name,
            useremail,
            mobile,
            ...commonV2Data,
            unit: parsedUnit,
            teslaoptions,
            chooseterm,
            selectapplication,
            diningpackage,
            priceperfoot,
            funnelVersion: 'v2',
            submittedAt: Date.now(),
        });

        const selectedApplication = String(selectapplication || '').trim();

        const resumeUpdate = {
            step1Completed: true,
            step2Completed: true,
            webinarWatched: false,
            foundingBackerPaid: false,
            funnelVersion: 'v2',
        };

        if (selectedApplication === '99') {
            resumeUpdate.currentStep = 2;
            resumeUpdate.lastCompletedStep = 1;
            resumeUpdate.earlyApplicationPaid = false;
            resumeUpdate.earlyApplicationPaymentRequired = true;
        }

        if (selectedApplication === '0' || selectedApplication === 'standard') {
            resumeUpdate.currentStep = 3;
            resumeUpdate.lastCompletedStep = 2;
            resumeUpdate.earlyApplicationPaid = false;
            resumeUpdate.earlyApplicationPaymentRequired = false;
        }

        await db.ref(`Mainformdata/${entryKey}/resume`).update(resumeUpdate);

        try {
            const client = new BrevoClient({
                apiKey: process.env.BREVO_API_KEY,
            });

            await fetch('https://api.brevo.com/v3/contacts', {
                method: 'POST',
                headers: {
                    'api-key': process.env.BREVO_API_KEY,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: useremail,
                    attributes: {
                        FIRSTNAME: firstName,
                        PHONE: mobile,
                        INCOME: incomeRange,
                        UNIT_TYPE: selectedUnitName,
                        FUNNEL_VERSION: 'v2',
                        CUSTOMIZATION_COMPLETED: true,
                        CUSTOMIZATION_COMPLETED_AT: new Date().toISOString(),
                    },
                    updateEnabled: true,
                }),
            });

            await client.event.createEvent({
                event_name: 'unit_customization_completed_v2',
                identifiers: {
                    email_id: useremail,
                },
                event_properties: {
                    incomeRange,
                    fitAnswer,
                    relocateAustin,
                    topCity,
                    moveTimeline,
                    interestedIn,
                    communityKind,
                    selectedUnitName,
                    priceperfoot,
                },
            });

            console.log('✅ V2 Brevo event sent');
        } catch (brevoError) {
            console.error('❌ Brevo error:', brevoError.message || brevoError);
        }

        return res.json({
            success: true,
            mode,
            userId,
            email: useremail,
            tempPassword,
            firstName,
            entryKey,
            clerkSuccess,
            funnelVersion: 'v2',
            message: 'V2 form saved successfully',
        });
    } catch (error) {
        console.error('💥 V2 ERROR:', error);

        return res.status(500).json({
            error: 'Server error',
            details: error.message,
        });
    }
}