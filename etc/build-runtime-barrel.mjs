import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// eslint-disable-next-line no-restricted-globals
const useBundled = process.env.MONGODB_BUNDLED === 'true';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const outputBarrelFile = path.join(rootDir, 'test/mongodb_runtime-testing.ts');
const source = useBundled ? './mongodb_bundled' : './mongodb';

const contents =
  `// This file is auto-generated. Do not edit.\n` +
  `// Run 'npm run build:runtime-barrel' to regenerate.\n` +
  `export const runNodelessTests = ${useBundled};\n` +
  `export * from '${source}';\n`;
await fs.writeFile(outputBarrelFile, contents);

// eslint-disable-next-line no-console
console.log(`✓ ${outputBarrelFile} now re-exports from ${source}`);
