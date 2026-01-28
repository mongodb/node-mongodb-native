import { expect } from 'chai';
import * as os from 'os';

import { MongoClient, type OsAdapter } from '../../src';

describe('Runtime Adapters tests', function () {
  describe('`os`', function () {
    describe('when no os adapter is provided', function () {
      it(`defaults to Node's os module`, function () {
        const client = new MongoClient('mongodb://localhost:27017');

        expect(client.options.runtime.os).to.equal(os);
      });
    });

    describe('when an os adapter is provided', function () {
      it(`uses the user provided adapter`, function () {
        const osAdapter: OsAdapter = {
          ...os
        };
        const client = new MongoClient('mongodb://localhost:27017', {
          runtimeAdapters: {
            os: osAdapter
          }
        });

        expect(client.options.runtime.os).to.equal(osAdapter);
      });
    });
  });
});
