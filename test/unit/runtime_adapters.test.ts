import { expect } from 'chai';
import * as os from 'os';

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
  });
});
