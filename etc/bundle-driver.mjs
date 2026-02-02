#!/usr/bin/env node
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { isBuiltin } from 'node:module';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

await esbuild.build({
    entryPoints: [path.join(rootDir, 'src/index.ts')],
    bundle: true,
    outfile: path.join(rootDir, 'test/tools/runner/driver.bundle.js'),
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
    plugins: [{
        name: 'externalize-node-builtins',
        setup(build) {
            build.onResolve({ filter: /.*/ }, args => {
                if (isBuiltin(args.path)) {
                    return { path: args.path, external: true };
                }
            });
        }
    }],
    sourcemap: 'inline',
    logLevel: 'info'
});

console.log('✓ Driver bundle created at test/tools/runner/driver.bundle.js');