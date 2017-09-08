module.exports = function(o, callback) {
  var MongoClient = require('../../').MongoClient,
    GridFSBucket = require('../../').GridFSBucket,
    f = require('util').format,
    fs = require('fs');

  // Connect to db
  MongoClient.connect('mongodb://localhost:27017/benchmark?maxPoolSize=10', function(e, client) {
    var files = o.files;
    // Files left
    var left = files.length;
    // Open the bucket
    var bucket = new GridFSBucket(client);

    // Read in all the files
    for (var i = 0; i < files.length; i++) {
      var stream = fs.createReadStream(files[i], 'binary');
      // Create an upload stream
      var uploadStream = bucket.openUploadStream(f('files%s.txt', i + o.index));
      // Wait for stream to finish
      uploadStream.once('finish', function() {
        left = left - 1;

        if (left === 0) {
          callback();
        }
      });

      stream.pipe(uploadStream);
    }
  });
};
