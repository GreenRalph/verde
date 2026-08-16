// VER-DÉ — capture a PayPal order and return a verified access token.
// The buyer receives access only after PayPal reports a COMPLETED capture.
const crypto = require('crypto');

async function getAccessToken() {
  var id = process.env.PAYPAL_CLIENT_ID;
  var secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error('PayPal credentials are not configured.');
  var auth = Buffer.from(id + ':' + secret).toString('base64');
  var r = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + auth,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  if (!r.ok) throw new Error('PayPal authentication failed.');
  return (await r.json()).access_token;
}

function makeToken(orderId) {
  var secret = process.env.PAYPAL_CLIENT_SECRET;
  var sig = crypto.createHmac('sha256', secret).update(orderId).digest('base64url');
  return orderId + '.' + sig;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    var body = req.body || {};
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    var orderId = String(body.orderID || '').trim();
    if (!/^[A-Z0-9]+$/.test(orderId)) return res.status(400).json({ error: 'Invalid PayPal order.' });

    var token = await getAccessToken();
    var r = await fetch('https://api-m.paypal.com/v2/checkout/orders/' + encodeURIComponent(orderId) + '/capture', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': 'verde-capture-' + orderId
      },
      body: '{}'
    });
    var data = await r.json();
    if (!r.ok) {
      console.error('PayPal capture error', data);
      return res.status(502).json({ error: 'PayPal could not complete the payment.' });
    }

    var capture = data.purchase_units && data.purchase_units[0] && data.purchase_units[0].payments && data.purchase_units[0].payments.captures && data.purchase_units[0].payments.captures[0];
    var completed = data.status === 'COMPLETED' && capture && capture.status === 'COMPLETED' && capture.amount && capture.amount.currency_code === 'USD' && capture.amount.value === '7.00';
    if (!completed) return res.status(402).json({ error: 'Payment was not completed.' });

    return res.status(200).json({ ok: true, accessToken: makeToken(orderId) });
  } catch (err) {
    console.error('PayPal capture error', err);
    return res.status(500).json({ error: 'Payment verification is unavailable right now.' });
  }
};
