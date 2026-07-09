import formidable from 'formidable';
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { createClerkClient } from '@clerk/backend';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: process.env.FIREBASE_URL
});
const db = getDatabase(app);
const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

async function parseBody(req) {
  const contentType = String(req.headers['content-type'] || '');

  if (contentType.includes('application/json')) {
    return new Promise((resolve, reject) => {
      let data = '';

      req.on('data', (chunk) => {
        data += chunk;
      });

      req.on('end', () => {
        try {
          resolve(JSON.parse(data || '{}'));
        } catch (error) {
          reject(error);
        }
      });

      req.on('error', reject);
    });
  }

  const form = formidable({ multiples: false });
  const [fields] = await form.parse(req);
  return fields;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    try {
      const snapshot = await db.ref('Mainformdata').once('value');
      const data = snapshot.val() || {};

      // const users = Object.entries(data).map(([id, user]) => ({
      //   id,
      //   name: user.name || '',
      //   email: user.email || '',
      //   mobile: user.mobile || '',
      //   isFounder: (user.isFounder == 1 || user.isFounder === true)  // Handle both
      // }));
      const users = Object.entries(data).map(([id, user]) => ({
        id,
        uid: user.uid || '',
        name: user.name || '',
        email: user.email || '',
        mobile: user.mobile || '',
        isFounder: (user.isFounder == 1 || user.isFounder === true),

        earlyApplicationPaid: user?.resume?.earlyApplicationPaid === true,
        earlyApplicationPaymentStatus: user?.stripePayment?.paymentStatus || 'not_paid'
      }));

      res.json(users);
    } catch (error) {
      console.error('GET error:', error);
      res.status(500).json({ error: 'Server error' });
    }
    return;
  }

  if (req.method === 'PATCH') {
    try {
      const fields = await parseBody(req);

      const userId = firstValue(fields.userId);
      const isFounderValue = firstValue(fields.isFounder);

      const setFounder = isFounderValue === 'true';

      if (!userId) {
        return res.status(400).json({ error: 'userId required' });
      }

      const snapshot = await db.ref(`Mainformdata/${userId}`).once('value');
      const currentData = snapshot.val() || {};

      // ✅ STORE BOOLEAN
      currentData.isFounder = setFounder;
      currentData.founderUpdatedAt = Date.now();

      await db.ref(`Mainformdata/${userId}`).update(currentData);

      const verify = await db.ref(`Mainformdata/${userId}/isFounder`).once('value');

      res.json({
        success: true,
        userId,
        isFounder: verify.val(),
        verified: true
      });
      return
    } catch (error) {
      console.error('PATCH error:', error);
      res.status(500).json({ error: 'Server error' });
    }
    return;
  }

  if (req.method === 'DELETE') {
    try {
      const fields = await parseBody(req);
      const entryId = firstValue(fields.entryId || fields.id);
      const clerkUserId = firstValue(fields.clerkUserId || fields.uid || fields.userId);

      if (!entryId && !clerkUserId) {
        return res.status(400).json({ error: 'entryId or clerkUserId required' });
      }

      let resolvedEntryKey = entryId || null;

      if (!resolvedEntryKey && clerkUserId) {
        const snapshot = await db.ref('Mainformdata').orderByChild('uid').equalTo(clerkUserId).once('value');

        if (snapshot.exists()) {
          snapshot.forEach((child) => {
            resolvedEntryKey = child.key;
          });
        }
      }

      if (clerkUserId) {
        try {
          await clerkClient.users.deleteUser(clerkUserId);
        } catch (error) {
          console.warn('Clerk delete warning:', error.message);
        }
      }

      if (resolvedEntryKey) {
        await db.ref(`Mainformdata/${resolvedEntryKey}`).remove();
      }

      if (clerkUserId) {
        await db.ref(`users/${clerkUserId}`).remove();
      }

      return res.json({
        success: true,
        entryId: resolvedEntryKey,
        clerkUserId,
      });
    } catch (error) {
      console.error('DELETE error:', error);
      return res.status(500).json({ error: 'Server error' });
    }
  }


  res.status(405).json({ error: 'Method not allowed' });
}
