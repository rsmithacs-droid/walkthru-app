// netlify/functions/claude.js
// Netlify Function — proxies requests to the Anthropic API.
// The API key lives only here, as a server-side environment variable,
// and is never sent to the browser. Works on Netlify's free tier.
//
// Accepts either:
//   { prompt: "..." }                                  → text only (feedback drafting, trend summaries)
//   { prompt: "...", images: [{media_type, data}] }    → text plus photographed notes to transcribe
// Images arrive already shrunk by the browser; see scanNotes() in index.html.

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 1500000;        // per image, after base64 decoding
const ALLOWED_MEDIA = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let prompt, images, maxTokens;
  try {
    ({ prompt, images, maxTokens } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }
  if (!prompt || typeof prompt !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing "prompt" in request body' }) };
  }

  // Validate any attached images before they reach the API.
  const imgs = Array.isArray(images) ? images : [];
  if (imgs.length > MAX_IMAGES) {
    return { statusCode: 400, body: JSON.stringify({ error: `Too many images. Please attach at most ${MAX_IMAGES} photos.` }) };
  }
  for (const img of imgs) {
    if (!img || typeof img.data !== 'string' || !ALLOWED_MEDIA.includes(img.media_type)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Each image needs a base64 "data" string and a media_type of JPEG, PNG, WebP or GIF.' }) };
    }
    // base64 inflates by ~4/3, so this is the approximate decoded size
    if (img.data.length * 0.75 > MAX_IMAGE_BYTES) {
      return { statusCode: 400, body: JSON.stringify({ error: 'One of the photos is too large. Please retake it or use a smaller image.' }) };
    }
  }

  // Images first, then the instruction — Anthropic recommends this order for
  // image-plus-question requests, and transcription accuracy is better for it.
  const content = [
    ...imgs.map(img => ({
      type: 'image',
      source: { type: 'base64', media_type: img.media_type, data: img.data }
    })),
    { type: 'text', text: prompt }
  ];

  const tokens = Math.min(Math.max(Number(maxTokens) || 1000, 256), 4000);

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY, // set in Netlify site settings
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: tokens,
        messages: [{ role: 'user', content }]
      })
    });

    if (!r.ok) {
      const errText = await r.text();
      return { statusCode: r.status, body: JSON.stringify({ error: errText }) };
    }

    const data = await r.json();
    const text = (data.content || [])
      .filter(b => b && b.type === 'text')
      .map(b => b.text)
      .join('');
    return {
      statusCode: 200,
      body: JSON.stringify({ text })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};
