// Copies the repo-root single sources of truth (../../design-tokens.css and
// ../../shared-layout.css) into app/src/styles/, so tokens.css can @import
// normal in-tree files instead of reaching outside the Vite project root.
// Runs automatically before dev/build via package.json's predev/prebuild —
// never edit the generated files by hand, edit the root files instead.
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const destDir = resolve(__dirname, '..', 'src', 'styles');
mkdirSync(destDir, { recursive: true });

const files = ['design-tokens.css', 'shared-layout.css'];
for (const name of files) {
  const source = resolve(__dirname, '..', '..', name);
  const dest = resolve(destDir, `_${name.replace('.css', '')}.generated.css`);
  copyFileSync(source, dest);
  console.log(`sync-tokens: copied ${source} -> ${dest}`);
}
