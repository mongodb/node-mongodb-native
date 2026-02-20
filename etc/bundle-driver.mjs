#!/usr/bin/env node
import fs from 'node:fs/promises';
import { isBuiltin } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const outdir = path.join(rootDir, 'test/tools/runner/bundle/');
await fs.rm(outdir, { recursive: true, force: true });

const outputBundleFile = path.join(outdir, 'driver-bundle.js');
await esbuild.build({
  entryPoints: [path.join(rootDir, 'test/mongodb.ts')],
  bundle: true,
  outfile: outputBundleFile,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: [
    'bson',
    'mongodb-connection-string-url',
    '@mongodb-js/saslprep',
    '@mongodb-js/zstd',
    'mongodb-client-encryption',
    'snappy',
    '@napi-rs/snappy*',
    'kerberos',
    'gcp-metadata',
    '@aws-sdk/credential-providers'
  ],
  plugins: [
    {
      name: 'externalize-node-builtins',
      setup(build) {
        build.onResolve({ filter: /.*/ }, args => {
          if (isBuiltin(args.path)) {
            return { path: args.path, external: true };
          }
        });
      }
    }
  ],
  sourcemap: 'inline',
  logLevel: 'info'
});

// eslint-disable-next-line no-console
console.log(`✓ Driver bundle created at ${outputBundleFile}`);
