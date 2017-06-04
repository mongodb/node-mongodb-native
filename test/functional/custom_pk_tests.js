"use strict";

/**
 * @ignore
 */
exports.shouldCreateRecordsWithCustomPKFactory = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID;

    // Custom factory (need to provide a 12 byte array);
    var CustomPKFactory = function() {}
    CustomPKFactory.prototype = new Object();
    CustomPKFactory.createPk = function() {
      return new ObjectID("aaaaaaaaaaaa");
    }

    var client = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, 'pkFactory':CustomPKFactory});
    client.connect(function(err, client) {
      var db = client.db(configuration.database);

      var collection = db.collection('test_custom_key');

      collection.insert({'a':1}, {w:1}, function(err, doc) {
        
        collection.find({'_id':new ObjectID("aaaaaaaaaaaa")}).toArray(function(err, items) {
          test.equal(1, items.length);

          client.close();
          test.done();
        });
      });
    });
  }
}