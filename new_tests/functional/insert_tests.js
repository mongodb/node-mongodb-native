/**
 * A simple document insert example, not using safe mode to ensure document persistance on MongoDB
 *
 * @_class collection
 * @_function insert
 * @ignore
 */
exports.shouldCorrectlyPerformASimpleSingleDocumentInsertNoCallbackNoSafe = function(configuration, test) {
  var db = configuration.db();
  // Fetch a collection to insert document into
  var collection = db.collection("simple_document_insert_collection_no_safe");
  // Insert a single document
  collection.insert({hello:'world_no_safe'});

  // Wait for a second before finishing up, to ensure we have written the item to disk
  setTimeout(function() {

    // Fetch the document
    collection.findOne({hello:'world_no_safe'}, function(err, item) {
      test.equal(null, err);
      test.equal('world_no_safe', item.hello);
      test.done();
    })
  }, 100);
}
