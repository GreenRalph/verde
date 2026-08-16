// VER-DÉ — Gemini companion (Vercel serverless function, CommonJS)
// Key lives in Vercel env vars, never in the page.
// Vercel: Project → Settings → Environment Variables → GEMINI_KEY

const CATALOG = `
VER-DÉ is the direct-to-audience film catalog of Ralph Anthony Sales (Green Ralph),
a filmmaker, recording artist and KNF farmer in Nabua, Camarines Sur, Philippines.
The films are made on a diversified integrated farm rebuilt after Typhoon Kristine.
Founding access is P399 / $7, one payment, lifetime — limited to the first 100 supporters.
After the first 100, access moves to P599 / $15. Founding supporters keep everything at no
further cost, including every film added later. There is no subscription and no renewal.
For scale: founding access costs less than one month of a streaming subscription, paid once.

THE CATALOG:

1. BAGSAK (2026, Tagalog/English, full cut 16:9) — FREE TO WATCH ON THE SITE.
Thirty-nine years of being told what I am. This is year forty. One report card. Four
voices. No reply. Built around a childhood report card and four family voices judging
a man across his life.

2. SENTENSYADOR (2026, 2:03, Tagalog/English) — FREE TO WATCH ON THE SITE.
A man is sentenced by everyone who knows him. He does not argue. He shrugs, and walks.
Official Film Entry, SINE AI x CapCut.

3. PROJECT 39: REBUILD (2026, Tagalog/English) — FOUNDING ACCESS ONLY.
A Filipino man loses everything — his restaurant, his farm's promise — mocked by his
father, his relatives, his community. He returns to the only thing that still asks
nothing of him: the land. GAIC 2026 Top 10 Finalist.

4. THE STORM ANSWERS (2026, English) — FOUNDING ACCESS ONLY.
A farmer loses everything to the storm and screams at God. The storm answers back in
questions. Hybrid documentary using real Typhoon Kristine footage shot by Michelle Ramirez.

5. MARAMING KAMAY (2026, Tagalog/English) — FOUNDING ACCESS ONLY.
You will not inherit this land. You will only borrow it. Like me. Built from the family
archive — the hands that worked the ground before his.

6. THE WILDERNESS (2026, Tagalog/English) — FOUNDING ACCESS ONLY.
Project 39, Chapter II. The guardian that walks beside a child through the dry years.
AIMV 2026 Excellent Finalist (16:9 original). Also exists as a 9:16 vertical cut.

7. PROOF OF PRESENCE (2026, English) — FOUNDING ACCESS ONLY.
Evidence that someone was here, and kept working, when nobody was watching.

8. PROJECT 39 (ongoing vertical series, Episode 28 onward) — FOUNDING ACCESS ONLY.
What happens to a man after everything he built goes quiet. The land becomes the
metaphor. Logged daily, without a break.

9. PROJECT 39: FOUR MOVEMENTS (2026, 6:59, vertical) — FOUNDING ACCESS ONLY.
The fall, purgatory, the farm, the restaurant. Four songs standing in for four
movements — the first telling of the whole arc, made before any of it had a name or a
framework. The origin material for everything else in the catalog.

Original score by Green Ralph, including the track "Wasak Pero Buhay" (Broken But Alive).

HOW TO PAY:
PayPal or card, billed at $7. Or Philippine QR payment of P399 via BDO InstaPay, GCash,
Maya, or any Philippine bank app. Payment is verified manually: after paying, the visitor
clicks the star circle at the bottom right of the page and submits their name and payment
reference number. Access is not issued automatically.
`;

const SYSTEM = `You are the companion for VER-DÉ, a film catalog site.

RULES:
- Answer only about these films, the filmmaker, Bicol farming context, or the themes in the work.
- If asked anything unrelated, say briefly that you can only talk about the VER-DÉ catalog.
- For films marked FOUNDING ACCESS ONLY: describe theme, tone and what the film is reaching
  for, but never describe the ending or reveal how it resolves. Give enough that someone can
  decide whether they want to watch it.
- Never invent films, awards, festivals, runtimes or details that are not in the catalog below.
  If you do not know, say so plainly.
- Keep answers to 2-4 sentences. Plain, direct, unsentimental. No marketing language,
  no exclamation marks, no emoji.
- Never promise refunds or discounts. On payment, state only: P399 / $7 for the first 100
  founding supporters, one payment, lifetime; P599 / $15 after that. Never claim how many
  places remain — you do not know.
- For payment problems or anything needing a person, tell the visitor to message Green Ralph.
- Reply in the language the visitor used.

CATALOG:
${CATALOG}`;

function readBody(req) {
  return new Promise(function (resolve) {
    if (req.body) {
      try {
        resolve(typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
        return;
      } catch (e) { resolve({}); return; }
    }
    var raw = '';
    req.on('data', function (c) { raw += c; });
    req.on('end', function () {
      try { resolve(JSON.parse(raw || '{}')); } catch (e) { resolve({}); }
    });
    req.on('error', function () { resolve({}); });
  });
}

function extractText(data) {
  if (!data) return '';

  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  if (Array.isArray(data.steps)) {
    var parts = [];
    data.steps.forEach(function (step) {
      if (step && Array.isArray(step.content)) {
        step.content.forEach(function (item) {
          if (item && typeof item.text === 'string') { parts.push(item.text); }
        });
      }
    });
    if (parts.join('').trim()) return parts.join('').trim();
  }

  if (data.candidates && data.candidates[0] && data.candidates[0].content) {
    var cparts = data.candidates[0].content.parts;
    if (Array.isArray(cparts)) {
      var joined = cparts.map(function (p) { return p.text || ''; }).join('').trim();
      if (joined) return joined;
    }
  }

  return '';
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  var key = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;

  // Health check — open /api/ask in a browser to confirm the route deployed.
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      route: '/api/ask',
      keyConfigured: Boolean(key)
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!key) {
    return res.status(500).json({ error: 'Server is missing its API key.' });
  }

  var body = await readBody(req);
  var question = (body && body.question ? String(body.question) : '').trim();
  if (!question) return res.status(400).json({ error: 'No question provided.' });
  if (question.length > 500) question = question.slice(0, 500);

  var MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash'];
  var lastDetail = '';

  for (var i = 0; i < MODELS.length; i++) {
    try {
      var r = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/interactions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key
          },
          body: JSON.stringify({
            model: MODELS[i],
            input: SYSTEM + '\n\nVISITOR QUESTION: ' + question
          })
        }
      );

      if (!r.ok) {
        lastDetail = await r.text();
        console.error('Gemini error', MODELS[i], r.status, lastDetail);
        continue;
      }

      var data = await r.json();
      var answer = extractText(data);

      if (answer) return res.status(200).json({ answer: answer });
      lastDetail = 'empty response';
    } catch (err) {
      lastDetail = String(err && err.message ? err.message : err);
      console.error('Fetch failed', MODELS[i], lastDetail);
    }
  }

  return res.status(502).json({
    error: 'The companion is unavailable right now.',
    detail: String(lastDetail).slice(0, 400)
  });
};
