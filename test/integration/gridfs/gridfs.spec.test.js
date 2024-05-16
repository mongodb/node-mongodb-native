'use strict';
const { EJSON } = require('bson');
const { expect } = require('chai');
const { once } = require('node:events');
const { GridFSBucket } = require('../../mongodb');

describe('GridFS spec', function () {
  let client;
  let db;

  beforeEach(async function () {
    client = this.configuration.newClient();
    db = client.db('gridfs_spec_tests');
  });

  afterEach(async function () {
    await db.dropDatabase().catch(() => null);
    await client.close();
  });
  const UPLOAD_SPEC = require('../../spec/gridfs/gridfs-upload.json');
  for (const testSpec of UPLOAD_SPEC.tests) {
    it(testSpec.description, async function () {
      const bucket = new GridFSBucket(db, { bucketName: 'expected' });
      const uploadStream = bucket.openUploadStream(
        testSpec.act.arguments.filename,
        testSpec.act.arguments.options
      );
      const buf = Buffer.from(testSpec.act.arguments.source.$hex, 'hex');
      const finished = once(uploadStream, 'finish');
      uploadStream.write(buf);
      uploadStream.end();
      await finished;
      for (const data of testSpec.assert.data) {
        const docs = await db.collection(data.insert).find({}).toArray();
        expect(data.documents.length).to.equal(docs.length);
        for (let i = 0; i < docs.length; ++i) {
          testResultDoc(data.documents[i], docs[i], uploadStream.id);
        }
      }
    });
  }
  const DOWNLOAD_SPEC = require('../../spec/gridfs/gridfs-download.json');
  DOWNLOAD_SPEC.tests.forEach(function (specTest) {
    (function (testSpec) {
      it(testSpec.description, { requires: { topology: ['single'] } }, function (done) {
        const configuration = this.configuration;
        const client = configuration.newClient(configuration.writeConcernMax(), {
          maxPoolSize: 1
        });
        client.connect(function (err, client) {
          const db = client.db(configuration.db);
          db.dropDatabase(function (err) {
            expect(err).to.not.exist;
            const BUCKET_NAME = 'fs';
            const _runTest = function () {
              const bucket = new GridFSBucket(db, { bucketName: BUCKET_NAME });
              let res = Buffer.alloc(0);
              const download = bucket.openDownloadStream(
                EJSON.parse(JSON.stringify(testSpec.act.arguments.id), { relaxed: true })
              );
              download.on('data', function (chunk) {
                res = Buffer.concat([res, chunk]);
              });
              let errorReported = false;
              download.on('error', function (error) {
                errorReported = true;
                if (!testSpec.assert.error) {
                  expect.fail('Should be unreached');
                  // We need to abort in order to close the underlying cursor,
                  // and by extension the implicit session used for the cursor.
                  // This is only necessary if the cursor is not exhausted
                  download.abort();
                  client.close(done);
                }
                expect(error.toString().indexOf(testSpec.assert.error) !== -1).to.equal(true);
                // We need to abort in order to close the underlying cursor,
                // and by extension the implicit session used for the cursor.
                // This is only necessary if the cursor is not exhausted
                download.abort();
                client.close(done);
              });
              download.on('end', function () {
                const result = testSpec.assert.result;
                if (!result) {
                  if (errorReported) {
                    return;
                  }
                  // We need to abort in order to close the underlying cursor,
                  // and by extension the implicit session used for the cursor.
                  // This is only necessary if the cursor is not exhausted
                  download.abort();
                  client.close(done);
                  expect.fail('errorReported should be set');
                }
                expect(res.toString('hex')).to.equal(result.$hex);
                // We need to abort in order to close the underlying cursor,
                // and by extension the implicit session used for the cursor.
                // This is only necessary if the cursor is not exhausted
                download.abort();
                client.close(done);
              });
            };
            const keys = Object.keys(DOWNLOAD_SPEC.data);
            let numCollections = Object.keys(DOWNLOAD_SPEC.data).length;
            keys.forEach(function (collection) {
              const data = DOWNLOAD_SPEC.data[collection].map(function (v) {
                return deflateTestDoc(v);
              });
              db.collection(BUCKET_NAME + '.' + collection).insertMany(data, function (error) {
                expect(error).to.not.exist;
                if (--numCollections === 0) {
                  if (testSpec.arrange) {
                    // only support 1 arrange op for now
                    expect(testSpec.arrange.data.length).to.equal(1);
                    applyArrange(db, deflateTestDoc(testSpec.arrange.data[0]), function (error) {
                      expect(error).to.not.exist;
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
      });
    })(specTest);
  });
  function testResultDoc(specDoc, resDoc, result) {
    const specKeys = Object.keys(specDoc)
      .filter(key => key !== 'md5')
      .sort();
    const resKeys = Object.keys(resDoc).sort();
    expect(specKeys.length === resKeys.length).to.equal(true);
    for (let i = 0; i < specKeys.length; ++i) {
      const key = specKeys[i];
      expect(specKeys[i]).to.equal(resKeys[i]);
      if (specDoc[key] === '*actual') {
        expect(resDoc[key]).to.exist;
      } else if (specDoc[key] === '*result') {
        expect(resDoc[key].toString()).to.equal(result.toString());
      } else if (specDoc[key].$hex) {
        expect(resDoc[key]._bsontype === 'Binary').to.equal(true);
        expect(resDoc[key].toString('hex')).to.equal(specDoc[key].$hex);
      } else {
        if (typeof specDoc[key] === 'object') {
          expect(specDoc[key]).to.deep.equal(resDoc[key]);
        } else {
          expect(specDoc[key]).to.equal(resDoc[key]);
        }
      }
    }
  }
  function deflateTestDoc(doc) {
    const ret = EJSON.parse(JSON.stringify(doc), { relaxed: true });
    convert$hexToBuffer(ret);
    return ret;
  }
  function convert$hexToBuffer(doc) {
    const keys = Object.keys(doc);
    keys.forEach(function (key) {
      if (doc[key] && typeof doc[key] === 'object') {
        if (doc[key].$hex != null) {
          doc[key] = Buffer.from(doc[key].$hex, 'hex');
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
      const bulk = [];
      for (let i = 0; i < command.updates.length; ++i) {
        bulk.push({
          updateOne: {
            filter: command.updates[i].q,
            update: command.updates[i].u
          }
        });
      }
      db.collection(command.update).bulkWrite(bulk, callback);
    } else {
      const msg = 'Command not recognized: ' + require('util').inspect(command);
      callback(new Error(msg));
    }
  }
});
