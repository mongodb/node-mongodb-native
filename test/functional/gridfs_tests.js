'use strict';

const test = require('./shared').assert,
  setupDatabase = require('./shared').setupDatabase,
  fs = require('fs'),
  format = require('util').format,
  child_process = require('child_process'),
  expect = require('chai').expect,
  Buffer = require('safe-buffer').Buffer;

describe('GridFS', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  /**
   * @ignore
   */
  it('shouldCreateNewGridStoreObject', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var id = new ObjectID(),
          filename = 'test_create_gridstore';

        var gs = new GridStore(db, id, filename, 'w');
        test.ok(gs instanceof GridStore);
        test.equal(id, gs.fileId);
        test.equal(filename, gs.filename);

        gs = GridStore(db, id, filename, 'w');
        test.ok(gs instanceof GridStore);
        test.equal(id, gs.fileId);
        test.equal(filename, gs.filename);
        client.close();
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCreateNewGridStoreObjectWithIntId', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        var id = 123,
          filename = 'test_create_gridstore';

        var gs = new GridStore(db, id, filename, 'w');
        test.ok(gs instanceof GridStore);
        test.equal(id, gs.fileId);
        test.equal(filename, gs.filename);

        gs = GridStore(db, id, filename, 'w');
        test.ok(gs instanceof GridStore);
        test.equal(id, gs.fileId);
        test.equal(filename, gs.filename);

        client.close();
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCreateNewGridStoreObjectWithStringId', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var id = 'test',
          filename = 'test_create_gridstore';

        var gs = new GridStore(db, id, filename, 'w');
        test.ok(gs instanceof GridStore);
        test.equal(id, gs.fileId);
        test.equal(filename, gs.filename);

        gs = GridStore(db, id, filename, 'w');
        test.ok(gs instanceof GridStore);
        test.equal(id, gs.fileId);
        test.equal(filename, gs.filename);

        client.close();
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlySafeFileAndReadFileByObjectId', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, null, 'w');
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          gridStore.write('hello world!', function(err, gridStore) {
            expect(err).to.not.exist;
            gridStore.close(function(err, result) {
              expect(err).to.not.exist;
              // Let's read the file using object Id
              GridStore.read(db, result._id, function(err, data) {
                expect(err).to.not.exist;
                test.equal('hello world!', data.toString());
                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyExecuteGridStoreExists', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, 'foobar', 'w');
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          gridStore.write('hello world!', function(err, gridStore) {
            expect(err).to.not.exist;
            gridStore.close(function(err) {
              expect(err).to.not.exist;
              GridStore.exist(db, 'foobar', function(err, result) {
                expect(err).to.not.exist;
                test.equal(true, result);
              });

              GridStore.exist(db, 'does_not_exist', function(err, result) {
                expect(err).to.not.exist;
                test.equal(false, result);
              });

              GridStore.exist(db, 'foobar', 'another_root', function(err, result) {
                expect(err).to.not.exist;
                test.equal(false, result);
                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyPerformGridStoreReadLength', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, 'test_gs_read_length', 'w');
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          gridStore.write('hello world!', function(err, gridStore) {
            expect(err).to.not.exist;
            gridStore.close(function(err) {
              expect(err).to.not.exist;

              // Assert that we have overwriten the data
              GridStore.read(db, 'test_gs_read_length', 5, function(err, data) {
                expect(err).to.not.exist;
                test.equal('hello', data.toString());
                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyReadFromFileWithOffset', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, 'test_gs_read_with_offset', 'w');
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          gridStore.write('hello, world!', function(err, gridStore) {
            expect(err).to.not.exist;
            gridStore.close(function(err) {
              expect(err).to.not.exist;

              // Assert that we have overwriten the data
              GridStore.read(db, 'test_gs_read_with_offset', 5, 7, function(err, data) {
                expect(err).to.not.exist;
                test.equal('world', data.toString());
              });

              GridStore.read(db, 'test_gs_read_with_offset', null, 7, function(err, data) {
                expect(err).to.not.exist;
                test.equal('world!', data.toString());
                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyHandleMultipleChunkGridStore', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        test.equal(null, err);

        var gridStore = new GridStore(db, 'test_gs_multi_chunk', 'w');
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          test.equal(null, err);

          gridStore.chunkCollection().deleteMany({}, function(err) {
            expect(err).to.not.exist;
            gridStore.chunkSize = 512;
            var file1 = '';
            var file2 = '';
            var file3 = '';

            var i;
            for (i = 0; i < gridStore.chunkSize; i++) {
              file1 = file1 + 'x';
            }
            for (i = 0; i < gridStore.chunkSize; i++) {
              file2 = file2 + 'y';
            }
            for (i = 0; i < gridStore.chunkSize; i++) {
              file3 = file3 + 'z';
            }

            gridStore.write(file1, function(err, gridStore) {
              expect(err).to.not.exist;

              gridStore.write(file2, function(err, gridStore) {
                expect(err).to.not.exist;

                gridStore.write(file3, function(err, gridStore) {
                  expect(err).to.not.exist;

                  gridStore.close(function(err) {
                    expect(err).to.not.exist;

                    db.collection('fs.chunks', function(err, collection) {
                      expect(err).to.not.exist;

                      collection.count(function(err, count) {
                        expect(err).to.not.exist;
                        test.equal(3, count);

                        GridStore.read(db, 'test_gs_multi_chunk', function(err, data) {
                          expect(err).to.not.exist;
                          test.equal(512 * 3, data.length);
                          client.close();

                          done();
                        });
                      });
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
   * @ignore
   */
  it('shouldCorrectlyHandleUnlinkingWeirdName', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);

        var gridStore = new GridStore(db, '9476700.937375426_1271170118964-clipped.png', 'w', {
          root: 'articles'
        });
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          db.collection('articles.files').deleteMany({}, function() {
            db.collection('articles.chunks').deleteMany({}, function() {
              gridStore.write('hello, world!', function(err, gridStore) {
                expect(err).to.not.exist;
                gridStore.close(function(err) {
                  expect(err).to.not.exist;
                  db.collection('articles.files', function(err, collection) {
                    expect(err).to.not.exist;
                    collection.count(function(err, count) {
                      expect(err).to.not.exist;
                      test.equal(1, count);
                    });
                  });

                  db.collection('articles.chunks', function(err, collection) {
                    expect(err).to.not.exist;
                    collection.count(function(err, count) {
                      expect(err).to.not.exist;
                      test.equal(1, count);

                      // Unlink the file
                      GridStore.unlink(
                        db,
                        '9476700.937375426_1271170118964-clipped.png',
                        { root: 'articles' },
                        function(err) {
                          expect(err).to.not.exist;
                          db.collection('articles.files', function(err, collection) {
                            expect(err).to.not.exist;
                            collection.count(function(err, count) {
                              expect(err).to.not.exist;
                              test.equal(0, count);
                            });
                          });

                          db.collection('articles.chunks', function(err, collection) {
                            expect(err).to.not.exist;
                            collection.count(function(err, count) {
                              expect(err).to.not.exist;
                              test.equal(0, count);

                              client.close();
                              done();
                            });
                          });
                        }
                      );
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
   * @ignore
   */
  it('shouldCorrectlyUnlinkAnArrayOfFiles', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);

        var gridStore = new GridStore(db, 'test_gs_unlink_as_array', 'w');
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          db.collection('fs.files').deleteMany({}, function() {
            db.collection('fs.chunks').deleteMany({}, function() {
              gridStore.write('hello, world!', function(err, gridStore) {
                expect(err).to.not.exist;
                gridStore.close(function(err) {
                  expect(err).to.not.exist;
                  db.collection('fs.files', function(err, collection) {
                    expect(err).to.not.exist;
                    collection.count(function(err, count) {
                      expect(err).to.not.exist;
                      test.equal(1, count);
                    });
                  });

                  db.collection('fs.chunks', function(err, collection) {
                    expect(err).to.not.exist;
                    collection.count(function(err, count) {
                      expect(err).to.not.exist;
                      test.equal(1, count);

                      // Unlink the file
                      GridStore.unlink(db, ['test_gs_unlink_as_array'], function(err) {
                        expect(err).to.not.exist;
                        db.collection('fs.files', function(err, collection) {
                          expect(err).to.not.exist;
                          collection.count(function(err, count) {
                            expect(err).to.not.exist;
                            test.equal(0, count);

                            db.collection('fs.chunks', function(err, collection) {
                              expect(err).to.not.exist;
                              collection.count(function(err, count) {
                                expect(err).to.not.exist;
                                test.equal(0, count);
                                client.close();

                                done();
                              });
                            });
                          });
                        });
                      });
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
   * @ignore
   */
  it('shouldCorrectlyWriteFileToGridStore', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, 'test_gs_writing_file', 'w');
        var fileSize = fs.statSync('./test/functional/data/test_gs_weird_bug.png').size;
        var data = fs.readFileSync('./test/functional/data/test_gs_weird_bug.png');

        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          gridStore.writeFile('./test/functional/data/test_gs_weird_bug.png', function(err) {
            expect(err).to.not.exist;
            GridStore.read(db, 'test_gs_writing_file', function(err, fileData) {
              expect(err).to.not.exist;
              test.equal(data.toString('base64'), fileData.toString('base64'));
              test.equal(fileSize, fileData.length);

              // Ensure we have a md5
              var gridStore2 = new GridStore(db, 'test_gs_writing_file', 'r');
              gridStore2.open(function(err, gridStore2) {
                expect(err).to.not.exist;
                test.ok(gridStore2.md5 != null);
                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyWriteFileToGridStoreUsingObjectId', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, null, 'w');
        var fileSize = fs.statSync('./test/functional/data/test_gs_weird_bug.png').size;
        var data = fs.readFileSync('./test/functional/data/test_gs_weird_bug.png');

        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          gridStore.writeFile('./test/functional/data/test_gs_weird_bug.png', function(err, doc) {
            expect(err).to.not.exist;
            GridStore.read(db, doc.fileId, function(err, fileData) {
              expect(err).to.not.exist;
              test.equal(data.toString('base64'), fileData.toString('base64'));
              test.equal(fileSize, fileData.length);

              // Ensure we have a md5
              var gridStore2 = new GridStore(db, doc.fileId, 'r');
              gridStore2.open(function(err, gridStore2) {
                expect(err).to.not.exist;
                test.ok(gridStore2.md5 != null);
                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyPerformWorkingFiledRead', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, 'test_gs_working_field_read', 'w');
        var data = fs.readFileSync(
          './test/functional/data/test_gs_working_field_read.pdf',
          'binary'
        );

        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          gridStore.write(data, function(err, gridStore) {
            expect(err).to.not.exist;
            gridStore.close(function(err) {
              expect(err).to.not.exist;
              // Assert that we have overwriten the data
              GridStore.read(db, 'test_gs_working_field_read', function(err, fileData) {
                expect(err).to.not.exist;
                test.equal(data.length, fileData.length);
                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyPerformWorkingFiledReadWithChunkSizeLessThanFileSize', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        // Create a new file
        var gridStore = new GridStore(db, 'test.txt', 'w');

        // This shouldnt have to be set higher than the file...
        gridStore.chunkSize = 40960;

        // Open the file
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          var file = fs.createReadStream('./test/functional/data/test_gs_working_field_read.pdf');

          // Write the binary file data to GridFS
          file.on('data', function(chunk) {
            gridStore.write(chunk, function(err) {
              expect(err).to.not.exist;
            });
          });

          file.on('close', function() {
            // Flush the remaining data to GridFS
            gridStore.close(function(err, result) {
              expect(err).to.not.exist;
              // Read in the whole file and check that it's the same content
              GridStore.read(db, result._id, function(err, fileData) {
                expect(err).to.not.exist;
                var data = fs.readFileSync('./test/functional/data/test_gs_working_field_read.pdf');
                test.equal(data.toString('base64'), fileData.toString('base64'));
                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyPerformWorkingFiledWithBigFile', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] },
      mongodb: '>=2.6.0',
      ignore: { travis: true }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        // Prepare fake big file
        var data = fs.readFileSync(
          './test/functional/data/test_gs_working_field_read.pdf',
          'binary'
        );

        // Write the data multiple times
        var fd = fs.openSync('./test_gs_working_field_read.tmp', 'w');
        // Write the data 10 times to create a big file
        for (var i = 0; i < 10; i++) {
          fs.writeSync(fd, data);
        }
        // Close the file
        fs.close(fd);

        // Create a new file
        var gridStore = new GridStore(db, null, 'w');

        // This shouldnt have to be set higher than the file...
        gridStore.chunkSize = 80960;

        // Open the file
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          var file = fs.createReadStream('./test_gs_working_field_read.tmp');

          // Write the binary file data to GridFS
          file.on('data', function(chunk) {
            gridStore.write(chunk, function(err) {
              expect(err).to.not.exist;
            });
          });

          file.on('close', function() {
            // Flush the remaining data to GridFS
            gridStore.close(function(err, result) {
              expect(err).to.not.exist;

              // Read in the whole file and check that it's the same content
              GridStore.read(db, result._id, function(err, fileData) {
                expect(err).to.not.exist;
                var data = fs.readFileSync('./test_gs_working_field_read.tmp');
                test.deepEqual(data, fileData);
                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyPerformWorkingFiledWriteWithDifferentChunkSizes', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        // Prepare fake big file
        var data = fs.readFileSync(
          './test/functional/data/test_gs_working_field_read.pdf',
          'binary'
        );

        // Write the data multiple times
        var fd = fs.openSync('./test_gs_working_field_read.tmp', 'w');
        // Write the data 10 times to create a big file
        for (var i = 0; i < 10; i++) {
          fs.writeSync(fd, data);
        }
        // Close the file
        fs.close(fd);
        // File Size
        var fileSize = fs.statSync('./test_gs_working_field_read.tmp').size;

        var executeTest = function(_chunkSize, _test, callback) {
          // Create a new file
          var gridStore = new GridStore(db, null, 'w');

          // This shouldnt have to be set higher than the file...
          gridStore.chunkSize = _chunkSize;

          // Open the file
          gridStore.open(function(err, gridStore) {
            expect(err).to.not.exist;
            var file = fs.createReadStream('./test_gs_working_field_read.tmp');

            // Write the binary file data to GridFS
            file.on('data', function(chunk) {
              gridStore.write(chunk, function(err) {
                expect(err).to.not.exist;
              });
            });

            file.on('end', function() {
              // Flush the remaining data to GridFS
              gridStore.close(function(err, result) {
                expect(err).to.not.exist;
                test.ok(result != null);

                // Read in the whole file and check that it's the same content
                GridStore.read(db, result._id, function(err, fileData) {
                  expect(err).to.not.exist;
                  var data = fs.readFileSync('./test_gs_working_field_read.tmp');
                  test.deepEqual(data, fileData);
                  callback(null, null);
                });
              });
            });
          });
        };

        // Execute big chunk size
        executeTest(80960, test, function(err) {
          expect(err).to.not.exist;
          // Execute small chunk size
          executeTest(5000, test, function(err) {
            expect(err).to.not.exist;
            // Execute chunksize larger than file
            executeTest(fileSize + 100, test, function(err) {
              expect(err).to.not.exist;
              client.close();
              done();
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyReadAndWriteFile', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, 'test_gs_weird_bug', 'w');
        var data = fs.readFileSync('./test/functional/data/test_gs_weird_bug.png', 'binary');

        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          gridStore.write(data, function(err, gridStore) {
            expect(err).to.not.exist;
            gridStore.close(function(err) {
              expect(err).to.not.exist;

              // Assert that we have overwriten the data
              GridStore.read(db, 'test_gs_weird_bug', function(err, fileData) {
                expect(err).to.not.exist;
                test.equal(data.length, fileData.length);
                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyReadAndWriteBuffersMultipleChunks', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, null, 'w');
        // Force multiple chunks to be stored
        gridStore.chunkSize = 5000;
        var data = fs.readFileSync('./test/functional/data/test_gs_weird_bug.png');

        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;

          // Write the file using write
          gridStore.write(data, function(err) {
            expect(err).to.not.exist;

            gridStore.close(function(err, doc) {
              expect(err).to.not.exist;

              // Read the file using readBuffer
              new GridStore(db, doc._id, 'r').open(function(err, gridStore) {
                expect(err).to.not.exist;

                gridStore.read(function(err, data2) {
                  expect(err).to.not.exist;
                  test.equal(data.toString('base64'), data2.toString('base64'));
                  client.close();
                  done();
                });
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyReadAndWriteBuffersSingleChunks', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, null, 'w');
        // Force multiple chunks to be stored
        var data = fs.readFileSync('./test/functional/data/test_gs_weird_bug.png');

        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;

          // Write the file using writeBuffer
          gridStore.write(data, function(err) {
            expect(err).to.not.exist;

            gridStore.close(function(err, doc) {
              expect(err).to.not.exist;

              // Read the file using readBuffer
              new GridStore(db, doc._id, 'r').open(function(err, gridStore) {
                expect(err).to.not.exist;

                gridStore.read(function(err, data2) {
                  expect(err).to.not.exist;
                  test.equal(data.toString('base64'), data2.toString('base64'));
                  client.close();
                  done();
                });
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyReadAndWriteBuffersUsingNormalWriteWithMultipleChunks', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, null, 'w');
        // Force multiple chunks to be stored
        gridStore.chunkSize = 5000;
        var data = fs.readFileSync('./test/functional/data/test_gs_weird_bug.png');

        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;

          // Write the buffer using the .write method that should use writeBuffer correctly
          gridStore.write(data, function(err) {
            expect(err).to.not.exist;

            gridStore.close(function(err, doc) {
              expect(err).to.not.exist;

              // Read the file using readBuffer
              new GridStore(db, doc._id, 'r').open(function(err, gridStore) {
                expect(err).to.not.exist;

                gridStore.read(function(err, data2) {
                  expect(err).to.not.exist;
                  test.equal(data.toString('base64'), data2.toString('base64'));
                  client.close();
                  done();
                });
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyReadAndWriteBuffersSingleChunksAndVerifyExistance', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, null, 'w');
        // Force multiple chunks to be stored
        var data = fs.readFileSync('./test/functional/data/test_gs_weird_bug.png');

        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;

          // Write the file using writeBuffer
          gridStore.write(data, function(err) {
            expect(err).to.not.exist;

            gridStore.close(function(err, doc) {
              expect(err).to.not.exist;
              // Read the file using readBuffer
              GridStore.exist(db, doc._id, function(err, result) {
                expect(err).to.not.exist;
                test.equal(true, result);

                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlySaveDataByObjectID', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        var id = new ObjectID();
        var gridStore = new GridStore(db, id, 'w');

        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;

          gridStore.write('bar', function(err, gridStore) {
            expect(err).to.not.exist;

            gridStore.close(function(err) {
              expect(err).to.not.exist;

              GridStore.exist(db, id, function(err, result) {
                expect(err).to.not.exist;
                test.equal(true, result);

                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCheckExistsByUsingRegexp', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, 'shouldCheckExistsByUsingRegexp.txt', 'w');

        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;

          gridStore.write('bar', function(err, gridStore) {
            expect(err).to.not.exist;

            gridStore.close(function(err) {
              expect(err).to.not.exist;

              GridStore.exist(db, /shouldCheck/, function(err, result) {
                expect(err).to.not.exist;
                test.equal(true, result);

                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyOpenGridStoreWithDifferentRoot', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;
      var asset = { source: new ObjectID() };

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        var store = new GridStore(db, new ObjectID(asset.source.toString()), 'w', {
          root: 'store'
        });

        store.open(function(err) {
          expect(err).to.not.exist;

          client.close();
          done();
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlySetFilenameForGridstoreOpen', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        var id = new ObjectID();
        var gridStore = new GridStore(db, id, 'test_gs_read_length', 'w');
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;

          gridStore.write('hello world!', function(err, gridStore) {
            expect(err).to.not.exist;

            gridStore.close(function(err) {
              expect(err).to.not.exist;

              // Open the gridstore
              gridStore = new GridStore(db, id, 'r');
              gridStore.open(function(err, gridStore) {
                expect(err).to.not.exist;
                test.equal('test_gs_read_length', gridStore.filename);
                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlySaveFileAndThenOpenChangeContentTypeAndSaveAgain', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        var id = new ObjectID();
        var gridStore = new GridStore(db, id, 'test_gs_read_length', 'w', {
          content_type: 'image/jpeg'
        });

        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;

          gridStore.write('hello world!', function(err, gridStore) {
            expect(err).to.not.exist;

            gridStore.close(function(err) {
              expect(err).to.not.exist;

              // Open the gridstore
              new GridStore(db, id, 'w+').open(function(err, gridStore) {
                expect(err).to.not.exist;
                gridStore.contentType = 'html/text';
                gridStore.close(function(err) {
                  expect(err).to.not.exist;

                  new GridStore(db, id, 'r').open(function(err, gridStore) {
                    expect(err).to.not.exist;
                    test.equal('html/text', gridStore.contentType);

                    gridStore.read(function(err, data) {
                      expect(err).to.not.exist;
                      test.equal('hello world!', data.toString('utf8'));
                      client.close();
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
   * @ignore
   */
  it('shouldCorrectlySaveFileWithoutFilenameAndThenOpenAddFilenameAndSaveAgain', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        var id = new ObjectID();
        var gridStore = new GridStore(db, id, 'w', { content_type: 'image/jpeg' });
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;

          gridStore.write('hello world!', function(err, gridStore) {
            expect(err).to.not.exist;

            gridStore.close(function(err) {
              expect(err).to.not.exist;

              // Open the gridstore
              new GridStore(db, id, 'test_gs_filename', 'w').open(function(err, gridStore) {
                expect(err).to.not.exist;

                gridStore.contentType = 'html/text';
                gridStore.write('<h1>hello world!</h1>', function(err, gridStore) {
                  expect(err).to.not.exist;

                  gridStore.close(function(err) {
                    expect(err).to.not.exist;

                    new GridStore(db, id, 'r').open(function(err, gridStore) {
                      expect(err).to.not.exist;
                      test.equal('test_gs_filename', gridStore.filename);

                      gridStore.read(function(err, data) {
                        expect(err).to.not.exist;
                        test.equal('<h1>hello world!</h1>', data.toString('utf8'));
                        client.close();
                        done();
                      });
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
   * @ignore
   */
  it('shouldCorrectlySaveFileAndThenOpenChangeFilenameAndSaveAgain', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        var id = new ObjectID();
        var gridStore = new GridStore(db, id, 'test_gs_filename3', 'w', {
          content_type: 'image/jpeg'
        });

        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;

          gridStore.write('hello world!', function(err, gridStore) {
            expect(err).to.not.exist;

            gridStore.close(function(err) {
              expect(err).to.not.exist;

              // Open the gridstore
              new GridStore(db, id, 'test_gs_filename4', 'w').open(function(err, gridStore) {
                expect(err).to.not.exist;
                gridStore.contentType = 'html/text';
                gridStore.write('<h1>hello world!</h1>', function(err, gridStore) {
                  expect(err).to.not.exist;

                  gridStore.close(function(err) {
                    expect(err).to.not.exist;

                    new GridStore(db, id, 'r').open(function(err, gridStore) {
                      expect(err).to.not.exist;
                      test.equal('test_gs_filename4', gridStore.filename);

                      gridStore.read(function(err, data) {
                        expect(err).to.not.exist;
                        test.equal('<h1>hello world!</h1>', data.toString('utf8'));
                        client.close();
                        done();
                      });
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
   * @ignore
   */
  it('shouldCorrectlySaveFileAndThenAppendChangeFilenameAndSaveAgain', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        var id = new ObjectID();
        var gridStore = new GridStore(db, id, 'test_gs_filename1', 'w', {
          content_type: 'image/jpeg'
        });

        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;

          gridStore.write('hello world!', function(err, gridStore) {
            expect(err).to.not.exist;

            gridStore.close(function(err) {
              expect(err).to.not.exist;

              // Open the gridstore
              new GridStore(db, id, 'test_gs_filename2', 'w+').open(function(err, gridStore) {
                expect(err).to.not.exist;
                gridStore.contentType = 'html/text';
                gridStore.close(function(err) {
                  expect(err).to.not.exist;

                  new GridStore(db, id, 'r').open(function(err, gridStore) {
                    expect(err).to.not.exist;
                    test.equal('test_gs_filename2', gridStore.filename);

                    gridStore.read(function(err, data) {
                      expect(err).to.not.exist;
                      test.equal('hello world!', data.toString('utf8'));
                      client.close();
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
   * @ignore
   */
  it('shouldCorrectlyHandleSeekWithStream', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        var id = new ObjectID();
        var gridStore = new GridStore(db, id, 'test_gs_read_length', 'w', {
          content_type: 'image/jpeg'
        });

        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;

          gridStore.write('hello world!', function(err, gridStore) {
            expect(err).to.not.exist;

            gridStore.close(function(err) {
              expect(err).to.not.exist;

              // Open the gridstore
              new GridStore(db, id, 'r').open(function(err, gridStore) {
                expect(err).to.not.exist;

                gridStore.seek(2, function(err) {
                  expect(err).to.not.exist;

                  var stream = gridStore.stream(true);

                  stream.on('data', function(chunk) {
                    test.equal('llo world!', chunk.toString());
                  });

                  stream.on('end', function() {
                    client.close();
                    done();
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
   * @ignore
   */
  it('shouldCorrectlyHandleSeekIntoSecondChunkWithStream', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        var id = new ObjectID();
        var gridStore = new GridStore(db, id, 'test_gs_read_length', 'w', {
          content_type: 'image/jpeg',
          chunk_size: 5
        });

        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;

          gridStore.write('hello world!', function(err, gridStore) {
            expect(err).to.not.exist;

            gridStore.close(function(err) {
              expect(err).to.not.exist;

              // Open the gridstore
              new GridStore(db, id, 'r').open(function(err, gridStore) {
                expect(err).to.not.exist;

                gridStore.seek(7, function(err) {
                  expect(err).to.not.exist;

                  var stream = gridStore.stream(true);
                  var data = '';

                  stream.on('data', function(chunk) {
                    data = data + chunk.toString();
                  });

                  stream.on('end', function() {
                    test.equal('orld!', data);
                    client.close();
                    done();
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
   * @ignore
   */
  it('Should correctly handle multiple seeks', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, 'test_gs_seek_with_buffer', 'w');
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;

          gridStore.write(Buffer.from('012345678901234567890', 'utf8'), function(err, gridStore) {
            expect(err).to.not.exist;

            gridStore.close(function() {
              var gridStore2 = new GridStore(db, 'test_gs_seek_with_buffer', 'r');
              gridStore2.open(function(err, gridStore2) {
                expect(err).to.not.exist;

                gridStore2.read(5, function(err, data) {
                  expect(err).to.not.exist;
                  test.equal('01234', data.toString());

                  gridStore2.seek(-2, GridStore.IO_SEEK_CUR, function(err, gridStore2) {
                    expect(err).to.not.exist;

                    gridStore2.read(5, function(err, data) {
                      expect(err).to.not.exist;
                      test.equal('34567', data.toString());

                      gridStore2.seek(-2, GridStore.IO_SEEK_CUR, function(err, gridStore2) {
                        expect(err).to.not.exist;

                        gridStore2.read(5, function(err, data) {
                          expect(err).to.not.exist;
                          test.equal('67890', data.toString());
                          client.close();
                          done();
                        });
                      });
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
   * @ignore
   */
  it('Should correctly handle multiple seeks over several chunks', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, 'test_gs_seek_with_buffer', 'w', { chunk_size: 4 });
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;

          gridStore.write(Buffer.from('012345678901234567890', 'utf8'), function(err, gridStore) {
            expect(err).to.not.exist;

            gridStore.close(function() {
              var gridStore2 = new GridStore(db, 'test_gs_seek_with_buffer', 'r');
              gridStore2.open(function(err, gridStore2) {
                expect(err).to.not.exist;

                gridStore2.read(5, function(err, data) {
                  expect(err).to.not.exist;
                  test.equal('01234', data.toString());

                  gridStore2.seek(-2, GridStore.IO_SEEK_CUR, function(err, gridStore2) {
                    expect(err).to.not.exist;
                    gridStore2.read(5, function(err, data) {
                      expect(err).to.not.exist;
                      test.equal('34567', data.toString());

                      gridStore2.seek(-2, GridStore.IO_SEEK_CUR, function(err, gridStore2) {
                        expect(err).to.not.exist;

                        gridStore2.read(5, function(err, data) {
                          expect(err).to.not.exist;
                          test.equal('67890', data.toString());
                          client.close();
                          done();
                        });
                      });
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
   * @ignore
   */
  it('shouldWriteFileWithMongofilesAndReadWithNodeJS', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);

        // Execute function
        var exec_function = format(
          'mongofiles --host localhost --port 27017 --db %s put %s',
          configuration.db,
          __dirname + '/data/iya_logo_final_bw.jpg'
        );
        var exec = child_process.exec;
        // Read the data to compare
        var originalData = fs.readFileSync(__dirname + '/data/iya_logo_final_bw.jpg');
        // Upload using the mongofiles
        exec(exec_function, function(error, stdout) {
          test.ok(stdout.match(/added file/) !== -1);

          GridStore.list(db, function(err) {
            test.equal(null, err);

            // Load the file using MongoDB
            var gridStore = new GridStore(db, __dirname + '/data/iya_logo_final_bw.jpg', 'r', {});
            gridStore.open(function(err, gridStore) {
              expect(err).to.not.exist;

              gridStore.read(function(err, data) {
                expect(err).to.not.exist;
                test.deepEqual(originalData, data);
                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should fail when attempting to append to a file', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        test.equal(null, err);
        var chunkSize = 256 * 1024; // Standard 256KB chunks
        // Our file ID
        var fileId = new ObjectID();

        // Open a new file
        var gridStore = new GridStore(db, fileId, 'w', {
          chunkSize: chunkSize,
          root: 'chunkCheck'
        });

        // Open the new file
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;

          // Create a chunkSize Buffer
          var buffer = Buffer.alloc(chunkSize);

          // Write the buffer
          gridStore.write(buffer, function(err, gridStore) {
            expect(err).to.not.exist;

            // Close the file
            gridStore.close(function(err) {
              test.equal(null, err);

              // Open the same file, this time for appending data
              // No need to specify chunkSize...
              gridStore = new GridStore(db, fileId, 'w+', { root: 'chunkCheck' });

              // Open the file again
              gridStore.open(function(err, gridStore) {
                expect(err).to.not.exist;

                // Write the buffer again
                gridStore.write(buffer, function(err) {
                  test.ok(err != null);

                  client.close();
                  done();
                });
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyStreamReadFromGridStoreObject', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        // Set up gridStore
        var gridStore = new GridStore(db, 'test_stream_write_2', 'w');
        gridStore.writeFile('./test/functional/data/test_gs_working_field_read.pdf', function(err) {
          test.equal(null, err);

          // Open a readable gridStore
          gridStore = new GridStore(db, 'test_stream_write_2', 'r');

          // Create a file write stream
          var fileStream = fs.createWriteStream('./test_stream_write_2.tmp');
          fileStream.on('close', function() {
            // Read the temp file and compare
            var compareData = fs.readFileSync('./test_stream_write_2.tmp');
            var originalData = fs.readFileSync(
              './test/functional/data/test_gs_working_field_read.pdf'
            );
            test.deepEqual(originalData, compareData);
            client.close();
            done();
          });

          // Pipe out the data
          gridStore.stream().pipe(fileStream);
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyStreamReadFromGridStoreObjectNoGridStoreOpenCalled', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },
    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        // Set up gridStore
        var gridStore = new GridStore(db, 'test_stream_write_2', 'w');
        gridStore.writeFile('./test/functional/data/test_gs_working_field_read.pdf', function(err) {
          test.equal(null, err);
          // Open a readable gridStore
          gridStore = new GridStore(db, 'test_stream_write_2', 'r');
          var gotData = false;

          // Pipe out the data
          var stream = gridStore.stream();
          stream.on('data', function() {
            gotData = true;
          });

          stream.on('end', function() {
            test.ok(gotData);

            client.close();
            done();
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyStreamWriteFromGridStoreObject', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        var filename = 'test_stream_write_2';
        var filepath = './test/functional/data/test_gs_working_field_read.pdf';
        // Set up streams
        var fileStream = fs.createReadStream(filepath);
        var storeStream = new GridStore(db, filename, 'w').stream();

        // Finish up once the file has been all read
        storeStream.on('end', function() {
          // Just read the content and compare to the raw binary
          GridStore.read(db, filename, function(err, gridData) {
            expect(err).to.not.exist;
            var fileData = fs.readFileSync(filepath);
            test.equal(fileData.toString('hex'), gridData.toString('hex'));
            client.close();
            done();
          });
        });

        // Pipe it through to the gridStore
        fileStream.pipe(storeStream);
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyWriteLargeFileStringAndReadBack', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        var fileId = new ObjectID();
        var gridStore = new GridStore(db, fileId, 'w', { root: 'fs' });
        gridStore.chunkSize = 5000;

        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;

          var d = '';
          for (var j = 0; j < 5000; j++) {
            d = d + '+';
          }

          // Write 3 chunks
          var completed = 3;
          for (var i = 0; i < 3; i++) {
            gridStore.write(d, false, function() {
              completed = completed - 1;

              if (completed === 0) {
                gridStore.close(function(err) {
                  test.equal(null, err);

                  var endLen = 0;
                  var gridStore = new GridStore(db, fileId, 'r');
                  gridStore.open(function(err, gridStore) {
                    expect(err).to.not.exist;
                    var stream = gridStore.stream();

                    stream.on('data', function(chunk) {
                      endLen += chunk.length;
                      // Test length of chunk
                      test.equal(5000, chunk.length);
                      // Check each chunk's data
                      for (var i = 0; i < 5000; i++) test.equal('+', String.fromCharCode(chunk[i]));
                    });

                    stream.on('end', function() {
                      test.equal(15000, endLen);
                      client.close();
                      done();
                    });
                  });
                });
              }
            });
          }
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyWriteLargeFileBufferAndReadBack', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var fileId = new ObjectID();
        var gridStore = new GridStore(db, fileId, 'w', { root: 'fs' });
        gridStore.chunkSize = 5000;

        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;

          var d = Buffer.alloc(5000);
          for (var j = 0; j < 5000; j++) {
            d[j] = 43;
          }

          // Write 3 chunks
          var completed = 3;
          for (var i = 0; i < 3; i++) {
            gridStore.write(d, false, function() {
              completed = completed - 1;

              if (completed === 0) {
                gridStore.close(function(err) {
                  test.equal(null, err);

                  var endLen = 0;
                  var gridStore = new GridStore(db, fileId, 'r');
                  gridStore.open(function(err, gridStore) {
                    expect(err).to.not.exist;
                    var stream = gridStore.stream();

                    stream.on('data', function(chunk) {
                      endLen += chunk.length;
                      // Test length of chunk
                      test.equal(5000, chunk.length);
                      // Check each chunk's data
                      for (var i = 0; i < 5000; i++) test.equal('+', String.fromCharCode(chunk[i]));
                    });

                    stream.on('end', function() {
                      test.equal(15000, endLen);
                      client.close();
                      done();
                    });
                  });
                });
              }
            });
          }
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should return same data for streaming as for direct read', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        var gridStoreR = new GridStore(db, 'test_gs_read_stream', 'r');
        var gridStoreW = new GridStore(db, 'test_gs_read_stream', 'w', { chunkSize: 56 });
        // var data = fs.readFileSync("./test/gridstore/test_gs_weird_bug.png");
        var data = Buffer.alloc(100);
        for (var i = 0; i < 100; i++) {
          data[i] = i;
        }

        var readLen = 0;

        gridStoreW.open(function(err, gs) {
          expect(err).to.not.exist;

          gs.write(data, function(err, gs) {
            expect(err).to.not.exist;

            gs.close(function(err) {
              expect(err).to.not.exist;
              gridStoreR.open(function(err, gs) {
                expect(err).to.not.exist;
                var chunks = [];
                var stream = gs.stream();
                stream.on('data', function(chunk) {
                  readLen += chunk.length;
                  chunks.push(chunk);
                });

                stream.on('end', function() {
                  test.equal(data.length, readLen);

                  // Read entire file in one go and compare
                  var gridStoreRead = new GridStore(db, 'test_gs_read_stream', 'r');
                  gridStoreRead.open(function(err) {
                    test.equal(null, err);

                    gridStoreRead.read(function(err, data2) {
                      expect(err).to.not.exist;

                      // Put together all the chunks
                      var streamData = Buffer.alloc(data.length);
                      var index = 0;
                      var i;
                      for (i = 0; i < chunks.length; i++) {
                        chunks[i].copy(streamData, index, 0);
                        index = index + chunks[i].length;
                      }

                      // Compare data
                      for (i = 0; i < data.length; i++) {
                        test.equal(data2[i], data[i]);
                        test.equal(streamData[i], data[i]);
                      }

                      client.close();
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
   * @ignore
   */
  it('shouldCorrectlyFailDueToMissingChunks', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        var FILE = 'empty.test.file';
        db.collection('fs.files', function(err, collection) {
          expect(err).to.not.exist;

          collection.insert(
            {
              filename: FILE,
              contentType: 'application/json; charset=UTF-8',
              length: 91,
              chunkSize: 262144,
              aliases: null,
              metadata: {},
              md5: '4e638392b289870da9291a242e474930'
            },
            configuration.writeConcernMax(),
            function(err) {
              test.equal(null, err);

              new GridStore(db, FILE, 'r').open(function(err, gs) {
                expect(err).to.not.exist;

                gs.read(function(err) {
                  test.ok(err != null);
                  gs.close(function() {});
                  client.close();
                  done();
                });
              });
            }
          );
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyWriteASmallPayload', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, 'test_gs_small_write4', 'w');
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;

          gridStore.write('hello world!', function(err, gridStore) {
            expect(err).to.not.exist;

            gridStore.close(function(err) {
              test.equal(null, err);

              db.collection('fs.files', function(err, collection) {
                expect(err).to.not.exist;

                collection.find({ filename: 'test_gs_small_write4' }).toArray(function(err, items) {
                  expect(err).to.not.exist;
                  test.equal(1, items.length);
                  var item = items[0];
                  test.ok(
                    item._id._bsontype === 'ObjectID' ||
                      Object.prototype.toString.call(item._id) === '[object ObjectID]'
                  );

                  db.collection('fs.chunks', function(err, collection) {
                    expect(err).to.not.exist;

                    var id = ObjectID.createFromHexString(item._id.toHexString());

                    collection.find({ files_id: id }).toArray(function(err, items) {
                      expect(err).to.not.exist;
                      test.equal(1, items.length);
                      client.close();
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
   * @ignore
   */
  it('shouldCorrectlyWriteSmallFileUsingABuffer', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, 'test_gs_small_write_with_buffer', 'w');
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;

          var data = Buffer.from('hello world', 'utf8');

          gridStore.write(data, function(err, gridStore) {
            expect(err).to.not.exist;

            gridStore.close(function(err) {
              test.equal(null, err);

              db.collection('fs.files', function(err, collection) {
                expect(err).to.not.exist;

                collection
                  .find({ filename: 'test_gs_small_write_with_buffer' })
                  .toArray(function(err, items) {
                    expect(err).to.not.exist;

                    test.equal(1, items.length);
                    var item = items[0];

                    db.collection('fs.chunks', function(err, collection) {
                      expect(err).to.not.exist;

                      collection.find({ files_id: item._id }).toArray(function(err, items) {
                        expect(err).to.not.exist;
                        test.equal(1, items.length);
                        client.close();
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
   * @ignore
   */
  it('shouldSaveSmallFileToGridStore', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, 'test_gs_small_file', 'w');
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;

          gridStore.write('hello world!', function(err, gridStore) {
            expect(err).to.not.exist;

            gridStore.close(function(err) {
              expect(err).to.not.exist;

              db.collection('fs.files', function(err, collection) {
                expect(err).to.not.exist;
                collection.find({ filename: 'test_gs_small_file' }).toArray(function(err, items) {
                  expect(err).to.not.exist;
                  test.equal(1, items.length);

                  // Read test of the file
                  GridStore.read(db, 'test_gs_small_file', function(err, data) {
                    expect(err).to.not.exist;
                    test.equal('hello world!', data.toString());
                    client.close();
                    done();
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
   * @ignore
   */
  it('shouldCorrectlyOverwriteFile', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, 'test_gs_overwrite', 'w');
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;

          gridStore.write('hello world!', function(err, gridStore) {
            expect(err).to.not.exist;
            gridStore.close(function(err) {
              expect(err).to.not.exist;

              var gridStore2 = new GridStore(db, 'test_gs_overwrite', 'w');
              gridStore2.open(function(err) {
                expect(err).to.not.exist;

                gridStore2.write('overwrite', function(err) {
                  expect(err).to.not.exist;

                  gridStore2.close(function(err) {
                    expect(err).to.not.exist;

                    // Assert that we have overwriten the data
                    GridStore.read(db, 'test_gs_overwrite', function(err, data) {
                      expect(err).to.not.exist;
                      test.equal('overwrite', data.toString());
                      client.close();
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
   * @ignore
   */
  it('shouldCorrectlySeekWithString', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, 'test_gs_seek', 'w');
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          gridStore.write('hello, world!', function(err, gridStore) {
            expect(err).to.not.exist;
            gridStore.close(function() {
              var gridStore2 = new GridStore(db, 'test_gs_seek', 'r');
              gridStore2.open(function(err, gridStore) {
                expect(err).to.not.exist;
                gridStore.seek(0, function(err, gridStore) {
                  expect(err).to.not.exist;
                  gridStore.getc(function(err, chr) {
                    expect(err).to.not.exist;
                    test.equal('h', chr.toString());

                    var gridStore3 = new GridStore(db, 'test_gs_seek', 'r');
                    gridStore3.open(function(err, gridStore) {
                      expect(err).to.not.exist;
                      gridStore.seek(7, function(err, gridStore) {
                        expect(err).to.not.exist;
                        gridStore.getc(function(err, chr) {
                          expect(err).to.not.exist;
                          test.equal('w', chr.toString());

                          var gridStore4 = new GridStore(db, 'test_gs_seek', 'r');
                          gridStore4.open(function(err, gridStore) {
                            expect(err).to.not.exist;
                            gridStore.seek(4, function(err, gridStore) {
                              expect(err).to.not.exist;
                              gridStore.getc(function(err, chr) {
                                expect(err).to.not.exist;
                                test.equal('o', chr.toString());

                                var gridStore5 = new GridStore(db, 'test_gs_seek', 'r');
                                gridStore5.open(function(err, gridStore) {
                                  expect(err).to.not.exist;
                                  gridStore.seek(-1, GridStore.IO_SEEK_END, function(
                                    err,
                                    gridStore
                                  ) {
                                    expect(err).to.not.exist;
                                    gridStore.getc(function(err, chr) {
                                      expect(err).to.not.exist;
                                      test.equal('!', chr.toString());

                                      var gridStore6 = new GridStore(db, 'test_gs_seek', 'r');
                                      gridStore6.open(function(err, gridStore) {
                                        expect(err).to.not.exist;
                                        gridStore.seek(-6, GridStore.IO_SEEK_END, function(
                                          err,
                                          gridStore
                                        ) {
                                          expect(err).to.not.exist;
                                          gridStore.getc(function(err, chr) {
                                            expect(err).to.not.exist;
                                            test.equal('w', chr.toString());

                                            var gridStore7 = new GridStore(db, 'test_gs_seek', 'r');
                                            gridStore7.open(function(err, gridStore) {
                                              expect(err).to.not.exist;
                                              gridStore.seek(7, GridStore.IO_SEEK_CUR, function(
                                                err,
                                                gridStore
                                              ) {
                                                expect(err).to.not.exist;
                                                gridStore.getc(function(err, chr) {
                                                  expect(err).to.not.exist;
                                                  test.equal('w', chr.toString());

                                                  gridStore.seek(
                                                    -1,
                                                    GridStore.IO_SEEK_CUR,
                                                    function(err, gridStore) {
                                                      expect(err).to.not.exist;
                                                      gridStore.getc(function(err, chr) {
                                                        expect(err).to.not.exist;
                                                        test.equal('w', chr.toString());

                                                        gridStore.seek(
                                                          -4,
                                                          GridStore.IO_SEEK_CUR,
                                                          function(err, gridStore) {
                                                            expect(err).to.not.exist;
                                                            gridStore.getc(function(err, chr) {
                                                              expect(err).to.not.exist;
                                                              test.equal('o', chr.toString());

                                                              gridStore.seek(
                                                                3,
                                                                GridStore.IO_SEEK_CUR,
                                                                function(err, gridStore) {
                                                                  expect(err).to.not.exist;
                                                                  gridStore.getc(function(
                                                                    err,
                                                                    chr
                                                                  ) {
                                                                    expect(err).to.not.exist;
                                                                    test.equal('o', chr.toString());
                                                                    client.close();
                                                                    done();
                                                                  });
                                                                }
                                                              );
                                                            });
                                                          }
                                                        );
                                                      });
                                                    }
                                                  );
                                                });
                                              });
                                            });
                                          });
                                        });
                                      });
                                    });
                                  });
                                });
                              });
                            });
                          });
                        });
                      });
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
   * @ignore
   */
  it('shouldCorrectlySeekAcrossChunks', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        // Create a new file
        var gridStore = new GridStore(db, 'test_gs_seek_across_chunks', 'w');
        // Open the file
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          var data = Buffer.alloc(gridStore.chunkSize * 3);
          // Write the binary file data to GridFS
          gridStore.write(data, function(err, gridStore) {
            expect(err).to.not.exist;
            // Flush the remaining data to GridFS
            gridStore.close(function(err) {
              expect(err).to.not.exist;

              var gridStore = new GridStore(db, 'test_gs_seek_across_chunks', 'r');
              // Read in the whole file and check that it's the same content
              gridStore.open(function(err, gridStore) {
                expect(err).to.not.exist;
                var timeout = setTimeout(function() {
                  test.ok(false, "Didn't complete in expected timeframe");
                  done();
                }, 2000);

                gridStore.seek(gridStore.chunkSize + 1, function(err, gridStore) {
                  expect(err).to.not.exist;
                  gridStore.tell(function(err, position) {
                    expect(err).to.not.exist;
                    test.equal(gridStore.chunkSize + 1, position);
                    clearTimeout(timeout);

                    client.close();
                    done();
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
   * @ignore
   */
  it('shouldCorrectlySaveEmptyFile', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, 'test_gs_save_empty_file', 'w');
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          db.collection('fs.files').deleteMany({}, function() {
            db.collection('fs.chunks').deleteMany({}, function() {
              gridStore.write('', function(err, gridStore) {
                expect(err).to.not.exist;
                gridStore.close(function(err) {
                  expect(err).to.not.exist;

                  db.collection('fs.files', function(err, collection) {
                    expect(err).to.not.exist;
                    collection.count(function(err, count) {
                      expect(err).to.not.exist;
                      test.equal(1, count);
                    });
                  });

                  db.collection('fs.chunks', function(err, collection) {
                    expect(err).to.not.exist;
                    collection.count(function(err, count) {
                      expect(err).to.not.exist;
                      test.equal(0, count);

                      client.close();
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
   * @ignore
   */
  it('shouldEnsureThatChunkSizeCannotBeChangedDuringRead', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        Chunk = configuration.require.Chunk;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, 'test_gs_cannot_change_chunk_size_on_read', 'w');
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          gridStore.write('hello, world!', function(err, gridStore) {
            expect(err).to.not.exist;
            gridStore.close(function(err) {
              expect(err).to.not.exist;

              var gridStore2 = new GridStore(db, 'test_gs_cannot_change_chunk_size_on_read', 'r');
              gridStore2.open(function(err, gridStore) {
                expect(err).to.not.exist;
                gridStore.chunkSize = 42;
                test.equal(Chunk.DEFAULT_CHUNK_SIZE, gridStore.chunkSize);
                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldEnsureChunkSizeCannotChangeAfterDataHasBeenWritten', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        Chunk = configuration.require.Chunk;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var gridStore = new GridStore(
          db,
          'test_gs_cannot_change_chunk_size_after_data_written',
          'w'
        );

        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          gridStore.write('hello, world!', function(err, gridStore) {
            expect(err).to.not.exist;
            gridStore.chunkSize = 42;
            test.equal(Chunk.DEFAULT_CHUNK_SIZE, gridStore.chunkSize);
            client.close();
            done();
          });
        });
      });
    }
  });

  /*
  * checks if 8 bit values will be preserved in gridstore
  *
  * @ignore
  */
  it('shouldCorrectlyStore8bitValues', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, 'test_gs_check_high_bits', 'w');
        var data = Buffer.alloc(255);
        for (var i = 0; i < 255; i++) {
          data[i] = i;
        }

        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          gridStore.write(data, function(err, gridStore) {
            expect(err).to.not.exist;
            gridStore.close(function(err) {
              expect(err).to.not.exist;

              // Assert that we have overwriten the data
              GridStore.read(db, 'test_gs_check_high_bits', function(err, fileData) {
                expect(err).to.not.exist;
                // change testvalue into a string like "0,1,2,...,255"
                test.equal(data.toString('hex'), fileData.toString('hex'));
                // test.equal(Array.prototype.join.call(data),
                //         Array.prototype.join.call(Buffer.from(fileData, "binary")));
                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldAllowChangingChunkSize', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, 'test_change_chunk_size', 'w');
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          gridStore.chunkSize = 42;

          gridStore.write('foo', function(err, gridStore) {
            expect(err).to.not.exist;
            gridStore.close(function(err) {
              expect(err).to.not.exist;

              var gridStore2 = new GridStore(db, 'test_change_chunk_size', 'r');
              gridStore2.open(function(err, gridStore) {
                expect(err).to.not.exist;
                test.equal(42, gridStore.chunkSize);
                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldAllowChangingChunkSizeAtCreationOfGridStore', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, 'test_change_chunk_size', 'w', { chunk_size: 42 });
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          gridStore.write('foo', function(err, gridStore) {
            expect(err).to.not.exist;
            gridStore.close(function(err) {
              expect(err).to.not.exist;

              var gridStore2 = new GridStore(db, 'test_change_chunk_size', 'r');
              gridStore2.open(function(err, gridStore) {
                expect(err).to.not.exist;
                test.equal(42, gridStore.chunkSize);
                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyCalculateMD5', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, 'new-file', 'w');
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          gridStore.write('hello world\n', function(err, gridStore) {
            expect(err).to.not.exist;
            gridStore.close(function(err) {
              expect(err).to.not.exist;

              var gridStore2 = new GridStore(db, 'new-file', 'r');
              gridStore2.open(function(err, gridStore) {
                expect(err).to.not.exist;
                test.equal('6f5902ac237024bdd0c176cb93063dc4', gridStore.md5);
                try {
                  gridStore.md5 = "can't do this";
                } catch (err) {
                  test.ok(err != null);
                }
                test.equal('6f5902ac237024bdd0c176cb93063dc4', gridStore.md5);

                var gridStore2 = new GridStore(db, 'new-file', 'w');
                gridStore2.open(function(err, gridStore) {
                  expect(err).to.not.exist;
                  gridStore.close(function(err) {
                    expect(err).to.not.exist;

                    var gridStore3 = new GridStore(db, 'new-file', 'r');
                    gridStore3.open(function(err, gridStore) {
                      expect(err).to.not.exist;
                      test.equal('d41d8cd98f00b204e9800998ecf8427e', gridStore.md5);
                      client.close();
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
   * @ignore
   */
  it('shouldCorrectlyUpdateUploadDate', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var originalFileUploadDate = null;

        var gridStore = new GridStore(db, 'test_gs_upload_date', 'w');
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          gridStore.write('hello world\n', function(err, gridStore) {
            expect(err).to.not.exist;
            gridStore.close(function(err) {
              expect(err).to.not.exist;

              var gridStore2 = new GridStore(db, 'test_gs_upload_date', 'r');
              gridStore2.open(function(err, gridStore) {
                expect(err).to.not.exist;
                test.ok(gridStore.uploadDate != null);
                originalFileUploadDate = gridStore.uploadDate;

                gridStore2.close(function(err) {
                  expect(err).to.not.exist;

                  var gridStore3 = new GridStore(db, 'test_gs_upload_date', 'w');
                  gridStore3.open(function(err) {
                    expect(err).to.not.exist;

                    gridStore3.write('new data', function(err) {
                      expect(err).to.not.exist;

                      gridStore3.close(function(err) {
                        expect(err).to.not.exist;

                        var gridStore4 = new GridStore(db, 'test_gs_upload_date', 'r');
                        gridStore4.open(function(err, gridStore) {
                          expect(err).to.not.exist;
                          test.equal(
                            originalFileUploadDate.getTime(),
                            gridStore.uploadDate.getTime()
                          );
                          client.close();
                          done();
                        });
                      });
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
   * @ignore
   */
  it('shouldCorrectlySaveContentType', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var ct = null;

        var gridStore = new GridStore(db, 'test_gs_content_type', 'w');
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          gridStore.write('hello world\n', function(err, gridStore) {
            expect(err).to.not.exist;
            gridStore.close(function(err) {
              expect(err).to.not.exist;

              var gridStore2 = new GridStore(db, 'test_gs_content_type', 'r');
              gridStore2.open(function(err, gridStore) {
                expect(err).to.not.exist;
                ct = gridStore.contentType;
                test.equal(GridStore.DEFAULT_CONTENT_TYPE, ct);

                var gridStore3 = new GridStore(db, 'test_gs_content_type', 'w+');
                gridStore3.open(function(err, gridStore) {
                  expect(err).to.not.exist;
                  gridStore.contentType = 'text/html';
                  gridStore.close(function(err) {
                    expect(err).to.not.exist;

                    var gridStore4 = new GridStore(db, 'test_gs_content_type', 'r');
                    gridStore4.open(function(err, gridStore) {
                      expect(err).to.not.exist;
                      test.equal('text/html', gridStore.contentType);
                      client.close();
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
   * @ignore
   */
  it('shouldCorrectlySaveContentTypeWhenPassedInAtGridStoreCreation', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, 'test_gs_content_type_option', 'w', {
          content_type: 'image/jpg'
        });

        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          gridStore.write('hello world\n', function(err, gridStore) {
            expect(err).to.not.exist;
            gridStore.close(function() {
              var gridStore2 = new GridStore(db, 'test_gs_content_type_option', 'r');
              gridStore2.open(function(err, gridStore) {
                expect(err).to.not.exist;
                test.equal('image/jpg', gridStore.contentType);
                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyReportIllegalMode', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, 'test_gs_unknown_mode', 'x');
        try {
          gridStore.open(function() {});
        } catch (err) {
          test.ok(err instanceof Error);
          test.equal('Illegal mode x', err.message);
          client.close();
          done();
        }
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlySaveAndRetrieveFileMetadata', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, 'test_gs_metadata', 'w', { content_type: 'image/jpg' });
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          gridStore.write('hello world\n', function(err, gridStore) {
            expect(err).to.not.exist;
            gridStore.close(function(err) {
              expect(err).to.not.exist;

              var gridStore2 = new GridStore(db, 'test_gs_metadata', 'r');
              gridStore2.open(function(err, gridStore) {
                expect(err).to.not.exist;
                test.equal(null, gridStore.metadata);

                var gridStore3 = new GridStore(db, 'test_gs_metadata', 'w+');
                gridStore3.open(function(err, gridStore) {
                  expect(err).to.not.exist;
                  gridStore.metadata = { a: 1 };
                  gridStore.close(function(err) {
                    expect(err).to.not.exist;

                    var gridStore4 = new GridStore(db, 'test_gs_metadata', 'r');
                    gridStore4.open(function(err, gridStore) {
                      expect(err).to.not.exist;
                      test.equal(1, gridStore.metadata.a);
                      client.close();
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
   * @ignore
   */
  it('shouldNotThrowErrorOnClosingOfGridObject', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, 'test_gs_metadata', 'w', { content_type: 'image/jpg' });
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          gridStore.write('hello world\n', function(err, gridStore) {
            expect(err).to.not.exist;
            gridStore.close(function(err) {
              expect(err).to.not.exist;

              var gridStore2 = new GridStore(db, 'test_gs_metadata', 'r');
              gridStore2.open(function(err, gridStore) {
                expect(err).to.not.exist;
                gridStore.close(function(err, fo) {
                  expect(err).to.not.exist;
                  test.ok(fo == null);
                  client.close();
                  done();
                });
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldNotThrowErrorOnClose', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var fieldId = new ObjectID();
        var gridStore = new GridStore(db, fieldId, 'w', { root: 'fs' });
        gridStore.chunkSize = 1024 * 256;
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          var numberOfWrites = 1000000 / 5000;

          var write = function(left, callback) {
            if (left === 0) return callback();
            gridStore.write(Buffer.alloc(5000), function() {
              left = left - 1;
              write(left, callback);
            });
          };

          write(numberOfWrites, function() {
            gridStore.close(function(err) {
              expect(err).to.not.exist;
              client.close();
              done();
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlySafeFileUsingIntAsIdKey', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, 500, 'test_gs_small_write2', 'w');
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          gridStore.write('hello world!', function(err, gridStore) {
            expect(err).to.not.exist;
            gridStore.close(function(err) {
              expect(err).to.not.exist;

              db.collection('fs.files', function(err, collection) {
                expect(err).to.not.exist;
                collection.find({ filename: 'test_gs_small_write2' }).toArray(function(err, items) {
                  expect(err).to.not.exist;
                  test.equal(1, items.length);
                  var item = items[0];
                  test.ok(typeof item._id === 'number');

                  db.collection('fs.chunks', function(err, collection) {
                    expect(err).to.not.exist;
                    collection.find({ files_id: item._id }).toArray(function(err, items) {
                      expect(err).to.not.exist;
                      test.equal(1, items.length);

                      // Read the file
                      var gridStore = new GridStore(db, 500, 'test_gs_small_write2', 'r');
                      gridStore.open(function(err, gridStore) {
                        expect(err).to.not.exist;
                        gridStore.read(function(err, data) {
                          expect(err).to.not.exist;
                          test.equal('hello world!', data.toString('ascii'));

                          GridStore.read(db, 'test_gs_small_write2', function(err, data) {
                            expect(err).to.not.exist;
                            test.equal('hello world!', data.toString('ascii'));
                            client.close();
                            done();
                          });
                        });
                      });
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
   * @ignore
   */
  it('shouldCorrectlyReadWithPositionOffset', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        Long = configuration.require.Long;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        // Massive data Buffer
        var data = Buffer.alloc(1024 * 512);
        // Set some data in the buffer at a point we want to read in the next chunk
        data.write('Hello world!', 1024 * 256);

        var gridStore = new GridStore(db, Long.fromNumber(100), 'test_gs_small_write3', 'w');
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          gridStore.write(data, function(err, gridStore) {
            expect(err).to.not.exist;
            gridStore.close(function(err) {
              expect(err).to.not.exist;

              // Reopen the gridstore in read only mode, seek and then attempt read
              gridStore = new GridStore(db, Long.fromNumber(100), 'test_gs_small_write3', 'r');
              gridStore.open(function(err, gridStore) {
                expect(err).to.not.exist;
                // Seek to middle
                gridStore.seek(1024 * 256 + 6, function(err, gridStore) {
                  expect(err).to.not.exist;
                  // Read
                  gridStore.read(5, function(err, data) {
                    expect(err).to.not.exist;
                    test.equal('world', data.toString('ascii'));
                    client.close();
                    done();
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
   * @ignore
   */
  it('shouldCorrectlyWrite', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var mystr = '';
        var sizestr = 1024 * 25;
        for (var j = 0; j < sizestr; j++) {
          mystr = mystr + '+';
        }

        var fname = 'test_large_str';
        var my_chunkSize = 1024 * 10;
        GridStore.unlink(db, fname, function(err) {
          expect(err).to.not.exist;

          var gs = new GridStore(db, fname, 'w');
          gs.chunkSize = my_chunkSize;
          gs.open(function(err, gs) {
            expect(err).to.not.exist;
            gs.write(mystr, function(err, gs) {
              expect(err).to.not.exist;
              gs.close(function(err) {
                expect(err).to.not.exist;

                var gs2 = new GridStore(db, fname, 'r');
                gs2.open(function(err) {
                  expect(err).to.not.exist;

                  gs2.seek(0, function() {
                    gs2.read(function(err, datar) {
                      expect(err).to.not.exist;
                      test.equal(mystr.length, datar.length);
                      test.equal(mystr, datar.toString('ascii'));
                      client.close();
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
   * @ignore
   */
  it('shouldCorrectlyReturnErrorMessageOnNoFileExisting', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, '_i_shouldCorrectlyWriteASmallPayload', 'r');
        gridStore.open(function(err) {
          expect(err).to.exist;
          client.close();
          done();
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should fail when seeking on a write enabled gridstore object', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var gridStore = new GridStore(db, 'test_gs_metadata', 'w', { content_type: 'image/jpg' });
        gridStore.open(function(err, gridStore) {
          gridStore.seek(0, function(err) {
            expect(err).to.exist;
            client.close();
            done();
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly handle filename as ObjectId', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var id = new ObjectID();
        var gridStore = new GridStore(db, id, id, 'w');
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          gridStore.write('hello world!', function(err, gridStore) {
            expect(err).to.not.exist;
            gridStore.close(function(err) {
              expect(err).to.not.exist;

              // Check if file exists
              GridStore.exist(db, { filename: id }, function(err, r) {
                expect(err).to.not.exist;
                test.equal(true, r);

                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly pipe through multiple pipelines', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        fs = require('fs');

      // Use connect method to connect to the Server
      const client = configuration.newClient({}, { sslValidate: false });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);

        // Set up gridStore
        var stream = new GridStore(db, 'simple_100_document_toArray.png', 'w').stream();
        // File we want to write to GridFS
        var filename = './test/functional/data/test_gs_working_field_read.pdf';
        // Create a file reader stream to an object
        var fileStream = fs.createReadStream(filename);

        // Finish up once the file has been all read
        stream.on('end', function() {
          // Just read the content and compare to the raw binary
          GridStore.read(db, 'simple_100_document_toArray.png', function(err, gridData) {
            expect(err).to.not.exist;
            var fileData = fs.readFileSync(filename);
            test.equal(fileData.toString('hex'), gridData.toString('hex'));
            client.close();
            done();
          });
        });

        // Pipe it through to the gridStore
        fileStream.pipe(stream);
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly seek on file where size of file is a multiple of the chunk size', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore;

      // Use connect method to connect to the Server
      const client = configuration.newClient({}, { sslValidate: false });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);

        var gridStore = new GridStore(db, 'test_gs_multi_chunk_exact_size', 'w');
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;
          gridStore.chunkSize = 512;

          // Write multiple of chunk size
          gridStore.write(Buffer.alloc(gridStore.chunkSize * 4), function(err) {
            expect(err).to.not.exist;

            gridStore.close(function(err) {
              expect(err).to.not.exist;

              var gridStore = new GridStore(db, 'test_gs_multi_chunk_exact_size', 'r');
              gridStore.open(function(err, store) {
                expect(err).to.not.exist;

                store.seek(0, GridStore.IO_SEEK_END, function(err) {
                  expect(err).to.not.exist;

                  store.tell(function(err, pos) {
                    expect(err).to.not.exist;
                    test.equal(512 * 4, pos);

                    store.seek(0, GridStore.IO_SEEK_SET, function(err) {
                      expect(err).to.not.exist;

                      store.tell(function(err, pos) {
                        expect(err).to.not.exist;
                        test.equal(0, pos);

                        store.read(function(err, data) {
                          expect(err).to.not.exist;
                          test.equal(512 * 4, data.length);

                          client.close();
                          done();
                        });
                      });
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
   * @ignore
   */
  it(
    'should correctly seek on file where size of file is a multiple of the chunk size and then stream',
    {
      metadata: {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },

      // The actual test we wish to run
      test: function(done) {
        var configuration = this.configuration;
        var GridStore = configuration.require.GridStore,
          ObjectID = configuration.require.ObjectID;

        var id = new ObjectID();
        const client = configuration.newClient({}, { sslValidate: false });
        client.connect(function(err, client) {
          expect(err).to.not.exist;
          var db = client.db(configuration.db);

          var gridStore = new GridStore(db, id, 'w');
          gridStore.open(function(err, gridStore) {
            expect(err).to.not.exist;
            gridStore.chunkSize = 512;

            // Get the data
            var data = Buffer.alloc(gridStore.chunkSize * 2);
            for (var i = 0; i < gridStore.chunkSize * 2; i++) {
              data[i] = 0;
            }

            // Write multiple of chunk size
            gridStore.write(data, function(err) {
              expect(err).to.not.exist;

              gridStore.close(function(err) {
                expect(err).to.not.exist;

                var gridStore = new GridStore(db, id, 'r');
                gridStore.open(function(err, store) {
                  expect(err).to.not.exist;

                  store.seek(0, GridStore.IO_SEEK_END, function(err) {
                    expect(err).to.not.exist;

                    store.tell(function(err, pos) {
                      expect(err).to.not.exist;
                      test.equal(512 * 2, pos);

                      store.seek(0, GridStore.IO_SEEK_SET, function(err) {
                        expect(err).to.not.exist;

                        store.tell(function(err, pos) {
                          expect(err).to.not.exist;
                          test.equal(0, pos);

                          // Get the stream
                          var stream = store.stream();
                          var retrieved = '';

                          stream.on('data', function(d) {
                            retrieved += d.toString('hex');
                          });

                          stream.on('end', function() {
                            test.equal(data.toString('hex'), retrieved);

                            client.close();
                            done();
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      }
    }
  );

  /**
   * @ignore
   */
  it('should correctly write fake png to gridstore', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      // Create a test buffer
      var buffer = Buffer.alloc(200033);

      // Use connect method to connect to the Server
      const client = configuration.newClient({}, { sslValidate: false });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);

        var gridStore = new GridStore(db, new ObjectID(), 'w', {
          content_type: 'image/png',
          chunk_size: 1024 * 4
        });
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;

          gridStore.write(buffer, function(err) {
            expect(err).to.not.exist;

            gridStore.close(function(err) {
              expect(err).to.not.exist;

              client.close();
              done();
            });
          });
        });
      });
    }
  });

  it('should not attempt to delete chunks when no file exists', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var GridStore = configuration.require.GridStore,
        ObjectID = configuration.require.ObjectID;

      var started = [];
      var succeeded = [];

      // Create a test buffer
      var buffer = Buffer.alloc(2000);

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        test.equal(null, err);

        var listener = require('../..').instrument(function(err) {
          expect(err).to.not.exist;
        });

        listener.on('started', function(event) {
          if (event.commandName === 'delete') started.push(event);
        });

        listener.on('succeeded', function(event) {
          if (event.commandName === 'delete') succeeded.push(event);
        });

        var gridStore = new GridStore(db, new ObjectID(), 'w', {
          content_type: 'image/png',
          chunk_size: 1024 * 4
        });
        gridStore.open(function(err, gridStore) {
          expect(err).to.not.exist;

          gridStore.write(buffer, function(err) {
            expect(err).to.not.exist;

            gridStore.close(function(err) {
              expect(err).to.not.exist;

              listener.uninstrument();
              client.close();
              done();
            });
          });
        });
      });
    }
  });
});
