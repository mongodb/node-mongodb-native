'use strict';
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;
const { ObjectId } = require('../../src');

describe('Custom PK', function () {
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
      var CustomPKFactory = function () {};
      CustomPKFactory.prototype = new Object();
      CustomPKFactory.createPk = function () {
        return new ObjectId('aaaaaaaaaaaa');
      };

      var client = configuration.newClient(
        {
          w: 1,
          poolSize: 1
        },
        {
          pkFactory: CustomPKFactory
        }
      );

      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        var collection = db.collection('test_custom_key');

        collection.insert({ a: 1 }, { w: 1 }, function (err) {
          test.equal(null, err);
          collection.find({ _id: new ObjectId('aaaaaaaaaaaa') }).toArray(function (err, items) {
            test.equal(1, items.length);

            client.close(done);
          });
        });
      });
    }
  });
});
