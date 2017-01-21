module.exports = function(o, callback) {
  var MongoClient = require('../../').MongoClient,
    f = require('util').format,
    fs = require('fs');

  // Connect to db
  MongoClient.connect('mongodb://localhost:27017/benchmark?maxPoolSize=10', function(e, client) {
    var indexes = [o.s, o.e];
    // Collection
    var collection = client.collection('corpus');
    // Calculate the skip and limit
    var skip = indexes[0] * 5000;
    var end = indexes[1] * 5000;
    var limit = (indexes[1] - indexes[0]) * 5000;
    var docs = [];
    var index = indexes[0];
    var left = indexes[1] - indexes[0];
    var totalDocs = 0;

    // console.dir({$gte: {_i: skip}, $lte: {_i: end}})
    // Perform the query
    collection.find({_i : {$gte: skip, $lte: end}}).each(function(err, doc) {
      if(doc == null) return callback();
      docs.push(doc);
      totalDocs++;

      // Do we have 5000 docs
      if(docs.length === 5000) {
        var docsString = docs.map(function(x) {
          return JSON.stringify(x);
        }).join('\n');
        docs = [];

        // Write the file
        fs.writeFile(f('%s/../../files%s.tmp', __dirname, index++), docsString, function(e, r) {
          left = left - 1;

          if(left == 0) {
            callback();
          }
        });
      }
    });
  });
}
