// Runs at Vercel build time. Reads Vercel's built-in VERCEL_ENV
// (production / preview / development) and writes it into a small
// env.js file that the static site can read in the browser.
const fs = require('fs');
const { execSync } = require('child_process');

// ENVIRONMENT must be set as an env var in the Vercel project settings,
// with value 'dev' or 'prod' (set separately per Production/Preview/
// Development environment in Vercel as needed).
const environment = (process.env.ENVIRONMENT || 'prod').toLowerCase();

// TWM_BASE_URL must be set as an env var in the Vercel project settings
// (Production / Preview / Development can each have their own value).
const twmBaseUrl = process.env.TWM_BASE_URL || 'https://travelwithme-zf9f.onrender.com';

fs.writeFileSync('env.js', `window.ENVIRONMENT = ${JSON.stringify(environment)};\nwindow.TWM_BASE_URL = ${JSON.stringify(twmBaseUrl)};\n`);

console.log(`[build.js] ENVIRONMENT=${environment}, TWM_BASE_URL=${twmBaseUrl}`);

// Build the product app (app/) as part of the same deployment.
// Its output lands in app/dist and is served at /app via the vercel.json rewrite.
console.log('[build.js] Building product app...');
execSync('npm install && npm run build', { cwd: 'app', stdio: 'inherit' });
console.log('[build.js] Product app build complete.');
