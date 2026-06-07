/**
 * Vercel Serverless Function — Overpass API Proxy
 *
 * Proxies Overpass queries server-side to avoid CORS.
 * explicitly sets a custom User-Agent to bypass blocks on the French server
 * (which blocks browser User-Agents with a 403 "white-listed usages only" error).
 */

const ENDPOINTS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

export const config = {
  maxDuration: 15,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let query = req.query?.data;
  if (!query && req.body) {
    if (typeof req.body === 'string') {
      query = req.body;
    } else if (req.body.data) {
      query = req.body.data;
    }
  }

  if (!query) {
    return res.status(400).json({ error: 'Missing "data" parameter' });
  }

  let lastError = null;

  for (const endpoint of ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'RealTimeDrivingSimulator/1.0 (ambient-dashboard-agentic-dev)',
          'Accept': 'application/json'
        },
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
