import { once } from 'node:events';
import * as fs from 'node:fs';
import * as stream from 'node:stream';
import { promisify } from 'node:util';

import { Double } from 'bson';
import { expect } from 'chai';

import { type Db, GridFSBucket, MongoAPIError, type MongoClient, ObjectId } from '../../mongodb';

describe.only('GridFS Stream', function () {
  let client: MongoClient;
  let db: Db;

  beforeEach(async function () {
    client = this.configuration.newClient();
    db = client.db('gridfs_stream_tests');
  });

  afterEach(async function () {
    await db.dropDatabase().catch(() => null);
    await client.close();
  });

  /**
   * Correctly stream a file from disk into GridFS using openUploadStream
   *
   * @example-class GridFSBucket
   * @example-method openUploadStream
   */
  it('should upload from file stream', {
    metadata: { requires: { topology: ['single'] } },

    test(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        db.dropDatabase(function (error) {
          expect(error).to.not.exist;

          const bucket = new GridFSBucket(db);
          const readStream = fs.createReadStream('./LICENSE.md');

          const uploadStream = bucket.openUploadStream('test.dat');

          const license = fs.readFileSync('./LICENSE.md');
          const id = uploadStream.id;

          // Wait for stream to finish
          uploadStream.once('finish', function () {
            const chunksColl = db.collection('fs.chunks');
            const chunksQuery = chunksColl.find({ files_id: id });

            // Get all the chunks
            chunksQuery.toArray(function (error, docs) {
              expect(error).to.not.exist;
              expect(docs.length).to.equal(1);
              expect(docs[0].data.toString('hex')).to.equal(license.toString('hex'));

              const filesColl = db.collection('fs.files');
              const filesQuery = filesColl.find({ _id: id });
              filesQuery.toArray(function (error, docs) {
                expect(error).to.not.exist;
                expect(docs.length).to.equal(1);

                expect(docs[0]).to.not.have.property('md5');

                // make sure we created indexes
                filesColl.listIndexes().toArray(function (error, indexes) {
                  expect(error).to.not.exist;
                  expect(indexes.length).to.equal(2);
                  expect(indexes[1].name).to.equal('filename_1_uploadDate_1');

                  chunksColl.listIndexes().toArray(function (error, indexes) {
                    expect(error).to.not.exist;
                    expect(indexes.length).to.equal(2);
                    expect(indexes[1].name).to.equal('files_id_1_n_1');
                    client.close(done);
                  });
                });
              });
            });
          });

          readStream.pipe(uploadStream);
        });
      });
    }
  });

  it('destroy publishes provided error', {
    metadata: { requires: { topology: ['single'] } },
    test(done) {
      const configuration = this.configuration;

      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });

      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        db.dropDatabase(function (error) {
          expect(error).to.not.exist;

          const bucket = new GridFSBucket(db);
          const readStream = fs.createReadStream('./LICENSE.md');
          const uploadStream = bucket.openUploadStream('test.dat');
          const errorMessage = 'error';

          uploadStream.once('error', function (e) {
            expect(e).to.equal(errorMessage);
            client.close(done);
          });

          uploadStream.once('finish', function () {
            uploadStream.destroy(errorMessage);
          });

          readStream.pipe(uploadStream);
        });
      });
    }
  });

  /**
   * Correctly stream a file from disk into GridFS using openUploadStream
   *
   * @example-class GridFSBucket
   * @example-method openUploadStreamWithId
   */
  it('should upload from file stream with custom id', {
    metadata: { requires: { topology: ['single'] } },

    test(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        db.dropDatabase(function (error) {
          expect(error).to.not.exist;

          const bucket = new GridFSBucket(db);
          const readStream = fs.createReadStream('./LICENSE.md');

          const uploadStream = bucket.openUploadStreamWithId(1, 'test.dat');

          const license = fs.readFileSync('./LICENSE.md');
          const id = uploadStream.id;
          expect(id).to.equal(1);

          // Wait for stream to finish
          uploadStream.once('finish', function () {
            const chunksColl = db.collection('fs.chunks');
            const chunksQuery = chunksColl.find({ files_id: id });

            // Get all the chunks
            chunksQuery.toArray(function (error, docs) {
              expect(error).to.not.exist;
              expect(docs.length).to.equal(1);
              expect(docs[0].data.toString('hex')).to.equal(license.toString('hex'));

              const filesColl = db.collection('fs.files');
              const filesQuery = filesColl.find({ _id: id });

              filesQuery.toArray(function (error, docs) {
                expect(error).to.not.exist;
                expect(docs.length).to.equal(1);

                expect(docs[0]).to.not.have.property('md5');

                // make sure we created indexes
                filesColl.listIndexes().toArray(function (error, indexes) {
                  expect(error).to.not.exist;
                  expect(indexes.length).to.equal(2);
                  expect(indexes[1].name).to.equal('filename_1_uploadDate_1');

                  chunksColl.listIndexes().toArray(function (error, indexes) {
                    expect(error).to.not.exist;
                    expect(indexes.length).to.equal(2);
                    expect(indexes[1].name).to.equal('files_id_1_n_1');
                    client.close(done);
                  });
                });
              });
            });
          });

          readStream.pipe(uploadStream);
        });
      });
    }
  });

  /**
   * Correctly upload a file to GridFS and then retrieve it as a stream
   *
   * @example-class GridFSBucket
   * @example-method openDownloadStream
   */
  it('should download to upload stream', {
    metadata: { requires: { topology: ['single'] } },

    test(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        const bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload' });
        const CHUNKS_COLL = 'gridfsdownload.chunks';
        const FILES_COLL = 'gridfsdownload.files';
        const readStream = fs.createReadStream('./LICENSE.md');

        let uploadStream = bucket.openUploadStream('test.dat');

        const license = fs.readFileSync('./LICENSE.md');
        let id = uploadStream.id;

        uploadStream.once('finish', function () {
          const downloadStream = bucket.openDownloadStream(id);
          uploadStream = bucket.openUploadStream('test2.dat');
          id = uploadStream.id;

          downloadStream.pipe(uploadStream).once('finish', function () {
            const chunksQuery = db.collection(CHUNKS_COLL).find({ files_id: id });
            chunksQuery.toArray(function (error, docs) {
              expect(error).to.not.exist;
              expect(docs.length).to.equal(1);
              expect(docs[0].data.toString('hex')).to.equal(license.toString('hex'));

              const filesQuery = db.collection(FILES_COLL).find({ _id: id });
              filesQuery.toArray(function (error, docs) {
                expect(error).to.not.exist;
                expect(docs.length).to.equal(1);

                expect(docs[0]).to.not.have.property('md5');
                client.close(done);
              });
            });
          });
        });

        readStream.pipe(uploadStream);
      });
    }
  });

  /**
   * Correctly return file not found error
   */
  it('should fail to locate gridfs stream', {
    metadata: { requires: { topology: ['single'] } },

    test(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        const bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload' });

        // Get an unknown file
        const downloadStream = bucket.openDownloadStream(new ObjectId());
        downloadStream.on('data', function () {});

        downloadStream.on('error', function (err) {
          expect(err.code).to.equal('ENOENT');
          client.close(done);
        });
      });
    }
  });

  /**
   * Correctly download a GridFS file by name
   *
   * @example-class GridFSBucket
   * @example-method openDownloadStreamByName
   */
  it('openDownloadStreamByName', {
    metadata: { requires: { topology: ['single'] } },

    test(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        const bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload' });
        const readStream = fs.createReadStream('./LICENSE.md');
        const uploadStream = bucket.openUploadStream('test.dat');

        uploadStream.once('finish', function () {
          const downloadStream = bucket.openDownloadStreamByName('test.dat');

          let gotData = false;
          downloadStream.on('data', function (data) {
            expect(gotData).to.equal(false);
            gotData = true;
            expect(data.toString('utf8').indexOf('TERMS AND CONDITIONS') !== -1).to.equal(true);
          });

          downloadStream.on('end', function () {
            expect(gotData).to.equal(true);
            client.close(done);
          });
        });

        readStream.pipe(uploadStream);
      });
    }
  });

  /**
   * Provide start and end parameters for file download to skip ahead x bytes and limit the total amount of bytes read to n
   *
   * @example-class GridFSBucket
   * @example-method openDownloadStream
   */
  it('start/end options for openDownloadStream', {
    metadata: { requires: { topology: ['single'] } },

    test(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        const bucket = new GridFSBucket(db, {
          bucketName: 'gridfsdownload',
          chunkSizeBytes: 2
        });

        const readStream = fs.createReadStream('./LICENSE.md');
        const uploadStream = bucket.openUploadStream('teststart.dat');

        uploadStream.once('finish', function () {
          const downloadStream = bucket
            .openDownloadStreamByName('teststart.dat', { start: 1 })
            .end(6);

          downloadStream.on('error', function (error) {
            expect(error).to.not.exist;
          });

          let gotData = 0;
          let str = '';
          downloadStream.on('data', function (data) {
            ++gotData;
            str += data.toString('utf8');
          });

          downloadStream.on('end', function () {
            // Depending on different versions of node, we may get
            // different amounts of 'data' events. node 0.10 gives 2,
            // node >= 0.12 gives 3. Either is correct, but we just
            // care that we got between 1 and 3, and got the right result
            expect(gotData >= 1 && gotData <= 3).to.equal(true);
            expect(str).to.equal('pache');
            client.close(done);
          });
        });

        readStream.pipe(uploadStream);
      });
    }
  });

  it('emits end and close after all chunks are received', async function () {
    const bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload', chunkSizeBytes: 6000 });

    const readStream = fs.createReadStream('./LICENSE.md');
    const uploadStream = bucket.openUploadStream('LICENSE.md');

    const finishedUpload = once(uploadStream, 'finish');
    readStream.pipe(uploadStream);
    await finishedUpload;

    const downloadStream = bucket.openDownloadStreamByName('LICENSE.md');

    const closeEvent = once(downloadStream, 'close');
    const endEvent = once(downloadStream, 'end');

    // This always comes in two chunks because
    // our LICENSE is 11323 characters and we set chunkSize to 6000
    const chunks = [];
    for await (const data of downloadStream) {
      chunks.push(data);
    }

    await endEvent;
    await closeEvent;

    expect(chunks).to.have.lengthOf(2);
  });

  /**
   * Deleting a file from GridFS
   *
   * @example-class GridFSBucket
   * @example-method delete
   */
  it('Deleting a file', {
    metadata: { requires: { topology: ['single'] } },

    test(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        const bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload' });
        const CHUNKS_COLL = 'gridfsdownload.chunks';
        const FILES_COLL = 'gridfsdownload.files';
        const readStream = fs.createReadStream('./LICENSE.md');

        const uploadStream = bucket.openUploadStream('test.dat');
        const id = uploadStream.id;

        uploadStream.once('finish', function () {
          bucket.delete(id, function (err) {
            expect(err).to.not.exist;
            const chunksQuery = db.collection(CHUNKS_COLL).find({ files_id: id });
            chunksQuery.toArray(function (error, docs) {
              expect(error).to.not.exist;
              expect(docs.length).to.equal(0);

              const filesQuery = db.collection(FILES_COLL).find({ _id: id });
              filesQuery.toArray(function (error, docs) {
                expect(error).to.not.exist;
                expect(docs.length).to.equal(0);

                client.close(done);
              });
            });
          });
        });

        readStream.pipe(uploadStream);
      });
    }
  });

  it('writing to an aborted stream throws API error', {
    metadata: { requires: { topology: ['single'] } },

    async test() {
      const bucket = new GridFSBucket(db, { bucketName: 'gridfsabort', chunkSizeBytes: 1 });
      const chunks = db.collection('gridfsabort.chunks');
      const uploadStream = bucket.openUploadStream('test.dat');

      const willError = once(uploadStream, 'error');

      const id = uploadStream.id;
      const query = { files_id: id };

      const writeAsync = promisify(uploadStream.write.bind(uploadStream));

      await writeAsync('a', 'utf8');

      expect(await chunks.countDocuments(query)).to.equal(1);

      await uploadStream.abort();

      expect(await chunks.countDocuments(query)).to.equal(0);

      expect(await writeAsync('b', 'utf8').catch(e => e)).to.be.instanceOf(MongoAPIError);
      expect(await uploadStream.abort().catch(e => e)).to.be.instanceOf(MongoAPIError);
      expect((await willError)[0]).to.be.instanceOf(MongoAPIError);
    }
  });

  it('aborting a download stream emits close and cleans up cursor', async () => {
    const bucket = new GridFSBucket(db, { bucketName: 'gridfsdestroy', chunkSizeBytes: 10 });
    const readStream = fs.createReadStream('./LICENSE.md');
    const uploadStream = bucket.openUploadStream('LICENSE.md');
    const finishUpload = once(uploadStream, 'finish');
    readStream.pipe(uploadStream);
    await finishUpload;
    const downloadStream = bucket.openDownloadStream(uploadStream.gridFSFile._id);

    const downloadClose = once(downloadStream, 'close');
    await downloadStream.abort();

    await downloadClose;
    expect(downloadStream.s.cursor).to.not.exist;
  });

  /**
   * Deleting a file from GridFS using promises
   *
   * @example-class GridFSBucket
   * @example-method delete
   */
  it('Deleting a file using promises', function (done) {
    const configuration = this.configuration;
    const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
    client.connect(function (err, client) {
      const db = client.db(configuration.db);
      const bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload' });
      const CHUNKS_COLL = 'gridfsdownload.chunks';
      const FILES_COLL = 'gridfsdownload.files';
      const readStream = fs.createReadStream('./LICENSE.md');

      const uploadStream = bucket.openUploadStream('test.dat');
      const id = uploadStream.id;

      uploadStream.once('finish', function () {
        bucket.delete(id).then(function () {
          const chunksQuery = db.collection(CHUNKS_COLL).find({ files_id: id });
          chunksQuery.toArray(function (error, docs) {
            expect(error).to.not.exist;
            expect(docs.length).to.equal(0);

            const filesQuery = db.collection(FILES_COLL).find({ _id: id });
            filesQuery.toArray(function (error, docs) {
              expect(error).to.not.exist;
              expect(docs.length).to.equal(0);

              client.close(done);
            });
          });
        });
      });

      readStream.pipe(uploadStream);
    });
  });

  it('find()', function (done) {
    const configuration = this.configuration;
    const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
    client.connect(function (err, client) {
      const db = client.db(configuration.db);
      const bucket = new GridFSBucket(db, { bucketName: 'fs' });

      // We're only making sure this doesn't throw
      bucket.find({
        batchSize: 1,
        limit: 2,
        maxTimeMS: 3,
        noCursorTimeout: true,
        skip: 4,
        sort: { _id: 1 }
      });

      client.close(done);
    });
  });

  it('drop example', function (done) {
    const configuration = this.configuration;
    const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
    client.connect(function (err, client) {
      const db = client.db(configuration.db);
      const bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload' });
      const CHUNKS_COLL = 'gridfsdownload.chunks';
      const FILES_COLL = 'gridfsdownload.files';
      const readStream = fs.createReadStream('./LICENSE.md');

      const uploadStream = bucket.openUploadStream('test.dat');
      const id = uploadStream.id;

      uploadStream.once('finish', function () {
        bucket.drop(function (err) {
          expect(err).to.not.exist;

          const chunksQuery = db.collection(CHUNKS_COLL).find({ files_id: id });
          chunksQuery.toArray(function (error, docs) {
            expect(error).to.not.exist;
            expect(docs.length).to.equal(0);

            const filesQuery = db.collection(FILES_COLL).find({ _id: id });
            filesQuery.toArray(function (error, docs) {
              expect(error).to.not.exist;
              expect(docs.length).to.equal(0);

              client.close(done);
            });
          });
        });
      });

      readStream.pipe(uploadStream);
    });
  });

  /**
   * Drop an entire buckets files and chunks using promises
   *
   * @example-class GridFSBucket
   * @example-method drop
   */
  it('drop using promises', {
    metadata: { requires: { topology: ['single'] } },
    test(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        const bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload' });
        const CHUNKS_COLL = 'gridfsdownload.chunks';
        const FILES_COLL = 'gridfsdownload.files';
        const readStream = fs.createReadStream('./LICENSE.md');

        const uploadStream = bucket.openUploadStream('test.dat');
        const id = uploadStream.id;

        uploadStream.once('finish', function () {
          bucket.drop().then(function () {
            const chunksQuery = db.collection(CHUNKS_COLL).find({ files_id: id });
            chunksQuery.toArray(function (error, docs) {
              expect(error).to.not.exist;
              expect(docs.length).to.equal(0);

              const filesQuery = db.collection(FILES_COLL).find({ _id: id });
              filesQuery.toArray(function (error, docs) {
                expect(error).to.not.exist;
                expect(docs.length).to.equal(0);

                client.close(done);
              });
            });
          });
        });

        readStream.pipe(uploadStream);
      });
    }
  });

  /*
   * Find all associates files with a bucket
   *
   * @example-class GridFSBucket
   * @example-method find
   */
  it('find example', {
    metadata: { requires: { topology: ['single'] } },

    test(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        const bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload_2' });
        const readStream = fs.createReadStream('./LICENSE.md');

        const uploadStream = bucket.openUploadStream('test.dat');

        uploadStream.once('finish', function () {
          bucket.find({}, { batchSize: 1 }).toArray(function (err, files) {
            expect(err).to.not.exist;
            expect(1).to.equal(files.length);
            client.close(done);
          });
        });

        readStream.pipe(uploadStream);
      });
    }
  });

  /**
   * Rename a file
   *
   * @example-class GridFSBucket
   * @example-method rename
   */
  it('rename example', {
    metadata: { requires: { topology: ['single'] } },

    test(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        const bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload_3' });
        const readStream = fs.createReadStream('./LICENSE.md');

        const uploadStream = bucket.openUploadStream('test.dat');
        const id = uploadStream.id;

        uploadStream.once('finish', function () {
          // Rename the file
          bucket.rename(id, 'renamed_it.dat', function (err) {
            expect(err).to.not.exist;
            client.close(done);
          });
        });

        readStream.pipe(uploadStream);
      });
    }
  });

  it('download empty doc', {
    metadata: { requires: { topology: ['single'] } },

    test(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        const bucket = new GridFSBucket(db, { bucketName: 'fs' });

        db.collection('fs.files').insertMany([{ length: 0 }], function (error, result) {
          expect(error).to.not.exist;
          expect(Object.keys(result.insertedIds).length).to.equal(1);
          const id = result.insertedIds[0];

          const stream = bucket.openDownloadStream(id);
          stream.on('error', function (error) {
            expect(error).to.not.exist;
          });

          stream.on('data', function () {
            expect.fail('Should be unreachable');
          });

          stream.on('end', function () {
            // As per spec, make sure we didn't actually fire a query
            // because the document length is 0
            expect(stream.s.cursor).to.not.exist;
            client.close(done);
          });
        });
      });
    }
  });

  it('should use chunkSize for download', {
    metadata: { requires: { topology: ['single'] } },

    test(done) {
      if (typeof stream.pipeline !== 'function') {
        this.skip();
      }

      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        const bucket = new GridFSBucket(db, { bucketName: 'gridfs' });

        const uploadStream = bucket.openUploadStream('test');
        uploadStream.end(Buffer.alloc(40 * 1024 * 1024), err => {
          expect(err).to.not.exist;
          const range = {
            start: 35191617,
            end: 35192831
          };
          const downloadStream = bucket.openDownloadStreamByName('test', range);
          const outputStream = fs.createWriteStream('output');
          stream.pipeline(downloadStream, outputStream, err => {
            expect(err).to.not.exist;
            client.close(() => {
              fs.stat('output', (err, stats) => {
                expect(err).to.not.exist;
                expect(range.end - range.start).to.equal(stats.size);
                done();
              });
            });
          });
        });
      });
    }
  });

  it('should return only end - start bytes when the end is within a chunk', {
    metadata: { requires: { topology: ['single'] } },
    test(done) {
      // Provide start and end parameters for file download to skip
      // ahead x bytes and limit the total amount of bytes read to n
      const db = client.db();

      const start = 1;
      const end = 6;

      const bucket = new GridFSBucket(db, {
        bucketName: 'gridfsdownload',
        chunkSizeBytes: 20
      });

      const readStream = fs.createReadStream('./LICENSE.md');
      const uploadStream = bucket.openUploadStream('teststart.dat');

      uploadStream.once('finish', function () {
        const downloadStream = bucket.openDownloadStreamByName('teststart.dat', { start }).end(end);

        downloadStream.on('error', done);

        let str = '';
        downloadStream.on('data', function (data) {
          str += data.toString('utf8');
        });

        downloadStream.on('end', function () {
          expect(str).to.equal('pache');
          expect(str).to.have.lengthOf(end - start);
          client.close(done);
        });
      });

      readStream.pipe(uploadStream);
    }
  });

  it('should correctly handle indexes create with BSON.Double', function (done) {
    const configuration = this.configuration;
    const client = configuration.newClient();
    client.connect((err, client) => {
      expect(err).to.not.exist;
      const db = client.db(configuration.db);
      const col = db.collection('fs.files');
      col.createIndex({ filename: new Double(1.0), uploadDate: new Double(1.0) }, err => {
        expect(err).to.not.exist;
        col.listIndexes().toArray((err, indexes) => {
          expect(err).to.not.exist;
          const names = indexes.map(i => i.name);
          expect(names).to.eql(['_id_', 'filename_1_uploadDate_1']);
          client.close(done);
        });
      });
    });
  });

  it('NODE-2623 downloadStream should emit error on end > size', function (done) {
    const configuration = this.configuration;

    const client = this.configuration.newClient({ monitorCommands: true });

    const db = client.db(configuration.db);
    const bucket = new GridFSBucket(db, { bucketName: 'gridfsdownload' });
    const readStream = fs.createReadStream('./LICENSE.md');

    const uploadStream = bucket.openUploadStream('test.dat');

    const actualSize = fs.fstatSync(fs.openSync('./LICENSE.md', 'r')).size;
    const wrongExpectedSize = Math.floor(actualSize * 1.1);

    const id = uploadStream.id;

    uploadStream.once('finish', function () {
      const downloadStream = bucket.openDownloadStream(id, { end: wrongExpectedSize });
      downloadStream.on('data', function () {});

      downloadStream.on('error', function (err) {
        expect(err.message).to.equal(
          `Stream end (${wrongExpectedSize}) must not be more than the length of the file (${actualSize})`
        );
        client.close(done);
      });
    });

    readStream.pipe(uploadStream);
  });
});
