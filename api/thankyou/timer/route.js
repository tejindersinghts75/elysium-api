// api/thankyou/timer/route.js
import { getDatabase } from 'firebase-admin/database';
import { createClerkClient } from '@clerk/backend';

const db = getDatabase();
const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export async function POST(req) {
  try {
    const { clerkUserId, action } = await req.json();

    // 1. Validate Clerk user exists
    const clerkUser = await clerkClient.users.getUser(clerkUserId);

    // 2. Find user's Mainformdata entry
    const mainformdataRef = db.ref('Mainformdata');
    let entryKey = null;

    mainformdataRef.once('value', snapshot => {
      snapshot.forEach(child => {
        if (child.val().uid === clerkUserId) {
          entryKey = child.key;
        }
      });
    });

    if (!entryKey) {
      return NextResponse.json({ error: 'No form data found' }, { status: 404 });
    }

    const timerRef = db.ref(`Mainformdata/${entryKey}`);

    if (action === 'reset') {
      // Reset timer to 30 minutes
      const endTime = Math.floor(Date.now() / 1000) + (30 * 60);
      await timerRef.update({
        endTime,
        timerExpired: false
      });
      return NextResponse.json({ endTime, timerExpired: false });
    }

    if (action === 'expire') {
      // Fortified button - immediate expiry
      await timerRef.update({
        timerExpired: true,
        endTime: null
      });
      return NextResponse.json({ timerExpired: true });
    }

    // Default: Get current timer status
    const snapshot = await timerRef.once('value');
    const data = snapshot.val();

    let endTime = data?.endTime;
    let timerExpired = data?.timerExpired || false;

    // Initialize if first visit
    if (!endTime) {
      endTime = Math.floor(Date.now() / 1000) + (30 * 60);
      await timerRef.update({ endTime, timerExpired: false });
    }

    return NextResponse.json({ endTime, timerExpired });

  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
