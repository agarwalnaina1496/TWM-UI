// Copies the repo-root single source of truth (../../design-tokens.css) into
// app/src/styles/, so tokens.css can @import a normal in-tree file instead of
// reaching outside the Vite project root. Runs automatically before dev/build
// via package.json's predev/prebuild — never edit the generated file by hand,
// edit ../../design-tokens.css instead.
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = resolve(__dirname, '..', '..', 'design-tokens.css');
const destDir = resolve(__dirname, '..', 'src', 'styles');
const dest = resolve(destDir, '_design-tokens.generated.css');

mkdirSync(destDir, { recursive: true });
copyFileSync(source, dest);
console.log(`sync-tokens: copied ${source} -> ${dest}`);
