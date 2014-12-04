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

    var p_client = configuration.newDbInstance({w:0, 'pkFactory':CustomPKFactory}, {poolSize:1});
    p_client.open(function(err, p_client) {

      var collection = p_client.collection('test_custom_key');

      collection.insert({'a':1}, {w:1}, function(err, doc) {
        
        collection.find({'_id':new ObjectID("aaaaaaaaaaaa")}).toArray(function(err, items) {
          test.equal(1, items.length);

          p_client.close();
          test.done();
        });
      });
    });
  }
}