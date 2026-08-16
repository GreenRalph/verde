// VER-DÉ — verify a Founding Access token against the signed PayPal order.
const crypto = require('crypto');
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
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    var token = String(req.query && req.query.token || '').trim();
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
    var capture = data.purchase_units && data.purchase_units[0] && data.purchase_units[0].payments && data.purchase_units[0].payments.captures && data.purchase_units[0].payments.captures[0];
    var valid = data.status === 'COMPLETED' && capture && capture.status === 'COMPLETED' && capture.amount && capture.amount.currency_code === 'USD' && capture.amount.value === '7.00';
    return res.status(valid ? 200 : 401).json({ valid: Boolean(valid) });
  } catch (err) {
    console.error('PayPal verify error', err);
    return res.status(500).json({ valid: false });
  }
};
