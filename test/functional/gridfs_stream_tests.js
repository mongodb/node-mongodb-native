var core = require('mongodb-core');
var crypto = require('crypto');
var ejson = require('mongodb-extended-json');
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
    db.open(function(error, db) {
      test.equal(error, null);

      db.dropDatabase(function(error) {
        test.equal(error, null);

        var bucket = new GridFSBucket(db);
        var readStream = fs.createReadStream('./LICENSE');

        var uploadStream = bucket.openUploadStream('test.dat');

        var license = fs.readFileSync('./LICENSE');
        var id = uploadStream.id;

        uploadStream.once('finish', function() {
          var chunksColl = db.collection('fs.chunks');
          var chunksQuery = chunksColl.find({ files_id: id });
          chunksQuery.toArray(function(error, docs) {
            test.equal(error, null);
            test.equal(docs.length, 1);
            test.equal(docs[0].data.toString('hex'), license.toString('hex'));

            var filesColl = db.collection('fs.files');
            var filesQuery = filesColl.find({ _id: id });
            filesQuery.toArray(function(error, docs) {
              test.equal(error, null);
              test.equal(docs.length, 1);

              var hash = crypto.createHash('md5');
              hash.update(license);
              test.equal(docs[0].md5, hash.digest('hex'));

              // make sure we created indexes
              filesColl.listIndexes().toArray(function(error, indexes) {
                test.equal(error, null);
                test.equal(indexes.length, 2);
                test.equal(indexes[1].name, 'filename_1_uploadDate_1');

                chunksColl.listIndexes().toArray(function(error, indexes) {
                  test.equal(error, null);
                  test.equal(indexes.length, 2);
                  test.equal(indexes[1].name, 'files_id_1_n_1');
                  test.done();
                });
              });
            });
          });
        });

        readStream.pipe(uploadStream);
      });
    });
  }
};

/**
 * @ignore
 */
