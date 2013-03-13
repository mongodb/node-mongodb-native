/**
 * Example of a simple geoNear query across some documents
 *
 * @_class collection
 * @_function geoNear
 * @ignore
 */
exports.shouldCorrectlyPerformSimpleGeoNearCommand = function(configuration, test) {
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Fetch the collection
    var collection = db.collection("simple_geo_near_command");
      
    // Add a location based index
    collection.ensureIndex({loc:"2d"}, function(err, result) {

      // Save a new location tagged document
      collection.insert([{a:1, loc:[50, 30]}, {a:1, loc:[30, 50]}], {w:1}, function(err, result) {
       
        // Use geoNear command to find document
        collection.geoNear(50, 50, {query:{a:1}, num:1}, function(err, docs) {
          test.equal(1, docs.results.length);
          
          db.close();
          test.done();
        });          
      });
    });      
  });
}

/**
 * Example of a simple geoHaystackSearch query across some documents
 *
 * @_class collection
 * @_function geoHaystackSearch
 * @ignore
 */
exports.shouldCorrectlyPerformSimpleGeoHaystackSearchCommand = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db  
  db.open(function(err, db) {
    
    // Fetch the collection
    var collection = db.collection("simple_geo_haystack_command");
      
    // Add a location based index
    collection.ensureIndex({loc: "geoHaystack", type: 1}, {bucketSize: 1}, function(err, result) {

      // Save a new location tagged document
      collection.insert([{a:1, loc:[50, 30]}, {a:1, loc:[30, 50]}], {w:1}, function(err, result) {
       
        // Use geoNear command to find document
        collection.geoHaystackSearch(50, 50, {search:{a:1}, limit:1, maxDistance:100}, function(err, docs) {
          test.equal(1, docs.results.length);
          
          db.close();
          test.done();
        });          
      });
    });      
  });
  // DOC_END
}