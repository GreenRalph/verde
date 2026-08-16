// VER-DÉ — expose only the public PayPal client ID to the browser.
module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  var id = process.env.PAYPAL_CLIENT_ID;
  if (!id) return res.status(500).json({ error: 'PayPal client ID is not configured.' });
  return res.status(200).json({ clientId: id });
};
