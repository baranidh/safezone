// ═══════════════════════════════════════════════════════════════
//  SafeZone — Cloudflare Worker Proxy for AirLabs API
// ═══════════════════════════════════════════════════════════════
//
//  SETUP INSTRUCTIONS:
//  1. Go to https://dash.cloudflare.com → Workers & Pages → Create Worker
//  2. Paste this entire file into the editor
//  3. Go to Settings → Variables → Add:
//       Name: AIRLABS_API_KEY    Value: <your-api-key>
//       (click "Encrypt" to hide it)
//  4. Click "Save and Deploy"
//  5. Your proxy URL will be: https://<worker-name>.<your-subdomain>.workers.dev
//  6. Paste that URL into SafeZone's "Proxy URL" field in the API Keys section
//
//  The worker:
//  - Keeps your API key secret (never sent to the browser)
//  - Adds CORS headers so SafeZone can call it from any origin
//  - Only allows GET requests to the /flights endpoint
//  - Rate-limits by IP (60 requests per minute per IP)
// ═══════════════════════════════════════════════════════════════

const RATE_LIMIT = 60;          // max requests per IP per minute
const RATE_WINDOW = 60 * 1000;  // 1 minute in ms
const ipRequests = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = ipRequests.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW) {
    ipRequests.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT) return true;
  return false;
}

// Clean up stale entries periodically
function cleanupRateLimits() {
  const now = Date.now();
  for (const [ip, entry] of ipRequests) {
    if (now - entry.windowStart > RATE_WINDOW) ipRequests.delete(ip);
  }
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Only allow GET
    if (request.method !== 'GET') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/' || url.pathname === '/health') {
      return jsonResponse({ status: 'ok', service: 'SafeZone AirLabs Proxy' });
    }

    // Only allow /flights endpoint
    if (url.pathname !== '/flights') {
      return jsonResponse({ error: 'Not found. Use /flights?flight_iata=XX123' }, 404);
    }

    // Check API key is configured
    const apiKey = env.AIRLABS_API_KEY;
    if (!apiKey) {
      return jsonResponse({ error: 'API key not configured on worker' }, 500);
    }

    // Rate limit by IP
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    cleanupRateLimits();
    if (isRateLimited(ip)) {
      return jsonResponse({ error: 'Rate limited — try again in a minute' }, 429);
    }

    // Forward allowed params to AirLabs
    const allowedParams = ['flight_iata', 'flight_icao'];
    const airlabsUrl = new URL('https://airlabs.co/api/v9/flights');
    let hasParam = false;
    for (const p of allowedParams) {
      const val = url.searchParams.get(p);
      if (val) {
        airlabsUrl.searchParams.set(p, val);
        hasParam = true;
      }
    }
    if (!hasParam) {
      return jsonResponse({ error: 'Provide flight_iata or flight_icao parameter' }, 400);
    }

    // Append the secret API key
    airlabsUrl.searchParams.set('api_key', apiKey);

    try {
      const resp = await fetch(airlabsUrl.toString(), {
        headers: { 'User-Agent': 'SafeZone-Proxy/1.0' },
      });
      const data = await resp.json();
      return jsonResponse(data, resp.status);
    } catch (e) {
      return jsonResponse({ error: 'Upstream request failed: ' + e.message }, 502);
    }
  },
};
