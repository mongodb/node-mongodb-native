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
  entryPoints: [path.join(rootDir, 'test/mongodb_all.ts')],
  bundle: true,
  outfile: outputBundleFile,
  platform: 'browser',
  format: 'cjs',
  target: 'chrome112',
  external: [
    '@aws-sdk/credential-providers',
    '@mongodb-js/saslprep',
    '@mongodb-js/zstd',
    '@napi-rs/snappy*',
    'gcp-metadata',
    'kerberos',
    'mongodb-client-encryption',
    'mongodb-connection-string-url',
    'snappy',
    'socks'
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
