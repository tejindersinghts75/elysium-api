// api/users/latest/route.js
export async function GET() {
  const db = getDatabase();
  const snapshot = await db.ref('users').orderByChild('createdAt').limitToLast(10).once('value');
  const users = [];
  snapshot.forEach(child => {
    const user = child.val();
    users.push({
      firstname: user.firstname,
      lastname: user.lastname
    });
  });
  return NextResponse.json(users.reverse());
}
