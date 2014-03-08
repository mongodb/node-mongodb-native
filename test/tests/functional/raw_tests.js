/**
 * @ignore
 */
exports.shouldCorreclyInsertRawDocumentAndRetrieveThemSettingRawAtCollectionLevel = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcern(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('shouldCorreclyInsertRawDocumentAndRetrieveThemSettingRawAtCollectionLevel', {raw:true}, function(err, collection) {
        // Create serialized insert objects
        var id = new ObjectID();
        var inputObjects = [{_id:id}, {a:1}, {b:2}, {c:4}]
        
        // Insert all raw objects
        collection.insert(inputObjects, configuration.writeConcern(), function(err, result) {
          test.equal(null, err);
          
          // Query the document
          collection.find({}, {raw:true}).toArray(function(err, items) {
            var objects = [];
            for(var i = 0; i < items.length; i++) {
              test.ok(Buffer.isBuffer(items[i]));
              objects.push(db.bson.deserialize(items[i]));
            }

            test.equal(id.toHexString(), objects[0]._id.toHexString());
            test.equal(1, objects[1].a);
            test.equal(2, objects[2].b);
            test.equal(4, objects[3].c);
            db.close();
            test.done();
          })
        });      
      });
    });
  }
}