export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { name, email } = req.body;
    const userId = `test_${Date.now()}`;

    // NO DATABASE - INSTANT RESPONSE (50ms)
    res.json({
      success: true,
      userId,
      redirect: '/thank-you',
      message: 'VERCEL WORKING - NO DATABASE!',
      testData: { name, email }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
