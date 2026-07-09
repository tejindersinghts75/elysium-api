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

const WAITLIST_POSITION_BASE = 391;
const WAITLIST_POSITION_STARTED_AT = Date.parse('2026-07-04T10:25:00.000Z');

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

function buildWebflowStyleUnitArray(selectedView) {
    const riverImage = 'https://cdn.prod.website-files.com/67390856dab71fc4dbe2bbcd/6a0875382f446e742c7992ba_Reservation%20River%20Facing.webp';
    const natureImage = 'https://cdn.prod.website-files.com/67390856dab71fc4dbe2bbcd/6a08754b4d585f3f94216d11_Reservation%20Nature%20Facing%20a.webp';
    const isRiver = cleanString(selectedView).toLowerCase() === 'river';

    return [
        {
            image: riverImage,
            selected: isRiver ? 'selected' : 'unselected',
            text: 'River Facing',
        },
        {
            image: natureImage,
            selected: isRiver ? 'unselected' : 'selected',
            text: 'Nature Facing',
        },
    ];
}

async function getExistingUserCreatedAt(userId) {
    const snapshot = await db.ref(`users/${userId}/createdAt`).once('value');
    return snapshot.exists() ? snapshot.val() : Date.now();
}

async function getV3WaitlistPosition() {
    const snapshot = await db.ref('Mainformdata')
        .orderByChild('PaymentFormData/submittedAt')
        .startAt(WAITLIST_POSITION_STARTED_AT)
        .once('value');

    let completedCount = 0;

    snapshot.forEach((child) => {
        const value = child.val() || {};
        if (value.funnelVersion === 'v3' || value.PaymentFormData?.funnelVersion === 'v3') {
            completedCount += 1;
        }
    });

    return WAITLIST_POSITION_BASE + Math.max(0, completedCount - 1);
}

