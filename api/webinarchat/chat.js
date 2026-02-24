import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: process.env.FIREBASE_URL
});
const db = getDatabase(app);

export default async function handler(req, res) {
  // 🔥 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  try {
    if (req.method === 'POST') {
      // SEND MESSAGE
      const { message, name, clerkId } = req.body;

      if (!message?.trim() || message.trim().length > 500) {
        return res.status(400).json({ error: 'Invalid message (1-500 chars)' });
      }
      if (!name?.trim()) {
        return res.status(400).json({ error: 'Name required' });
      }

      // Rate limit (3 msg/min per IP)
      const cleanIp = ip.replace(/[^a-zA-Z0-9]/g, '_');
      const minuteBucket = Math.floor(Date.now() / 60000);
      const rateKey = `chat_rate/${cleanIp}/${minuteBucket}`;
      const rateCheck = await db.ref(rateKey).once('value');
      if (rateCheck.val() >= 3) {
        return res.status(429).json({ error: 'Slow down! Max 3 msg/min' });
      }
      await db.ref(rateKey).transaction(c => (c || 0) + 1);

      // 🔥 SAVE TO FLAT chats-webinar
      const chatKey = await db.ref('chats-webinar').push({
        text: message.trim(),
        clerkId: clerkId || 'anonymous',
        name: name.trim().substring(0, 50),  // Max 50 chars
        ip: cleanIp,
        timestamp: Date.now()
      }).key;

      res.json({ success: true, messageId: chatKey });
    }
    else if (req.method === 'GET') {
      // GET LAST 50 MESSAGES
      const snapshot = await db.ref('chats-webinar')
        .orderByChild('timestamp')
        .limitToLast(50)
        .once('value');

      const messages = [];
      snapshot.forEach(snap => messages.unshift(snap.val()));

      res.json({ success: true, messages, count: messages.length });
    }
  } catch (error) {
    console.error('💥 Chat error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}
