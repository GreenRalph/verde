// VER-DÉ — releases the paid film manifest, but only for a verified Founding Access token.
const crypto = require('crypto');

/* ============================================================
   THE PAID CATALOGUE.
   All eighteen film IDs are filled in. Add new titles here as they
   are released — nothing else needs to change.
   ============================================================ */
const FILMS = {
  'PROJECT 39: REBUILD':                        { type: 'single', id: 'yBTwnDkEcOc' },
  'THE STORM ANSWERS':                          { type: 'single', id: '55-tFh4IAzA' },
  'MARAMING KAMAY':                             { type: 'single', id: 'zdYKfAKUkPg' },
  'THE WILDERNESS — 16:9 original':             { type: 'single', id: 'WOD2cUUMFuQ' },
  'PROOF OF PRESENCE':                          { type: 'single', id: 'H_jKj8FZq10' },
  'THE WILDERNESS — 9:16 vertical':             { type: 'single', id: 'yIreldc7cIA', vertical: true },
  'PROJECT 39: FOUR MOVEMENTS':                 { type: 'rail', rail: 'movements', items: [
    { no: 'I',   id: 'pydgg2xGePo', name: 'THE FALL' },
    { no: 'II',  id: 'xE8u1qrew_k', name: 'PURGATORY' },
    { no: 'III', id: 'wnhfy1LG2wA', name: 'THE FARM' },
    { no: 'IV',  id: 'Ed5Z-15TfYY', name: 'THE RESTAURANT' }
  ] },
  'PROJECT 39 — Episodes 28 onward · Playlist': { type: 'rail', rail: 'episodes', items: [
    { no: '35', id: 'ULYcM3dFzcw', name: 'BUHAY' },
    { no: '34', id: 'P5OtJTIG0ks', name: 'BALIK' },
    { no: '33', id: 'Ge2qq4j-f00', name: 'A FILM THAT NEVER HAPPENED' },
    { no: '32', id: 'i6G54cSTQMw', name: 'WHAT THE FIELD GIVES' },
    { no: '31', id: '89CfeisPhlc', name: 'REBUILD // BODY' },
    { no: '30', id: 'rTMsH0Q7J5w', name: 'ONE MORE LOAD' },
    { no: '29', id: 'MvoThE55rcQ', name: 'ANOTHER LAYER' },
    { no: '28', id: 'SqZV6giZwng', name: 'THE COMPOST PIT' }
  ] }
};

async function getAccessToken() {
  var id = (process.env.PAYPAL_CLIENT_ID || '').trim();
  var secret = (process.env.PAYPAL_CLIENT_SECRET || '').trim();
  if (!id || !secret) throw new Error('PayPal credentials are not configured.');
  var auth = Buffer.from(id + ':' + secret).toString('base64');
  var r = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  if (!r.ok) throw new Error('PayPal authentication failed.');
  return (await r.json()).access_token;
}

function safeEqual(a, b) {
  var aa = Buffer.from(a || '');
  var bb = Buffer.from(b || '');
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    var token = String((req.query && req.query.token) || '').trim();
    var parts = token.split('.');
    if (parts.length !== 2 || !/^[A-Z0-9]+$/.test(parts[0])) return res.status(401).json({ valid: false });

    var orderId = parts[0];
    var signingSecret = (process.env.PAYPAL_CLIENT_SECRET || '').trim();
    var expected = crypto.createHmac('sha256', signingSecret).update(orderId).digest('base64url');
    if (!safeEqual(parts[1], expected)) return res.status(401).json({ valid: false });

    var accessToken = await getAccessToken();
    var r = await fetch('https://api-m.paypal.com/v2/checkout/orders/' + encodeURIComponent(orderId), {
      headers: { Authorization: 'Bearer ' + accessToken }
    });
    if (!r.ok) return res.status(401).json({ valid: false });

    var data = await r.json();
    var capture = data.purchase_units && data.purchase_units[0]
      && data.purchase_units[0].payments
      && data.purchase_units[0].payments.captures
      && data.purchase_units[0].payments.captures[0];

    var valid = data.status === 'COMPLETED'
      && capture && capture.status === 'COMPLETED'
      && capture.amount && capture.amount.currency_code === 'USD'
      && capture.amount.value === '7.00';

    if (!valid) return res.status(401).json({ valid: false });
    return res.status(200).json({ valid: true, films: FILMS });
  } catch (err) {
    console.error('VER-DÉ films error', err);
    return res.status(500).json({ valid: false });
  }
};
