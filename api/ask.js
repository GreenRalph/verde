module.exports = async (req, res) => {
  const KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      route: '/api/ask',
      keyConfigured: Boolean(KEY)
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!KEY) {
    return res.status(500).json({ error: 'API key is not set' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    if (!body || typeof body !== 'object') { body = {}; }

    const question = String(body.question || body.prompt || '').slice(0, 2000);
    const context = String(body.context || '').slice(0, 4000);

    if (!question) {
      return res.status(400).json({ error: 'No question provided' });
    }

    const system = [
      'You are the assistant for VER-DE, an independent AI film catalog by the filmmaker VER-DE.',
      'Answer questions about the films in the catalog clearly and briefly, in 2 to 4 sentences.',
      'Never invent titles, prices, or festival credits that are not given to you in the context.',
      'If you do not know something, say so plainly and suggest the visitor message the filmmaker.'
    ].join(' ');

    const input = system +
      (context ? '\n\nCatalog context:\n' + context : '') +
      '\n\nVisitor question: ' + question;

    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': KEY
      },
      body: JSON.stringify({
        model: 'gemini-3.6-flash',
        input: input
      })
    });

    const data = await r.json();

    if (!r.ok) {
      const detail = (data && data.error && data.error.message) || 'Unknown Gemini error';
      return res.status(502).json({ error: 'Gemini request failed', detail: detail });
    }

    let text = '';

    if (typeof data.output_text === 'string') {
      text = data.output_text.trim();
    }

    if (!text && Array.isArray(data.steps)) {
      const parts = [];
      data.steps.forEach(function (step) {
        if (step && Array.isArray(step.content)) {
          step.content.forEach(function (item) {
            if (item && typeof item.text === 'string') { parts.push(item.text); }
          });
        }
      });
      text = parts.join('').trim();
    }

    if (!text && data.candidates && data.candidates[0] && data.candidates[0].content) {
      const cparts = data.candidates[0].content.parts;
      if (Array.isArray(cparts)) {
        text = cparts.map(function (p) { return p.text || ''; }).join('').trim();
      }
    }

    if (!text) {
      return res.status(502).json({ error: 'Empty response from Gemini', detail: JSON.stringify(data).slice(0, 500) });
    }

    return res.status(200).json({ answer: text });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', detail: String(err && err.message ? err.message : err) });
  }
};
