// VER-DÉ — PayPal order creation
// Live credentials stay in Vercel environment variables.

function readBody(req) {
  return new Promise(function (resolve) {
    if (req.body) {
      try { resolve(typeof req.body === 'string' ? JSON.parse(req.body) : req.body); return; }
      catch (e) { resolve({}); return; }
    }
    var raw = '';
    req.on('data', function (chunk) { raw += chunk; });
    req.on('end', function () {
      try { resolve(JSON.parse(raw || '{}')); } catch (e) { resolve({}); }
    });
    req.on('error', function () { resolve({}); });
  });
}

async function getAccessToken() {
  var id = process.env.PAYPAL_CLIENT_ID;
  var secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error('PayPal credentials are not configured.');

  var auth = Buffer.from(id + ':' + secret).toString('base64');
  var r = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + auth,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  if (!r.ok) throw new Error('PayPal authentication failed: ' + (await r.text()).slice(0, 300));
  var data = await r.json();
  return data.access_token;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await readBody(req);
    var token = await getAccessToken();

    var r = await fetch('https://api-m.paypal.com/v2/checkout/orders', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': 'verde-' + Date.now() + '-' + Math.random().toString(36).slice(2)
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          description: 'VER-DÉ Founding Access — lifetime film catalog access',
          custom_id: 'VERDE_FOUNDING_ACCESS',
          amount: {
            currency_code: 'USD',
            value: '7.00'
          }
        }],
        application_context: {
          brand_name: 'VER-DÉ',
          user_action: 'PAY_NOW',
          shipping_preference: 'NO_SHIPPING'
        }
      })
    });

    var data = await r.json();
    if (!r.ok) {
      console.error('PayPal create order error', data);
      return res.status(502).json({ error: 'Could not create PayPal order.' });
    }

    return res.status(200).json({ id: data.id });
  } catch (err) {
    console.error('PayPal order error', err);
    return res.status(500).json({ error: 'PayPal checkout is unavailable right now.' });
  }
};
