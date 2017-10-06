'use strict';
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;

describe('Decimal128', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  /**
   * @ignore
   */
  it('should correctly insert decimal128 value', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        mongodb: '>=3.3.6',
        topology: ['single']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var Decimal128 = configuration.require.Decimal128;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var object = {
          id: 1,
          value: Decimal128.fromString('1')
        };

        db.collection('decimal128').insertOne(object, function(err) {
          test.equal(null, err);

          db.collection('decimal128').findOne({
            id: 1
          },
          function(err, doc) {
            test.equal(null, err);
            test.ok(doc.value instanceof Decimal128);
            test.equal('1', doc.value.toString());

            client.close();
            done();
          });
        });
      });
    }
  });
});
