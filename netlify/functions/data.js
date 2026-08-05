// netlify/functions/data.js
// Proxies all Supabase data requests server-side so that browsers
// behind restrictive IT policies (e.g. managed Edge) never need to
// connect directly to Supabase — they only talk to this same-domain endpoint.

const SB_URL   = process.env.SUPABASE_URL;
const SB_KEY   = process.env.SUPABASE_KEY;
const SB_TABLE = process.env.SUPABASE_TABLE || 'walkthroughs';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const sbHeaders = () => ({
  'Content-Type': 'application/json',
  'apikey': SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors, body: '' };
  }

  if (!SB_URL || !SB_KEY) {
    return { statusCode: 500, headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'SUPABASE_URL or SUPABASE_KEY not configured' }) };
  }

  try {
    if (event.httpMethod === 'GET') {
      const qs = event.queryStringParameters || {};
      const params = Object.entries(qs)
        .filter(([k]) => k !== '_')
        .map(([k, v]) => `${k}=${v}`)
        .join('&');
      const url = `${SB_URL}/rest/v1/${SB_TABLE}${params ? '?' + params : ''}`;
      const r = await fetch(url, { headers: sbHeaders() });
      const data = await r.json();
      return {
        statusCode: r.ok ? 200 : r.status,
        headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify(data)
      };
    }

    if (event.httpMethod === 'POST') {
      const body = event.body;
      const r = await fetch(`${SB_URL}/rest/v1/${SB_TABLE}`, {
        method: 'POST',
        headers: { ...sbHeaders(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body
      });
      return {
        statusCode: r.ok || r.status === 201 || r.status === 204 ? 200 : r.status,
        headers: cors,
        body: ''
      };
    }

    if (event.httpMethod === 'DELETE') {
      const id = (event.queryStringParameters || {}).id;
      if (!id) return { statusCode: 400, headers: cors, body: 'Missing id' };
      const r = await fetch(
        `${SB_URL}/rest/v1/${SB_TABLE}?id=eq.${encodeURIComponent(id)}`,
        { method: 'DELETE', headers: sbHeaders() }
      );
      return {
        statusCode: r.ok || r.status === 204 ? 200 : r.status,
        headers: cors,
        body: ''
      };
    }

    return { statusCode: 405, headers: cors, body: 'Method not allowed' };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: String(err) })
    };
  }
};
