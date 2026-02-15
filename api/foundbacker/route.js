import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { NextRequest, NextResponse } from 'next/server';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: process.env.FIREBASE_URL
});
const db = getDatabase(app);

export async function OPTIONS(request) {
  return new NextResponse(null, { status: 200 });
}

export async function GET() {
  try {
    const snapshot = await db.ref('Mainformdata').once('value');
    const data = snapshot.val() || {};

    const users = Object.entries(data).map(([id, user]) => ({
      id,
      name: user.name || '',
      email: user.email || '',
      mobile: user.mobile || '',
      isFounder: Boolean(user.isFounder)
    }));

    return NextResponse.json(users);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const formData = await request.formData();
    const userId = formData.get('userId');
    const isFounderValue = formData.get('isFounder');

    if (!userId || isFounderValue === null) {
      return NextResponse.json({ error: 'Missing userId or isFounder' }, { status: 400 });
    }

    const isFounderBoolean = isFounderValue === 'true';

    await db.ref(`Mainformdata/${userId}`).update({
      isFounder: isFounderBoolean,
      founderUpdatedAt: Date.now()
    });

    return NextResponse.json({
      success: true,
      userId,
      isFounder: isFounderBoolean
    });
  } catch (error) {
    console.error('PATCH error:', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}
