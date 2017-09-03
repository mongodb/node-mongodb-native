module.exports = function(o, callback) {
  var MongoClient = require('../../').MongoClient,
    fs = require('fs');

  // Connect to db
  MongoClient.connect('mongodb://localhost:27017/benchmark?maxPoolSize=10', function(e, client) {
    var files = o.files;
    var index = o.index;
    // Files left
    var left = files.length;
    // Collection
    var collection = client.collection('corpus');
    // Read in all the files
    for (var i = 0; i < files.length; i++) {
      fs.readFile(files[i], 'ascii', function(err, data) {
        // Split the data
        var entries = data.split('\n');
        entries.pop();

        // Insert docs
        collection.insertMany(
          entries.map(function(x) {
            var obj = JSON.parse(x);
            obj._i = index++;
            return obj;
          }),
          { ordered: false },
          function() {
            left = left - 1;

            if (left == 0) {
              callback();
            }
          }
        );
      });
    }
  });
};
