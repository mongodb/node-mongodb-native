import fs from 'node:fs/promises';
import path from 'node:path';

// eslint-disable-next-line no-restricted-globals
const useBundled = process.env.MONGODB_BUNDLED === 'true';

const rootDir = path.join(import.meta.dirname, '..');
const outputBarrelFile = path.join(rootDir, 'test/mongodb.ts');
const source = useBundled ? './mongodb_bundled' : './mongodb_all';

const contents =
  `// This file is auto-generated. Do not edit.\n` +
  `// Run 'npm run build:runtime-barrel' to regenerate.\n` +
  `export const runNodelessTests = ${useBundled};\n` +
  `export * from '${source}';\n`;
await fs.writeFile(outputBarrelFile, contents);

// eslint-disable-next-line no-console
console.log(`✓ ${outputBarrelFile} now re-exports from ${source}`);
