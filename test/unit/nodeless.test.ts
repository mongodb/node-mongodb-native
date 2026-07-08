import * as fs from 'node:fs';
import * as path from 'node:path';

import { expect } from 'chai';
import { env } from 'process';

import { runNodelessTests } from '../mongodb';
import {
  ALLOWED_SANDBOX_DYNAMIC_IMPORTS,
  loadContextifiedMongoDBModule,
  sandbox
} from '../tools/runner/vm_context_helper';

describe('Nodeless tests', function () {
  it('runNodelessTests variable should match env vars', function () {
    const nodelessEnv = env.MONGODB_BUNDLED;
    const expectedNodeless = nodelessEnv === 'true';
    const actualNodeless = runNodelessTests;
    expect(actualNodeless).to.equal(
      expectedNodeless,
      `runNodelessTests (${actualNodeless}) does not match MONGODB_BUNDLED env var (${nodelessEnv})` +
        " run 'npm run build:runtime-barrel' to update the barrel file"
    );
  });

  it('sandbox should not have node-specific properties', function () {
    if (!runNodelessTests) this.skip();
    expect(typeof (sandbox as any).process).to.equal('undefined');
    expect(typeof (sandbox as any).Buffer).to.equal('undefined');
  });

  // The sandbox's restricted `require` blocks Node built-ins, but its vm script must route
  // dynamic `import()` through the main context's loader, which resolves ANY specifier (a
  // per-specifier gating callback would need --experimental-vm-modules; see
  // vm_context_helper.ts). These tests enforce the contract statically instead: every dynamic
  // import in the built bundle must be on the allowlist, so a future `import('fs')` sneaking
  // into driver source fails here rather than silently bypassing the sandbox (NODE-7603).
  describe('sandbox dynamic import allowlist', function () {
    it('the driver bundle only dynamically imports allowlisted specifiers', function () {
      const bundlePath = path.join(__dirname, '..', 'tools', 'runner', 'bundle/driver-bundle.js');
      const bundleCode = fs.readFileSync(bundlePath, 'utf8');

      const specifiers = new Set<string>();
      for (const match of bundleCode.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) {
        specifiers.add(match[2]);
      }

      // The allowlist audit only works if every dynamic import uses a literal specifier —
      // `import(someVariable)` cannot be audited and is a violation by itself.
      const nonLiteralDynamicImports = [...bundleCode.matchAll(/\bimport\s*\(\s*(?!['"])[^)]/g)]
        .length;
      expect(nonLiteralDynamicImports, 'dynamic imports must use literal specifiers').to.equal(0);

      // Prove the audit sees the bundle's real content: the os fallback must be present.
      expect([...specifiers], 'expected the runtime-adapter os fallback in the bundle').to.include(
        'os'
      );
      const violations = [...specifiers].filter(s => !ALLOWED_SANDBOX_DYNAMIC_IMPORTS.has(s));
      expect(violations, 'dynamic imports outside the sandbox allowlist').to.deep.equal([]);
    });

    it("resolves the driver's os fallback inside the sandbox", async function () {
      // End-to-end through the real bundle in the real sandbox: constructing a client kicks off
      // runtime-adapter resolution, whose `await import('os')` resolves via the sandbox script's
      // dynamic-import loader.
      const mongodb = loadContextifiedMongoDBModule();
      const client = new mongodb.MongoClient('mongodb://localhost:27017');
      const runtime = await client.options.runtime;
      expect(runtime.os.platform).to.be.a('function');
    });
  });
});
