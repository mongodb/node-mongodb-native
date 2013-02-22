var mongodb = require('../../../../'),
  MongoClient = mongodb.MongoClient,
  format = require('util').format;

// Simple collection
exports['Should correctly insert a document and fetch it back using findOne'] = function(configuration, test) {
  MongoClient.connect(format('mongodb://localhost:27017/%s', configuration.integration_db), function(err, db) {
    var collection = db.collection('simple_test');

    collection.insert({a:1}, function(err, doc) {

      collection.findOne({a:1}, function(err, doc) {
        console.dir(doc)

        db.close();
        test.done();
      });
    });
  });
}