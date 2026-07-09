// Runs at Vercel build time. Reads Vercel's built-in VERCEL_ENV
// (production / preview / development) and writes it into a small
// env.js file that the static site can read in the browser.
const fs = require('fs');

const vercelEnv = process.env.VERCEL_ENV || 'development'; // 'production' | 'preview' | 'development'
const isDev = vercelEnv !== 'production';

fs.writeFileSync('env.js', `window.IS_DEV_ENV = ${isDev};\nwindow.VERCEL_ENV = ${JSON.stringify(vercelEnv)};\n`);

console.log(`[build.js] VERCEL_ENV=${vercelEnv} -> IS_DEV_ENV=${isDev}`);
