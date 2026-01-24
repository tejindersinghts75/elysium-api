// api/thankyou/timer-status/route.js
import { NextResponse } from 'next/server';
import { getDatabase } from 'firebase-admin/database';
import { createClerkClient } from '@clerk/backend';

const db = getDatabase();
const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const clerkUserId = searchParams.get('clerkUserId');

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Missing clerkUserId' }, { status: 400 });
    }

    // 1. Verify Clerk user exists (security)
    try {
      await clerkClient.users.getUser(clerkUserId);
    } catch (error) {
      return NextResponse.json({ error: 'Invalid user' }, { status: 401 });
    }

    // 2. Find user's Mainformdata entry
    const mainformdataRef = db.ref('Mainformdata');
    let entryKey = null;

    const snapshot = await mainformdataRef.once('value');
    snapshot.forEach((childSnapshot) => {
      const data = childSnapshot.val();
      if (data.uid === clerkUserId) {
        entryKey = childSnapshot.key;
      }
    });

    if (!entryKey) {
      return NextResponse.json({
        endTime: null,
        timerExpired: true,
        remainingSeconds: 0
      });
    }

    // 3. Get timer data
    const timerRef = db.ref(`Mainformdata/${entryKey}`);
    const timerSnapshot = await timerRef.once('value');
    const timerData = timerSnapshot.val();

    const timerExpired = timerData?.timerExpired === true;
    let endTime = timerData?.endTime;
    let remainingSeconds = 0;

    // 4. Calculate remaining time if active
    if (!timerExpired && endTime) {
      const now = Math.floor(Date.now() / 1000);
      remainingSeconds = Math.max(0, endTime - now);

      // Auto-expire if time reached 0
      if (remainingSeconds === 0) {
        await timerRef.update({
          timerExpired: true,
          endTime: null
        });
        return NextResponse.json({
          endTime: null,
          timerExpired: true,
          remainingSeconds: 0
        });
      }
    }

    // 5. Initialize timer if first visit (30 minutes = 1800 seconds)
    if (!timerExpired && !endTime) {
      endTime = Math.floor(Date.now() / 1000) + 1800;
      await timerRef.update({
        endTime,
        timerExpired: false
      });
    }

    return NextResponse.json({
      endTime,
      timerExpired,
      remainingSeconds
    });

  } catch (error) {
    console.error('Timer status error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