exports.shouldDownloadToUploadStream = {
  metadata: { requires: { topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridFSBucket = configuration.require.GridFSBucket;

    var db = configuration.newDbInstance(configuration.writeConcernMax(),
      { poolSize:1 });
    db.open(function(error, db) {
      var bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload' });
      var CHUNKS_COLL = 'gridfsdownload.chunks';
      var FILES_COLL = 'gridfsdownload.files';
      var readStream = fs.createReadStream('./LICENSE');

      var uploadStream = bucket.openUploadStream('test.dat');

      var license = fs.readFileSync('./LICENSE');
      var id = uploadStream.id;

      uploadStream.once('finish', function() {
        var downloadStream = bucket.openDownloadStream(id);
        uploadStream = bucket.openUploadStream('test2.dat');
        id = uploadStream.id;

        downloadStream.pipe(uploadStream).once('finish', function() {
          var chunksQuery = db.collection(CHUNKS_COLL).find({ files_id: id });
          chunksQuery.toArray(function(error, docs) {
            test.equal(error, null);
            test.equal(docs.length, 1);
            test.equal(docs[0].data.toString('hex'), license.toString('hex'));

            var filesQuery = db.collection(FILES_COLL).find({ _id: id });
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

      readStream.pipe(uploadStream);
    });
  }
};

/**
 * @ignore
 */
exports['Deleting a file'] = {
  metadata: { requires: { topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridFSBucket = configuration.require.GridFSBucket;

    var db = configuration.newDbInstance(configuration.writeConcernMax(),
      { poolSize:1 });
    db.open(function(error, db) {
      var bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload' });
      var CHUNKS_COLL = 'gridfsdownload.chunks';
      var FILES_COLL = 'gridfsdownload.files';
      var readStream = fs.createReadStream('./LICENSE');

      var uploadStream = bucket.openUploadStream('test.dat');

      var license = fs.readFileSync('./LICENSE');
      var id = uploadStream.id;

      uploadStream.once('finish', function() {
        bucket.delete(id, function(error) {
          test.equal(error, null);

          var chunksQuery = db.collection(CHUNKS_COLL).find({ files_id: id });
          chunksQuery.toArray(function(error, docs) {
            test.equal(error, null);
            test.equal(docs.length, 0);

            var filesQuery = db.collection(FILES_COLL).find({ _id: id });
            filesQuery.toArray(function(error, docs) {
              test.equal(error, null);
              test.equal(docs.length, 0);

              test.done();
            });
          });
        });
      });

      readStream.pipe(uploadStream);
    });
  }
};

/**
 * @ignore
 */
exports['find()'] = {
  metadata: { requires: { topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridFSBucket = configuration.require.GridFSBucket;

    var db = configuration.newDbInstance(configuration.writeConcernMax(),
      { poolSize:1 });
    db.open(function(error, db) {
      var bucket = new GridFSBucket(db, { bucketName: 'fs' });

      // We're only making sure this doesn't throw
      bucket.find({
        batchSize: 1,
        limit: 2,
        maxTimeMS: 3,
        noCursorTimeout: true,
        skip: 4,
        sort: { _id: 1 }
      });

      test.done();
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
        db.open(function(error, db) {
          db.dropDatabase(function(error) {
            test.equal(error, null);

            var bucket = new GridFSBucket(db, { bucketName: 'expected' });
            var bufStream = new stream();

            var res = bucket.openUploadStream(testSpec.act.arguments.filename,
              testSpec.act.arguments.options);
            var buf = new Buffer(testSpec.act.arguments.source.$hex, 'hex');

            res.on('error', function(error) {
              test.ok(false);
            });

            res.on('finish', function() {
              var data = testSpec.assert.data;
              var num = data.length;
              data.forEach(function(data) {
                var collection = data.insert;
                db.collection(collection).find({}).toArray(function(error, docs) {
                  test.equal(data.documents.length, docs.length);

                  for (var i = 0; i < docs.length; ++i) {
                    testResultDoc(test, data.documents[i], docs[i], res.id);
                  }

                  if (--num === 0) {
                    test.done();
                  }
                });
              });
            });

            res.write(buf);
            res.end();
          });
        });
      }
    };
  })(test);
}

var DOWNLOAD_SPEC = require('./specs/gridfs-download.json');

for (var i = 0; i < DOWNLOAD_SPEC.tests.length; ++i) {
  var test = DOWNLOAD_SPEC.tests[i];
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
            var BUCKET_NAME = 'fs';

            var _runTest = function() {
              var bucket = new GridFSBucket(db, { bucketName: BUCKET_NAME });
              var res = new Buffer(0);

              var download = bucket.
                openDownloadStream(ejson.deflate(testSpec.act.arguments.id));

              download.on('data', function(chunk) {
                res = Buffer.concat([res, chunk]);
              });

              download.on('error', function(error) {
                if (!testSpec.assert.error) {
                  test.ok(false);
                  test.done();
                }
                test.ok(error.toString().indexOf(testSpec.assert.error) !== -1);
                test.done();
              });

              download.on('end', function() {
                var result = testSpec.assert.result;
                if (!result) {
                  test.ok(false);
                  test.done();
                }

                test.equal(res.toString('hex'), result.$hex);
                test.done();
              });
            };

            var keys = Object.keys(DOWNLOAD_SPEC.data);
            var numCollections = Object.keys(DOWNLOAD_SPEC.data).length;
            keys.forEach(function(collection) {
              var data =
                DOWNLOAD_SPEC.data[collection].map(function(v) {
                  return deflateTestDoc(v);
                });

              db.collection(BUCKET_NAME + '.' + collection).
                insertMany(data, function(error) {
                  test.equal(error, null);

                  if (--numCollections === 0) {
                    if (testSpec.arrange) {
                      // only support 1 arrange op for now
                      test.equal(testSpec.arrange.data.length, 1);
                      applyArrange(db, deflateTestDoc(testSpec.arrange.data[0]),
                        function(error) {
                          test.equal(error, null);
                          _runTest();
                        });
                    } else {
                      _runTest();
                    }
                  }
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

function deflateTestDoc(doc) {
  var ret = ejson.deflate(doc);
  convert$hexToBuffer(ret);
  return ret;
}

function convert$hexToBuffer(doc) {
  var keys = Object.keys(doc);
  keys.forEach(function(key) {
    if (doc[key] && typeof doc[key] === 'object') {
      if (doc[key].$hex != null) {
        doc[key] = new Buffer(doc[key].$hex, 'hex');
      } else {
        convert$hexToBuffer(doc[key]);
      }
    }
  });
}

function applyArrange(db, command, callback) {
  // Don't count on commands being there since we need to test on 2.2 and 2.4
  if (command.delete) {
    if (command.deletes.length !== 1) {
      return callback(new Error('can only arrange with 1 delete'));
    }
    if (command.deletes[0].limit !== 1) {
      return callback(new Error('can only arrange with delete limit 1'));
    }
    db.collection(command.delete).deleteOne(command.deletes[0].q, callback);
  } else if (command.insert) {
    db.collection(command.insert).insertMany(command.documents, callback);
  } else if (command.update) {
    var bulk = [];
    for (var i = 0; i < command.updates.length; ++i) {
      bulk.push({
        updateOne: {
          filter: command.updates[i].q,
          update: command.updates[i].u
        }
      });
    }

    db.collection(command.update).bulkWrite(bulk, callback);
  } else {
    var msg = 'Command not recognized: ' + require('util').inspect(command);
    callback(new Error(msg));
  }
}