async function updateReferralChain({ referredBy, referralId, status, name, email, mobile, userId }) {
    const cleanReferredBy = cleanString(referredBy);
    const cleanReferralId = cleanString(referralId);

    if (!cleanReferredBy || !cleanReferralId) return;

    try {
        const referrerFormSnap = await db.ref('Mainformdata')
            .orderByChild('uid')
            .equalTo(cleanReferredBy)
            .once('value');

        if (!referrerFormSnap.exists()) {
            console.log('⚠️ V3 referral referrer not found:', cleanReferredBy);
            return;
        }

        const updateData = {
            status,
            source: 'funnel-v3',
            timestamp: Date.now(),
        };

        if (status === 'completed') updateData.completedAt = Date.now();
        if (name) updateData.name = cleanString(name);
        if (email) updateData.email = cleanEmail(email);
        if (mobile) updateData.mobile = cleanString(mobile);
        if (userId) updateData.userId = userId;

        const updatePromises = [];
        referrerFormSnap.forEach((snapshot) => {
            updatePromises.push(
                db.ref(`Mainformdata/${snapshot.key}/referrals/${cleanReferralId}`).update(updateData)
            );
        });

        await Promise.all(updatePromises);
        console.log('✅ V3 referral chain updated:', { referralId: cleanReferralId, status });
    } catch (error) {
        console.log('⚠️ V3 referral update skipped:', error.message);
    }
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

        console.log('📥 V3 DATA RECEIVED:', body);
        if (body.action === 'emailOnly') {
            const useremail = cleanEmail(body.useremail || body.email);
            const referredBy = cleanString(body.referredBy);
            const referralId = cleanString(body.referralId);

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
                    console.log('✅ Existing Clerk user found:', userId);
                    return res.status(400).json({
                        error: 'User already exists with this email',
                        code: 'USER_ALREADY_EXISTS',
                    });
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
                            funnelVersion: 'v3',
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
                funnelVersion: 'v3',
                emailOnlyStepCompleted: true,
                updatedAt: Date.now(),
            };

            if (referredBy && referralId) {
                mainUpdateData.referredBy = referredBy;
                mainUpdateData.referralId = referralId;
                mainUpdateData.referral = {
                    referredBy,
                    referralId,
                    status: 'signed_up',
                    source: 'funnel-v3',
                    timestamp: Date.now(),
                };
            }

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
                funnelVersion: 'v3',
                updatedAt: Date.now(),
            });

            await db.ref(`users/${userId}`).set({
                createdAt: await getExistingUserCreatedAt(userId),
                email: useremail,
                firstname: '',
                lastname: '',
                mobile: '',
            });

            await updateReferralChain({
                referredBy,
                referralId,
                status: 'signed_up',
                email: useremail,
                userId,
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
                funnelVersion: 'v3',
                message: 'V3 email saved successfully',
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
            why,
            relocateAustin,
            selectedCity,
            topCity,
            moveTimeline,
            interestedIn,
            communityKind,
            community,
            unit,
            view,
            occupants,
            founderBacker,
            earlyInterest,
            teslaoptions,
            chooseterm,
            selectapplication,
            diningpackage,
            priceperfoot,
            priceperfootDisplay,
            monthlyHousehold,
            monthlyPerPerson,
            monthlyCredits,
            effectiveMonthly,
            annualRenewal,
            referredBy,
            referralId,
        } = body;

        name = cleanString(name);
        useremail = cleanEmail(useremail);
        mobile = cleanString(mobile);
        incomeRange = cleanString(incomeRange || income);
        fitAnswer = cleanString(why || fitAnswer);
        relocateAustin = cleanString(selectedCity || relocateAustin);
        topCity = cleanString(topCity);
        moveTimeline = cleanString(moveTimeline);
        communityKind = normalizeArray(communityKind || community);
        interestedIn = normalizeArray(interestedIn);

        teslaoptions = cleanString(teslaoptions);
        chooseterm = cleanString(chooseterm);
        selectapplication = cleanString(selectapplication);
        diningpackage = cleanString(diningpackage);
        const priceperfootRaw = cleanString(priceperfoot);
        const unitRaw = cleanString(unit);
        const viewRaw = cleanString(view);
        const priceperfootLooksLikeUnit = priceperfootRaw.startsWith('[') || priceperfootRaw.startsWith('{');
        const unitLooksLikeUnit = unitRaw.startsWith('[') || unitRaw.startsWith('{');
        const unitSelection = priceperfootLooksLikeUnit ? priceperfootRaw : (unitLooksLikeUnit ? unitRaw : priceperfootRaw);
        const selectedView = unitLooksLikeUnit ? viewRaw : (unitRaw || viewRaw);
        const monthlyPricePerPerson = Number(monthlyPerPerson) || 0;
        priceperfoot = unitSelection;
        priceperfootDisplay = cleanString(priceperfootDisplay);
        view = selectedView;
        occupants = Number.parseInt(occupants, 10) || 1;
        founderBacker = Boolean(founderBacker);
        earlyInterest = Boolean(earlyInterest);
        monthlyHousehold = Number(monthlyHousehold) || 0;
        monthlyPerPerson = monthlyPricePerPerson;
        monthlyCredits = Number(monthlyCredits) || 0;
        effectiveMonthly = Number(effectiveMonthly) || 0;
        annualRenewal = Number(annualRenewal) || 599;
        referredBy = cleanString(referredBy);
        referralId = cleanString(referralId);

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

        if (!moveTimeline) {
            return res.status(400).json({ error: 'Please select move-in timeline' });
        }

        if (!interestedIn.length) {
            return res.status(400).json({ error: 'Please select what you are interested in' });
        }

        if (!priceperfoot || !teslaoptions || !chooseterm || !selectapplication || !diningpackage) {
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
                const existingClerkUserId = userListResponse.data[0].id;
                if (existingClerkUserId !== clerkUserId) {
                    console.log('✅ Existing Clerk user found:', existingClerkUserId);
                    return res.status(400).json({
                        error: 'User already exists with this email',
                        code: 'USER_ALREADY_EXISTS',
                    });
                }

                userId = existingClerkUserId;
                mode = 'update';
                clerkSuccess = true;
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
                        why: fitAnswer,
                        selectedCity: relocateAustin,
                        topCity,
                        moveTimeline,
                        interestedIn,
                        communityKind,
                        unit: view,
                        occupants,
                        founderBacker,
                        earlyInterest,
                        funnelVersion: 'v3',
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
                        why: fitAnswer,
                        selectedCity: relocateAustin,
                        topCity,
                        moveTimeline,
                        interestedIn,
                        communityKind,
                        unit: view,
                        occupants,
                        founderBacker,
                        earlyInterest,
                        funnelVersion: 'v3',
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
            parsedUnit = priceperfoot ? JSON.parse(priceperfoot) : [];
        } catch (error) {
            console.warn('⚠️ Unit parse failed:', error.message);
            parsedUnit = [];
        }

        let selectedUnitName = 'N/A';

        if (Array.isArray(parsedUnit)) {
            const selectedUnit = parsedUnit.find((item) => item.selected === 'selected');
            if (selectedUnit?.text) selectedUnitName = selectedUnit.text;
        }

        const webflowStyleUnit = buildWebflowStyleUnitArray(view);

        const commonV3Data = {
            income: incomeRange,
            why: fitAnswer,
            selectedCity: relocateAustin,
            topCity,
            moveTimeline,
            interestedIn,
            communityKind,
            unit: view,
            occupants,
            founderBacker,
            earlyInterest,
            selectapplication,
        };

        const mainUpdateData = {
            uid: userId,
            name,
            email: useremail,
            mobile,
            ...commonV3Data,
            funnelVersion: 'v3',
            isFounder: false,
            updatedAt: Date.now(),
        };

        if (referredBy && referralId) {
            mainUpdateData.referredBy = referredBy;
            mainUpdateData.referralId = referralId;
            mainUpdateData.referral = {
                referredBy,
                referralId,
                status: 'completed',
                source: 'funnel-v3',
                completedAt: Date.now(),
            };
        }

        if (!snapshot.exists()) {
            mainUpdateData.createdAt = Date.now();
        }

        await db.ref(`Mainformdata/${entryKey}`).update(mainUpdateData);

        await db.ref(`users/${userId}`).set({
            createdAt: await getExistingUserCreatedAt(userId),
            firstname: firstName,
            lastname: lastName,
            email: useremail,
            mobile,
        });

        await db.ref(`Mainformdata/${entryKey}/PaymentFormData`).set({
            name,
            useremail,
            mobile,
            ...commonV3Data,
            priceperfoot: parsedUnit,
            unit: webflowStyleUnit,
            teslaoptions,
            chooseterm,
            diningpackage,
            priceperfootDisplay,
            monthlyHousehold,
            monthlyPerPerson,
            monthlyCredits,
            effectiveMonthly,
            annualRenewal,
            referredBy,
            referralId,
            funnelVersion: 'v3',
            submittedAt: Date.now(),
        });

        const selectedApplication = String(selectapplication || '').trim();

        const resumeUpdate = {
            step1Completed: true,
            step2Completed: true,
            webinarWatched: false,
            foundingBackerPaid: false,
            funnelVersion: 'v3',
        };

        if (selectedApplication === '99' || selectedApplication === 'early') {
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

        await updateReferralChain({
            referredBy,
            referralId,
            status: 'completed',
            name,
            email: useremail,
            mobile,
            userId,
        });

        const waitlistPosition = await getV3WaitlistPosition();

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
                        FUNNEL_VERSION: 'v3',
                        CUSTOMIZATION_COMPLETED: true,
                        CUSTOMIZATION_COMPLETED_AT: new Date().toISOString(),
                    },
                    updateEnabled: true,
                }),
            });

            await client.event.createEvent({
                event_name: 'unit_customization_completed_v3',
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
                    priceperfootDisplay,
                    view,
                    occupants,
                    founderBacker,
                    earlyInterest,
                    monthlyHousehold,
                    monthlyPerPerson,
                    monthlyCredits,
                    effectiveMonthly,
                },
            });

            console.log('✅ V3 Brevo event sent');
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
            waitlistPosition,
            clerkSuccess,
            funnelVersion: 'v3',
            message: 'V3 form saved successfully',
        });
    } catch (error) {
        console.error('💥 V3 ERROR:', error);

        return res.status(500).json({
            error: 'Server error',
            details: error.message,
        });
    }
}
