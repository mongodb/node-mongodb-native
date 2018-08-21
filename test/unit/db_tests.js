'use strict';

const EventEmitter = require('events');
const expect = require('chai').expect;
const sinon = require('sinon');
const ReadPreference = require('mongodb-core').ReadPreference;
class MockTopology extends EventEmitter {
  constructor() {
    super();
  }

  capabilities() {
    return {};
  }
}

const test = {};
describe('Database', function() {
  before(() => {
    // NOTE: These modules are being used prior to test run. In order to monkey-patch them
    //       we must remove their cached versions.
    const resolvedUtils = require.resolve('../../lib/utils');
    const resolvedDb = require.resolve('../../lib/db');
    delete require.cache[resolvedUtils];
    delete require.cache[resolvedDb];
    test.utils = require('../../lib/utils');

    // create a sandbox for stub cleanup
    test.sandbox = sinon.sandbox.create();
  });

  afterEach(() => test.sandbox.restore());

  it('should ignore a readPreference for dropDatabase', {
    metadata: { requires: { topology: 'single' } },
    test: function() {
      sinon.stub(test.utils, 'executeOperation').callsFake((topology, operation, args) => {
        const options = args[args.length - 2];
        expect(options.readPreference.equals(ReadPreference.primary)).to.be.ok;
      });

      const Db = require('../../lib/db');
      const db = new Db('fakeDb', new MockTopology(), { readPreference: 'nearest' });
      db.dropDatabase();
    }
  });
});
