/**
 * A very simple example of saving a document to a collection
 * Let's us show a simple example
 * 
 * @example-class Cursor
 * @example-method filter
 * @ignore
 */
exports.shouldCorrectlySaveASimpleDocument = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function() {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    // LINE var MongoClient = require('mongodb').MongoClient;
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.
    db.open(function(err, db) {
    // BEGIN
      var collection = db.collection('shouldCorrectlyExecuteSaveInsertUpdate');

      collection.save({ email : 'save' }, configuration.writeConcernMax(), function() {
        collection.insert({ email : 'insert' }, configuration.writeConcernMax(), function() {
          collection.update(
            { email : 'update' },
            { email : 'update' },
            { upsert: true, w:1},

            function() {
              collection.find().toArray(function(e, a) {
                test.equal(3, a.length)
                db.close();
                test.done();
              });
            }
          );
        });
      });
    });    
    // END
  }
}