'use strict';
const setupDatabase = require('./shared').setupDatabase;
const expect = require('chai').expect;

describe('Array Filter Update Example', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  it('supports using array filters when updating one', {
    metadata: {
      requires: {
        mongodb: '>=3.6.x',
        topology: ['single']
      }
    },

    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        const db = client.db(configuration.db);
        const collection = db.collection('arrayFilterUpdateExample');

        // 3. Exploiting the power of arrays
        collection.updateOne(
          { _id: 1 },
          { $set: { 'a.$[i].b': 2 } },
          { arrayFilters: [{ 'i.b': 0 }] },
          function updated(err, result) {
            expect(err).to.equal(null);
            expect(result).to.exist;
            client.close();
            done();
          }
        );
      });
    }
  });
});
