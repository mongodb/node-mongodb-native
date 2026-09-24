import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vm from 'node:vm';

import { expect } from 'chai';
import * as ts from 'typescript';

import { MongoClient, type OsAdapter } from '../../src';

describe('Runtime Adapters tests', function () {
  describe('`os`', function () {
    describe('when no os adapter is provided', function () {
      it(`defaults to Node's os module, resolved asynchronously`, async function () {
        const client = new MongoClient('mongodb://localhost:27017');

        // The runtime is resolved asynchronously because the default adapters are loaded from
        // Node.js built-ins via a dynamic import (NODE-7603).
        const { os: resolved } = await client.options.runtime;
        expect(resolved.platform()).to.equal(os.platform());
        expect(resolved.arch()).to.equal(os.arch());
        expect(resolved.release()).to.equal(os.release());
        expect(resolved.type()).to.equal(os.type());
      });
    });

    describe('when an os adapter is provided', function () {
      it(`uses the user provided adapter`, async function () {
        const osAdapter: OsAdapter = {
          ...os
        };
        const client = new MongoClient('mongodb://localhost:27017', {
          runtimeAdapters: {
            os: osAdapter
          }
        });

        const { os: resolved } = await client.options.runtime;
        expect(resolved).to.equal(osAdapter);
      });
    });

    describe('when dynamic import is unavailable', function () {
      it('uses require when it is available', async function () {
        const source = fs.readFileSync(
          path.resolve(__dirname, '../../src/runtime_adapters.ts'),
          'utf8'
        );
        const { outputText } = ts.transpileModule(source, {
          compilerOptions: {
            module: ts.ModuleKind.Node16,
            target: ts.ScriptTarget.ES2023
          }
        });
        const module = { exports: {} as Record<string, unknown> };
        new vm.Script(
          `(function (exports, require, module) {${outputText}\n})(exports, require, module)`
        ).runInNewContext({
          exports: module.exports,
          require: () => os,
          module
        });
        const resolveRuntimeAdapters = module.exports.resolveRuntimeAdapters as (
          options: Record<string, unknown>
        ) => Promise<{ os: typeof os }>;

        const { os: resolved } = await resolveRuntimeAdapters({});

        expect(resolved.platform()).to.equal(os.platform());
        expect(resolved.arch()).to.equal(os.arch());
      });
    });
  });
});
