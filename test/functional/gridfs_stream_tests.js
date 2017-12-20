'use strict';

const crypto = require('crypto'),
  ejson = require('mongodb-extended-json'),
  fs = require('fs'),
  test = require('./shared').assert,
  setupDatabase = require('./shared').setupDatabase,
  expect = require('chai').expect;

describe('GridFS Stream', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  /**
   * Correctly stream a file from disk into GridFS using openUploadStream
   *
   * @example-class GridFSBucket
   * @example-method openUploadStream
   * @ignore
   */
  it('shouldUploadFromFileStream', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridFSBucket = configuration.require.GridFSBucket;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        db.dropDatabase(function(error) {
          test.equal(error, null);

          var bucket = new GridFSBucket(db);
          var readStream = fs.createReadStream('./LICENSE');

          var uploadStream = bucket.openUploadStream('test.dat');

          var license = fs.readFileSync('./LICENSE');
          var id = uploadStream.id;

          // Wait for stream to finish
          uploadStream.once('finish', function() {
            var chunksColl = db.collection('fs.chunks');
            var chunksQuery = chunksColl.find({ files_id: id });

            // Get all the chunks
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
                    done();
                  });
                });
              });
            });
          });

          readStream.pipe(uploadStream);
        });
      });
      // END
    }
  });

  /**
   * Correctly stream a file from disk into GridFS using openUploadStream
   *
   * @example-class GridFSBucket
   * @example-method openUploadStreamWithId
   * @ignore
   */
  it('shouldUploadFromFileStreamWithCustomId', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridFSBucket = configuration.require.GridFSBucket;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        db.dropDatabase(function(error) {
          test.equal(error, null);

          var bucket = new GridFSBucket(db);
          var readStream = fs.createReadStream('./LICENSE');

          var uploadStream = bucket.openUploadStreamWithId(1, 'test.dat');

          var license = fs.readFileSync('./LICENSE');
          var id = uploadStream.id;
          test.equal(1, id);

          // Wait for stream to finish
          uploadStream.once('finish', function() {
            var chunksColl = db.collection('fs.chunks');
            var chunksQuery = chunksColl.find({ files_id: id });

            // Get all the chunks
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
                    done();
                  });
                });
              });
            });
          });

          readStream.pipe(uploadStream);
        });
      });
      // END
    }
  });

  /**
   * Correctly upload a file to GridFS and then retrieve it as a stream
   *
   * @example-class GridFSBucket
   * @example-method openDownloadStream
   * @ignore
   */
  it('shouldDownloadToUploadStream', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridFSBucket = configuration.require.GridFSBucket;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
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
                done();
              });
            });
          });
        });

        readStream.pipe(uploadStream);
      });
      // END
    }
  });

  /**
   * Correctly return file not found error
   * @ignore
   */
  it('should fail to locate gridfs stream', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridFSBucket = configuration.require.GridFSBucket,
        ObjectId = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        var bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload' });

        // Get an unknown file
        var downloadStream = bucket.openDownloadStream(new ObjectId());
        downloadStream.on('data', function() {});

        downloadStream.on('error', function(err) {
          test.equal('ENOENT', err.code);

          client.close();
          done();
        });
      });
    }
  });

  /**
   * Correctly download a GridFS file by name
   *
   * @example-class GridFSBucket
   * @example-method openDownloadStreamByName
   * @ignore
   */
  it('openDownloadStreamByName', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridFSBucket = configuration.require.GridFSBucket;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        var bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload' });
        var readStream = fs.createReadStream('./LICENSE');
        var uploadStream = bucket.openUploadStream('test.dat');

        uploadStream.once('finish', function() {
          var downloadStream = bucket.openDownloadStreamByName('test.dat');

          var gotData = false;
          downloadStream.on('data', function(data) {
            test.ok(!gotData);
            gotData = true;
            test.ok(data.toString('utf8').indexOf('TERMS AND CONDITIONS') !== -1);
          });

          downloadStream.on('end', function() {
            test.ok(gotData);
            done();
          });
        });

        readStream.pipe(uploadStream);
      });
      // END
    }
  });

  /**
   * Provide start and end parameters for file download to skip ahead x bytes and limit the total amount of bytes read to n
   *
   * @example-class GridFSBucket
   * @example-method openDownloadStream
   * @ignore
   */
  it('start/end options for openDownloadStream', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridFSBucket = configuration.require.GridFSBucket;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        var bucket = new GridFSBucket(db, {
          bucketName: 'gridfsdownload',
          chunkSizeBytes: 2
        });

        var readStream = fs.createReadStream('./LICENSE');
        var uploadStream = bucket.openUploadStream('teststart.dat');

        uploadStream.once('finish', function() {
          var downloadStream = bucket
            .openDownloadStreamByName('teststart.dat', { start: 1 })
            .end(6);

          downloadStream.on('error', function(error) {
            test.equal(error, null);
          });

          var gotData = 0;
          var str = '';
          downloadStream.on('data', function(data) {
            ++gotData;
            str += data.toString('utf8');
          });

          downloadStream.on('end', function() {
            // Depending on different versions of node, we may get
            // different amounts of 'data' events. node 0.10 gives 2,
            // node >= 0.12 gives 3. Either is correct, but we just
            // care that we got between 1 and 3, and got the right result
            test.ok(gotData >= 1 && gotData <= 3);
            test.equal(str, 'pache');
            done();
          });
        });

        readStream.pipe(uploadStream);
      });
      // END
    }
  });

  /**
   * Deleting a file from GridFS
   *
   * @example-class GridFSBucket
   * @example-method delete
   * @ignore
   */
  it('Deleting a file', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridFSBucket = configuration.require.GridFSBucket;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        var bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload' });
        var CHUNKS_COLL = 'gridfsdownload.chunks';
        var FILES_COLL = 'gridfsdownload.files';
        var readStream = fs.createReadStream('./LICENSE');

        var uploadStream = bucket.openUploadStream('test.dat');
        var id = uploadStream.id;

        uploadStream.once('finish', function() {
          bucket.delete(id, function(err) {
            expect(err).to.not.exist;
            var chunksQuery = db.collection(CHUNKS_COLL).find({ files_id: id });
            chunksQuery.toArray(function(error, docs) {
              test.equal(error, null);
              test.equal(docs.length, 0);

              var filesQuery = db.collection(FILES_COLL).find({ _id: id });
              filesQuery.toArray(function(error, docs) {
                test.equal(error, null);
                test.equal(docs.length, 0);

                done();
              });
            });
          });
        });

        readStream.pipe(uploadStream);
      });
      // END
    }
  });

  /**
   * Aborting an upload
   *
   * @example-class GridFSBucketWriteStream
   * @example-method abort
   * @ignore
   */
  it('Aborting an upload', {
    metadata: { requires: { topology: ['single'], node: '>12.0.0' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridFSBucket = configuration.require.GridFSBucket;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        var bucket = new GridFSBucket(db, { bucketName: 'gridfsabort', chunkSizeBytes: 1 });
        var CHUNKS_COLL = 'gridfsabort.chunks';
        var uploadStream = bucket.openUploadStream('test.dat');

        var id = uploadStream.id;
        var query = { files_id: id };
        uploadStream.write('a', 'utf8', function(error) {
          test.equal(error, null);
          db.collection(CHUNKS_COLL).count(query, function(error, c) {
            test.equal(error, null);
            test.equal(c, 1);
            uploadStream.abort(function(error) {
              test.equal(error, null);
              db.collection(CHUNKS_COLL).count(query, function(error, c) {
                test.equal(error, null);
                test.equal(c, 0);
                uploadStream.write('b', 'utf8', function(error) {
                  test.equal(error.toString(), 'Error: this stream has been aborted');
                  uploadStream.end('c', 'utf8', function(error) {
                    test.equal(error.toString(), 'Error: this stream has been aborted');
                    // Fail if user tries to abort an aborted stream
                    uploadStream.abort().then(null, function(error) {
                      test.equal(error.toString(), 'Error: Cannot call abort() on a stream twice');
                      done();
                    });
                  });
                });
              });
            });
          });
        });
      });
      // END
    }
  });

  /**
   * Aborting an upload
   *
   * @ignore
   */
  it('Destroy an upload', {
    metadata: { requires: { topology: ['single'], node: '>12.0.0' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridFSBucket = configuration.require.GridFSBucket;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        var bucket = new GridFSBucket(db, { bucketName: 'gridfsabort', chunkSizeBytes: 1 });
        var CHUNKS_COLL = 'gridfsabort.chunks';
        var uploadStream = bucket.openUploadStream('test.dat');

        var id = uploadStream.id;
        var query = { files_id: id };
        uploadStream.write('a', 'utf8', function(error) {
          test.equal(error, null);
          db.collection(CHUNKS_COLL).count(query, function(error, c) {
            test.equal(error, null);
            test.equal(c, 1);
            uploadStream.abort(function(error) {
              test.equal(error, null);
              db.collection(CHUNKS_COLL).count(query, function(error, c) {
                test.equal(error, null);
                test.equal(c, 0);
                uploadStream.write('b', 'utf8', function(error) {
                  test.equal(error.toString(), 'Error: this stream has been aborted');
                  uploadStream.end('c', 'utf8', function(error) {
                    test.equal(error.toString(), 'Error: this stream has been aborted');
                    // Fail if user tries to abort an aborted stream
                    uploadStream.abort().then(null, function(error) {
                      test.equal(error.toString(), 'Error: Cannot call abort() on a stream twice');
                      done();
                    });
                  });
                });
              });
            });
          });
        });
      });
      // END
    }
  });

  /**
   * Calling abort() on a GridFSBucketReadStream
   *
   * @example-class GridFSBucketReadStream
   * @example-method abort
   * @ignore
   */
  it('Destroying a download stream', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridFSBucket = configuration.require.GridFSBucket;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        var bucket = new GridFSBucket(db, { bucketName: 'gridfsdestroy', chunkSizeBytes: 10 });
        var readStream = fs.createReadStream('./LICENSE');
        var uploadStream = bucket.openUploadStream('test.dat');

        // Wait for stream to finish
        uploadStream.once('finish', function() {
          var id = uploadStream.id;
          var downloadStream = bucket.openDownloadStream(id);
          var finished = {};
          downloadStream.on('data', function() {
            test.ok(false);
          });

          downloadStream.on('error', function() {
            test.ok(false);
          });

          downloadStream.on('end', function() {
            test.equal(downloadStream.s.cursor, null);
            if (finished.close) {
              return done();
            }
            finished.end = true;
          });

          downloadStream.on('close', function() {
            if (finished.end) {
              return done();
            }
            finished.close = true;
          });

          downloadStream.abort(function(error) {
            test.equal(error, undefined);
          });
        });

        readStream.pipe(uploadStream);
        // END
      });
    }
  });

  /**
   * Deleting a file from GridFS using promises
   *
   * @example-class GridFSBucket
   * @example-method delete
   * @ignore
   */
  it('Deleting a file using promises', {
    metadata: { requires: { topology: ['single'], node: '>12.0.0' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridFSBucket = configuration.require.GridFSBucket;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        var bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload' });
        var CHUNKS_COLL = 'gridfsdownload.chunks';
        var FILES_COLL = 'gridfsdownload.files';
        var readStream = fs.createReadStream('./LICENSE');

        var uploadStream = bucket.openUploadStream('test.dat');
        var id = uploadStream.id;

        uploadStream.once('finish', function() {
          bucket.delete(id).then(function() {
            var chunksQuery = db.collection(CHUNKS_COLL).find({ files_id: id });
            chunksQuery.toArray(function(error, docs) {
              test.equal(error, null);
              test.equal(docs.length, 0);

              var filesQuery = db.collection(FILES_COLL).find({ _id: id });
              filesQuery.toArray(function(error, docs) {
                test.equal(error, null);
                test.equal(docs.length, 0);

                done();
              });
            });
          });
        });

        readStream.pipe(uploadStream);
      });
      // END
    }
  });

  it('find()', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridFSBucket = configuration.require.GridFSBucket;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
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

        done();
      });
      // END
    }
  });

  /**
   * Drop an entire buckets files and chunks
   *
   * @example-class GridFSBucket
   * @example-method drop
   * @ignore
   */
  it('drop example', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridFSBucket = configuration.require.GridFSBucket;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        var bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload' });
        var CHUNKS_COLL = 'gridfsdownload.chunks';
        var FILES_COLL = 'gridfsdownload.files';
        var readStream = fs.createReadStream('./LICENSE');

        var uploadStream = bucket.openUploadStream('test.dat');
        var id = uploadStream.id;

        uploadStream.once('finish', function() {
          bucket.drop(function(err) {
            expect(err).to.not.exist;

            var chunksQuery = db.collection(CHUNKS_COLL).find({ files_id: id });
            chunksQuery.toArray(function(error, docs) {
              test.equal(error, null);
              test.equal(docs.length, 0);

              var filesQuery = db.collection(FILES_COLL).find({ _id: id });
              filesQuery.toArray(function(error, docs) {
                test.equal(error, null);
                test.equal(docs.length, 0);

                done();
              });
            });
          });
        });

        readStream.pipe(uploadStream);
      });
      // END
    }
  });

  /**
   * Drop an entire buckets files and chunks using promises
   *
   * @example-class GridFSBucket
   * @example-method drop
   * @ignore
   */
  it('drop using promises', {
    metadata: { requires: { topology: ['single'], node: '>12.0.0' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridFSBucket = configuration.require.GridFSBucket;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        var bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload' });
        var CHUNKS_COLL = 'gridfsdownload.chunks';
        var FILES_COLL = 'gridfsdownload.files';
        var readStream = fs.createReadStream('./LICENSE');

        var uploadStream = bucket.openUploadStream('test.dat');
        var id = uploadStream.id;

        uploadStream.once('finish', function() {
          bucket.drop().then(function() {
            var chunksQuery = db.collection(CHUNKS_COLL).find({ files_id: id });
            chunksQuery.toArray(function(error, docs) {
              test.equal(error, null);
              test.equal(docs.length, 0);

              var filesQuery = db.collection(FILES_COLL).find({ _id: id });
              filesQuery.toArray(function(error, docs) {
                test.equal(error, null);
                test.equal(docs.length, 0);

                done();
              });
            });
          });
        });

        readStream.pipe(uploadStream);
      });
      // END
    }
  });

  /*
  * Find all associates files with a bucket
  *
  * @example-class GridFSBucket
  * @example-method find
  * @ignore
  */
  it('find example', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridFSBucket = configuration.require.GridFSBucket;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        var bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload_2' });
        var readStream = fs.createReadStream('./LICENSE');

        var uploadStream = bucket.openUploadStream('test.dat');

        uploadStream.once('finish', function() {
          bucket.find({}, { batchSize: 1 }).toArray(function(err, files) {
            test.equal(null, err);
            test.equal(1, files.length);
            done();
          });
        });

        readStream.pipe(uploadStream);
      });
      // END
    }
  });

  /**
   * Rename a file
   *
   * @example-class GridFSBucket
   * @example-method rename
   * @ignore
   */
  it('rename example', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridFSBucket = configuration.require.GridFSBucket;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        var bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload_3' });
        var readStream = fs.createReadStream('./LICENSE');

        var uploadStream = bucket.openUploadStream('test.dat');
        var id = uploadStream.id;

        uploadStream.once('finish', function() {
          // Rename the file
          bucket.rename(id, 'renamed_it.dat', function(err) {
            expect(err).to.not.exist;
            done();
          });
        });

        readStream.pipe(uploadStream);
      });
      // END
    }
  });

  /**
   * @ignore
   */
  it('download empty doc', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridFSBucket = configuration.require.GridFSBucket;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var bucket = new GridFSBucket(db, { bucketName: 'fs' });

        db.collection('fs.files').insert({ length: 0 }, function(error, result) {
          test.equal(error, null);
          test.equal(Object.keys(result.insertedIds).length, 1);
          var id = result.insertedIds[0];

          var stream = bucket.openDownloadStream(id);
          stream.on('error', function(error) {
            test.equal(error, null);
          });

          stream.on('data', function() {
            test.ok(false);
          });

          stream.on('end', function() {
            // As per spec, make sure we didn't actually fire a query
            // because the document length is 0
            test.equal(stream.s.cursor, null);
            done();
          });
        });
      });
    }
  });

  var UPLOAD_SPEC = require('./spec/gridfs/gridfs-upload.json');
  UPLOAD_SPEC.tests.forEach(function(specTest) {
    (function(testSpec) {
      it(testSpec.description, {
        metadata: { requires: { topology: ['single'] } },

        test: function(done) {
          var configuration = this.configuration;
          var GridFSBucket = configuration.require.GridFSBucket;

          var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
          client.connect(function(err, client) {
            var db = client.db(configuration.db);
            db.dropDatabase(function(error) {
              test.equal(error, null);

              var bucket = new GridFSBucket(db, { bucketName: 'expected' });
              var res = bucket.openUploadStream(
                testSpec.act.arguments.filename,
                testSpec.act.arguments.options
              );
              var buf = new Buffer(testSpec.act.arguments.source.$hex, 'hex');

              res.on('error', function(err) {
                test.equal(null, err);
              });

              res.on('finish', function() {
                var data = testSpec.assert.data;
                var num = data.length;
                data.forEach(function(data) {
                  var collection = data.insert;
                  db
                    .collection(collection)
                    .find({})
                    .toArray(function(error, docs) {
                      test.equal(data.documents.length, docs.length);

                      for (var i = 0; i < docs.length; ++i) {
                        testResultDoc(test, data.documents[i], docs[i], res.id);
                      }

                      if (--num === 0) {
                        done();
                      }
                    });
                });
              });

              res.write(buf);
              res.end();
            });
          });
        }
      });
    })(specTest);
  });

  var DOWNLOAD_SPEC = require('./spec/gridfs/gridfs-download.json');
  DOWNLOAD_SPEC.tests.forEach(function(specTest) {
    (function(testSpec) {
      it(testSpec.description, {
        metadata: { requires: { topology: ['single'] } },

        test: function(done) {
          var configuration = this.configuration;
          var GridFSBucket = configuration.require.GridFSBucket;

          var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
          client.connect(function(err, client) {
            var db = client.db(configuration.db);
            db.dropDatabase(function(err) {
              test.equal(err, null);
              var BUCKET_NAME = 'fs';

              var _runTest = function() {
                var bucket = new GridFSBucket(db, { bucketName: BUCKET_NAME });
                var res = new Buffer(0);
                var download = bucket.openDownloadStream(
                  ejson.deserialize(testSpec.act.arguments.id)
                );

                download.on('data', function(chunk) {
                  res = Buffer.concat([res, chunk]);
                });

                download.on('error', function(error) {
                  if (!testSpec.assert.error) {
                    test.ok(false);
                    done();
                  }
                  test.ok(error.toString().indexOf(testSpec.assert.error) !== -1);
                  done();
                });

                download.on('end', function() {
                  var result = testSpec.assert.result;
                  if (!result) {
                    test.ok(false);
                    done();
                  }

                  test.equal(res.toString('hex'), result.$hex);
                  done();
                });
              };

              var keys = Object.keys(DOWNLOAD_SPEC.data);
              var numCollections = Object.keys(DOWNLOAD_SPEC.data).length;
              keys.forEach(function(collection) {
                var data = DOWNLOAD_SPEC.data[collection].map(function(v) {
                  return deflateTestDoc(v);
                });

                db.collection(BUCKET_NAME + '.' + collection).insertMany(data, function(error) {
                  test.equal(error, null);

                  if (--numCollections === 0) {
                    if (testSpec.arrange) {
                      // only support 1 arrange op for now
                      test.equal(testSpec.arrange.data.length, 1);
                      applyArrange(db, deflateTestDoc(testSpec.arrange.data[0]), function(error) {
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
      });
    })(specTest);
  });

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
        test.equal(resDoc[key].toString(), result.toString());
      } else if (specDoc[key].$hex) {
        test.ok(resDoc[key]._bsontype === 'Binary');
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
    var ret = ejson.deserialize(doc);
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

  /**
   * NODE-822 GridFSBucketWriteStream end method does not handle optional parameters
   *
   * @ignore
   */
  it('should correctly handle calling end function with only a callback', {
    metadata: { requires: { topology: ['single'], node: '>4.0.0' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridFSBucket = configuration.require.GridFSBucket;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        var bucket = new GridFSBucket(db, { bucketName: 'gridfsabort', chunkSizeBytes: 1 });
        var CHUNKS_COLL = 'gridfsabort.chunks';
        var uploadStream = bucket.openUploadStream('test.dat');

        var id = uploadStream.id;
        var query = { files_id: id };
        uploadStream.write('a', 'utf8', function(error) {
          test.equal(undefined, error);

          db.collection(CHUNKS_COLL).count(query, function(error, c) {
            test.equal(error, null);
            test.equal(c, 1);

            uploadStream.abort(function(error) {
              test.equal(error, null);

              db.collection(CHUNKS_COLL).count(query, function(error, c) {
                test.equal(error, null);
                test.equal(c, 0);

                uploadStream.write('b', 'utf8', function(error) {
                  test.equal(error.toString(), 'Error: this stream has been aborted');

                  uploadStream.end(function(error) {
                    test.equal(error.toString(), 'Error: this stream has been aborted');

                    // Fail if user tries to abort an aborted stream
                    uploadStream.abort().then(null, function(error) {
                      test.equal(error.toString(), 'Error: Cannot call abort() on a stream twice');
                      done();
                    });
                  });
                });
              });
            });
          });
        });
      });
    }
  });

  /**
   * Provide start and end parameters for file download to skip ahead x bytes and limit the total amount of bytes read to n
   *
   * @example-class GridFSBucket
   * @example-method openDownloadStream
   * @ignore
   */
  it('NODE-829 start/end options for openDownloadStream where start-end is < size of chunk', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridFSBucket = configuration.require.GridFSBucket;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, client) {
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE restartAndDone
        // REMOVE-LINE done();
        // REMOVE-LINE var db = client.db(configuration.db);
        // BEGIN
        var db = client.db(configuration.db);
        var bucket = new GridFSBucket(db, {
          bucketName: 'gridfsdownload',
          chunkSizeBytes: 20
        });

        var readStream = fs.createReadStream('./LICENSE');
        var uploadStream = bucket.openUploadStream('teststart.dat');

        uploadStream.once('finish', function() {
          var downloadStream = bucket
            .openDownloadStreamByName('teststart.dat', { start: 1 })
            .end(6);

          downloadStream.on('error', function(error) {
            test.equal(error, null);
          });

          var gotData = 0;
          var str = '';
          downloadStream.on('data', function(data) {
            ++gotData;
            str += data.toString('utf8');
          });

          downloadStream.on('end', function() {
            // Depending on different versions of node, we may get
            // different amounts of 'data' events. node 0.10 gives 2,
            // node >= 0.12 gives 3. Either is correct, but we just
            // care that we got between 1 and 3, and got the right result
            test.ok(gotData >= 1 && gotData <= 3);
            test.equal(str, 'pache');
            done();
          });
        });

        readStream.pipe(uploadStream);
      });
      // END
    }
  });
});
