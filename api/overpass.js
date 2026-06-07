/**
 * Vercel Serverless Function — Overpass API Proxy
 *
 * Proxies Overpass QL queries server-side so the browser never hits
 * CORS issues, 403s, or 406s.  Tries multiple upstream endpoints
 * with automatic failover.
 */

const ENDPOINTS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

export default async function handler(req, res) {
  // Allow CORS for the Vercel preview / production domains
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Accept the query from either query-string (?data=...) or POST body
  const query =
    req.query?.data ||
    req.body?.data ||
    (typeof req.body === 'string' ? req.body : null);

  if (!query) {
    return res.status(400).json({ error: 'Missing "data" parameter' });
  }

  let lastError = null;

  for (const endpoint of ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!upstream.ok) {
        lastError = `${endpoint} returned ${upstream.status}`;
        console.warn(lastError);
        continue;
      }

      const json = await upstream.json();
      return res.status(200).json(json);
    } catch (err) {
      lastError = `${endpoint}: ${err.message || err}`;
      console.warn('Overpass proxy error:', lastError);
      continue;
    }
  }

  return res
    .status(502)
    .json({ error: 'All Overpass endpoints failed', detail: lastError });
}
