/**
 * Vercel Serverless Function: /api/env
 * Serves non-secret runtime env vars as a JS snippet.
 * Load via <script src="/api/env"> BEFORE the main ES module.
 *
 * Env vars set in Vercel Dashboard (never in git):
 *   TURN_USERNAME   — Metered.ca TURN username
 *   TURN_CREDENTIAL — Metered.ca TURN credential
 */
export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const env = {
    TURN_USERNAME: process.env.TURN_USERNAME ?? '',
    TURN_CREDENTIAL: process.env.TURN_CREDENTIAL ?? '',
  };
  res.send(`globalThis.__YESMASTER_ENV__ = ${JSON.stringify(env)};`);
}
