export default async function handler(req, res) {

  // ✅ CORS HEADERS
  res.setHeader("Access-Control-Allow-Origin", "https://www.elysiumcommunities.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // ✅ Handle preflight request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { name, email, message } = req.body;

  try {
    const auth = Buffer.from(
      process.env.ZENDESK_EMAIL + "/token:" + process.env.ZENDESK_API_TOKEN
    ).toString("base64");

    const response = await fetch(
      `https://${process.env.ZENDESK_SUBDOMAIN}.zendesk.com/api/v2/requests`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${auth}`
        },
        body: JSON.stringify({
          request: {
            requester: { name, email },
            subject: `Website inquiry from ${name}`,
            comment: {
              body: `Name: ${name}\nEmail: ${email}\nMessage: ${message}`
            }
          }
        })
      }
    );

    const data = await response.json();

    return res.status(200).json({ success: true });

  } catch (error) {
    return res.status(500).json({ error: "Zendesk error" });
  }
}