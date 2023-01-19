'use strict';
const { expect } = require('chai');
const { setupDatabase } = require('../../integration/shared');
const { ObjectId } = require('../../mongodb');

describe('PkFactory', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('should create records with custom PK factory', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;

      // Custom factory (need to provide a 12 byte array);
      var CustomPKFactory = {
        createPk() {
          return new ObjectId('aaaaaaaaaaaa');
        }
      };

      var client = configuration.newClient(
        {
          writeConcern: { w: 1 },
          maxPoolSize: 1
        },
        {
          pkFactory: CustomPKFactory
        }
      );

      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        var collection = db.collection('test_custom_key');

        collection.insert({ a: 1 }, { writeConcern: { w: 1 } }, function (err) {
          expect(err).to.not.exist;
          collection.find({ _id: new ObjectId('aaaaaaaaaaaa') }).toArray(function (err, items) {
            expect(items.length).to.equal(1);

            client.close(done);
          });
        });
      });
    }
  });
});
