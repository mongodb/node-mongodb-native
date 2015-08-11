var core = require('mongodb-core');
var crypto = require('crypto');
var fs = require('fs');
var stream = require('stream');

/**
 * @ignore
 */
exports.shouldUploadFromFileStream = {
  metadata: { requires: { topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridFSBucket = configuration.require.GridFSBucket;

    var db = configuration.newDbInstance(configuration.writeConcernMax(),
      { poolSize:1 });
    db.open(function(err, db) {
      var bucket = new GridFSBucket(db);
      var stream = fs.createReadStream('./LICENSE');

      bucket.on('error', function(error) {
        test.equal(error, null);
        test.ok(false);
      });

      var fileId = bucket.uploadFromStream('test.dat', stream);
      var license = fs.readFileSync('./LICENSE');

      bucket.once('done', function() {
        var chunksQuery = db.collection('fs.chunks').find({ files_id: fileId });
        chunksQuery.toArray(function(error, docs) {
          test.equal(error, null);
          test.equal(docs.length, 1);
          test.equal(docs[0].data.toString('hex'), license.toString('hex'));

          var filesQuery = db.collection('fs.files').find({ _id: fileId });
          filesQuery.toArray(function(error, docs) {
            test.equal(error, null);
            test.equal(docs.length, 1);

            var hash = crypto.createHash('md5');
            hash.update(license);
            test.equal(docs[0].md5, hash.digest('hex'));
            test.done();
          });
        });
      });
    });
  }
};

var UPLOAD_SPEC = require('./specs/gridfs-upload.json');

for (var i = 0; i < UPLOAD_SPEC.tests.length; ++i) {
  var test = UPLOAD_SPEC.tests[i];
  (function(testSpec) {
    exports[testSpec.description] = {
      metadata: { requires: { topology: ['single'] } },

      test: function(configuration, test) {
        var GridFSBucket = configuration.require.GridFSBucket;

        var db = configuration.newDbInstance(configuration.writeConcernMax(),
          { poolSize:1 });
        db.open(function(err, db) {
          db.dropDatabase(function(err) {
            test.equal(err, null);

            var bucket = new GridFSBucket(db, { bucketName: 'expected' });
            var bufStream = new stream();

            bucket.on('error', function(error) {
              test.equal(error, null);
              test.ok(false);
            });

            var result = bucket.uploadFromStream(testSpec.act.arguments.filename,
              bufStream, testSpec.act.arguments.options);
            var buf = new Buffer(testSpec.act.arguments.source.$hex, 'hex');
            bufStream.emit('data', buf);
            bufStream.emit('end');

            bucket.once('done', function() {
              var data = testSpec.assert.data;
              var num = data.length;
              data.forEach(function(data) {
                var collection = data.insert;
                db.collection(collection).find({}).toArray(function(error, docs) {
                  test.equal(data.documents.length, docs.length);

                  for (var i = 0; i < docs.length; ++i) {
                    testResultDoc(test, data.documents[i], docs[i], result);
                  }

                  if (--num === 0) {
                    test.done();
                  }
                });
              });
            });
          });
        });
      }
    };
  })(test);
}

function testResultDoc(test, specDoc, resDoc, result) {
  var specKeys = Object.keys(specDoc);
  var resKeys = Object.keys(resDoc);

  test.ok(specKeys.length === resKeys.length);

  for (var i = 0; i < specKeys.length; ++i) {
    var key = specKeys[i];
    test.equal(specKeys[i], resKeys[i]);
    if (specDoc[key] === '*actual') {
      test.ok(resDoc[key]);
    } else if (specDoc[key] === '*result') {
      test.equal(resDoc[key], result.toString());
    } else if (specDoc[key].$hex) {
      test.ok(resDoc[key] instanceof core.BSON.Binary);
      test.equal(resDoc[key].toString('hex'), specDoc[key].$hex);
    } else {
      if (typeof specDoc[key] === 'object') {
        test.deepEqual(specDoc[key], resDoc[key]);
      } else {
        test.equal(specDoc[key], resDoc[key]);
      }
    }
  }
}
