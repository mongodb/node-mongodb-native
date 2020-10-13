'use strict';

const withClient = require('./shared').withClient;
const setupDatabase = require('./shared').setupDatabase;
const expect = require('chai').expect;
const TopologyType = require('../../lib/sdam/common').TopologyType;

describe('Sharding (Connection)', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('Should use sharded topology', {
    metadata: { requires: { topology: 'sharded' } },
    test: function () {
      const client = this.configuration.newClient({});
      return withClient(client, (client, done) => {
        expect(client).to.exist;
        expect(client).nested.property('topology.description.type').to.equal(TopologyType.Sharded);
        return done();
      })();
    }
  });
});
