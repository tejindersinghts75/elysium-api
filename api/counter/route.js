// api/counter/route.js
export async function GET() {
  const db = getDatabase();
  const snapshot = await db.ref('Mainformdata').once('value');
  const data = snapshot.val() || {};
  const userCount = Object.keys(data).length;
  let totalReferrals = 0;

  Object.values(data).forEach(user => {
    totalReferrals += Object.keys(user.referrals || {}).length;
  });

  const availableSeats = 300 + userCount - totalReferrals * 2;
  return NextResponse.json({ availableSeats });
}
