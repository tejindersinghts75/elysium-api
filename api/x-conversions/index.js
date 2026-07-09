import crypto from 'crypto';

const X_PIXEL_ID = 'rcajc';
const X_CONVERSIONS_URL = `https://ads-api.x.com/12/measurement/conversions/${X_PIXEL_ID}`;

const EVENT_IDS = {
  step0_complete: process.env.X_EVENT_STEP0_ID,
  step1_complete: process.env.X_EVENT_STEP1_ID,
  step2_complete: process.env.X_EVENT_STEP2_ID,
  step3_complete: process.env.X_EVENT_STEP3_ID,
  step5_payment_info: process.env.X_EVENT_STEP5_ID,
};

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
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

function cleanString(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function sha256(value) {
  const normalized = cleanString(value).toLowerCase();
  if (!normalized) return '';
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '';
}

function buildIdentifiers({ twclid, email, phone }, req) {
  const identifiers = {};
  const hashedEmail = sha256(email);
  const hashedPhone = sha256(phone);
  const ipAddress = getClientIp(req);
  const userAgent = cleanString(req.headers['user-agent'] || '', 1000);

  if (twclid) identifiers.twclid = cleanString(twclid, 300);
  if (hashedEmail) identifiers.hashed_email = hashedEmail;
  if (hashedPhone) identifiers.hashed_phone_number = hashedPhone;
  if (ipAddress && userAgent) {
    identifiers.ip_address = ipAddress;
    identifiers.user_agent = userAgent;
  }

  return identifiers;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!process.env.X_PIXEL_TOKEN) {
      return res.status(500).json({ error: 'X_PIXEL_TOKEN is not configured.' });
    }

    const body = await parseJsonBody(req);
    const eventName = cleanString(body.eventName, 80);
    const eventId = EVENT_IDS[eventName];
    const conversionId = cleanString(body.conversionId, 120);

    if (!eventId) {
      return res.status(400).json({ error: `Unknown or unconfigured X event: ${eventName}` });
    }
    if (!conversionId) {
      return res.status(400).json({ error: 'conversionId is required.' });
    }

    const identifiers = buildIdentifiers({
      twclid: body.twclid,
      email: body.email,
      phone: body.phone,
    }, req);

    if (!Object.keys(identifiers).length) {
      return res.status(400).json({ error: 'At least one identifier is required.' });
    }

    const payload = {
      conversions: [
        {
          conversion_time: new Date().toISOString(),
          event_id: eventId,
          event_source_url: cleanString(body.eventSourceUrl, 1000) || req.headers.referer || '',
          conversion_id: conversionId,
          identifiers: [identifiers],
        },
      ],
    };

    const response = await fetch(X_CONVERSIONS_URL, {
      method: 'POST',
      headers: {
        'X-Pixel-Token': process.env.X_PIXEL_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    if (!response.ok) {
      console.error('X CAPI conversion failed:', response.status, responseText);
      return res.status(response.status).json({
        error: 'X CAPI conversion failed.',
        details: responseText,
      });
    }

    return res.status(200).json({
      success: true,
      eventName,
      conversionId,
    });
  } catch (error) {
    console.error('X CAPI endpoint error:', error);
    return res.status(500).json({ error: 'Unable to send X conversion.', details: error.message });
  }
}
