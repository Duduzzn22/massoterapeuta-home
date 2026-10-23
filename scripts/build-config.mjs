// Overwrites config.js from Vercel env vars at build time.
// Runs as the Vercel buildCommand (see vercel.json).
// Local dev: skip this script; the committed config.js already has
// prod defaults so the site works out of the box.
import { writeFileSync } from 'node:fs';

const DEFAULTS = {
  SUPABASE_URL: 'https://nmjssxbneqepqonvcvoe.supabase.co',
  BUSINESS_SLUG: 'massoterapia-spa',
  WHATSAPP_NUMBER: '5519993297780',
};

const config = {
  SUPABASE_URL: process.env.SUPABASE_URL || DEFAULTS.SUPABASE_URL,
  BUSINESS_SLUG: process.env.BUSINESS_SLUG || DEFAULTS.BUSINESS_SLUG,
  WHATSAPP_NUMBER: process.env.WHATSAPP_NUMBER || DEFAULTS.WHATSAPP_NUMBER,
};
config.FUNCTIONS_BASE = `${config.SUPABASE_URL}/functions/v1`;

const content = `// Generated at build time by scripts/build-config.mjs. Do not edit.
window.__APP_CONFIG__ = Object.freeze(${JSON.stringify(config, null, 2)});
`;

writeFileSync('config.js', content);
const usedEnv = Object.keys(DEFAULTS).filter(k => process.env[k]);
console.log(
  usedEnv.length
    ? `[build-config] wrote config.js with env overrides: ${usedEnv.join(', ')}`
    : '[build-config] wrote config.js from defaults (no env vars set)'
);
