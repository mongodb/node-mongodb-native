'use strict';
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;

describe('Custom PK', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  /**
   * @ignore
   */
  it('should create records with custom PK factory', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ObjectID = configuration.require.ObjectID;

      // Custom factory (need to provide a 12 byte array);
      var CustomPKFactory = function() {};
      CustomPKFactory.prototype = new Object();
      CustomPKFactory.createPk = function() {
        return new ObjectID('aaaaaaaaaaaa');
      };

      var client = configuration.newClient({
        w: 1,
        poolSize: 1,
        pkFactory: CustomPKFactory
      });

      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var collection = db.collection('test_custom_key');

        collection.insert({ a: 1 }, { w: 1 }, function(err) {
          test.equal(null, err);
          collection.find({ _id: new ObjectID('aaaaaaaaaaaa') }).toArray(function(err, items) {
            test.equal(1, items.length);

            client.close();
            done();
          });
        });
      });
    }
  });
});
