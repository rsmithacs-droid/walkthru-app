// netlify/functions/claude.js
// Netlify Function — proxies requests to the Anthropic API.
// The API key lives only here, as a server-side environment variable,
// and is never sent to the browser. Works on Netlify's free tier.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let prompt;
  try {
    ({ prompt } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }
  if (!prompt || typeof prompt !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing "prompt" in request body' }) };
  }

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
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!r.ok) {
      const errText = await r.text();
      return { statusCode: r.status, body: JSON.stringify({ error: errText }) };
    }

    const data = await r.json();
    return {
      statusCode: 200,
      body: JSON.stringify({ text: data.content?.[0]?.text || '' })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};
