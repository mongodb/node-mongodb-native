module.exports = function(o, callback) {
  var MongoClient = require('../../').MongoClient,
    GridFSBucket = require('../../').GridFSBucket,
    f = require('util').format,
    fs = require('fs');

  // Connect to db
  MongoClient.connect('mongodb://localhost:27017/benchmark?maxPoolSize=10', function(e, client) {
    var bucket = new GridFSBucket(client);
    var left = o.e - o.s;

    // Read all the indexes
    for(var i = o.s; i < o.e; i++) {
      var stream = fs.createWriteStream(f('%s/../../files%s.tmp', __dirname, i), 'binary');
      stream.on('close', function() {
        left = left - 1;

        if(left == 0) {
          callback();
        }
      });

      bucket.openDownloadStreamByName(f('files%s.txt', i)).pipe(stream);
    }
  });
}
