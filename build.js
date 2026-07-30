// Runs at Vercel build time. Reads Vercel's built-in VERCEL_ENV
// (production / preview / development) and writes it into a small
// env.js file that the static site can read in the browser.
const fs = require('fs');

// ENVIRONMENT must be set as an env var in the Vercel project settings,
// with value 'dev' or 'prod' (set separately per Production/Preview/
// Development environment in Vercel as needed).
const environment = (process.env.ENVIRONMENT || 'prod').toLowerCase();

// TWM_BASE_URL must be set as an env var in the Vercel project settings
// (Production / Preview / Development can each have their own value).
const twmBaseUrl = process.env.TWM_BASE_URL || 'https://travelwithme-zf9f.onrender.com';

fs.writeFileSync('env.js', `window.ENVIRONMENT = ${JSON.stringify(environment)};\nwindow.TWM_BASE_URL = ${JSON.stringify(twmBaseUrl)};\n`);

console.log(`[build.js] ENVIRONMENT=${environment}, TWM_BASE_URL=${twmBaseUrl}`);
