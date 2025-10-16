import { setImmediate, setTimeout } from 'node:timers';

import { expect } from 'chai';

import { Binary, type MongoClient } from '../../mongodb';

describe('Cursor Streams', function () {
  let client: MongoClient;

  beforeEach(async function () {
    client = this.configuration.newClient();
  });

  afterEach(async function () {
    await client.close();
  });

  it('should stream documents with pause and resume for fetching', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      const self = this;
      const docs = [];
      let j = 0;

      for (let i = 0; i < 3000; i++) {
        docs.push({ a: i });
      }

      const allDocs = [];
      while (docs.length > 0) {
        allDocs.push(docs.splice(0, 1000));
      }

      const client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      client.connect(function (err, client) {
        const db = client.db(self.configuration.db);
        db.createCollection(
          'test_streaming_function_with_limit_for_fetching2',
          function (err, collection) {
            let left = allDocs.length;
            for (let i = 0; i < allDocs.length; i++) {
              collection.insert(allDocs[i], { writeConcern: { w: 1 } }, function (err) {
                expect(err).to.not.exist;

                left = left - 1;

                if (left === 0) {
                  // Perform a find to get a cursor
                  const stream = collection.find({}).stream();
                  const data = [];

                  // For each data item
                  stream.on('data', function () {
                    data.push(1);
                    j = j + 1;
                    stream.pause();

                    collection.findOne({}, function (err) {
                      expect(err).to.not.exist;
                      stream.resume();
                    });
                  });

                  // When the stream is done
                  stream.on('end', function () {
                    setTimeout(() => {
                      let err;
                      try {
                        expect(data).to.have.length(3000);
                      } catch (e) {
                        err = e;
                      }

                      client.close(() => done(err));
                    }, 1000);
                  });
                }
              });
            }
          }
        );
      });
    }
  });

  it('should stream 10K documents', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      const self = this;
      const docs = [];

      for (let i = 0; i < 10000; i++) {
        docs.push({ a: i, bin: new Binary(Buffer.alloc(256)) });
      }

      let j = 0;

      const allDocs = [];
      while (docs.length > 0) {
        allDocs.push(docs.splice(0, 1000));
      }

      const client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      client.connect(function (err, client) {
        const db = client.db(self.configuration.db);
        db.createCollection(
          'test_streaming_function_with_limit_for_fetching_2',
          function (err, collection) {
            let left = allDocs.length;
            for (let i = 0; i < allDocs.length; i++) {
              collection.insert(allDocs[i], { writeConcern: { w: 1 } }, function (err) {
                expect(err).to.not.exist;
                left = left - 1;

                if (left === 0) {
                  // Perform a find to get a cursor
                  const stream = collection.find({}).stream();
                  const data = [];

                  // For each data item
                  stream.on('data', function () {
                    j = j + 1;
                    stream.pause();
                    data.push(1);

                    collection.findOne({}, function (err) {
                      expect(err).to.not.exist;
                      stream.resume();
                    });
                  });

                  // When the stream is done
                  stream.on('end', function () {
                    setTimeout(() => {
                      let err;
                      try {
                        expect(data).to.have.length(10000);
                      } catch (e) {
                        err = e;
                      }

                      client.close(err2 => done(err || err2));
                    }, 1000);
                  });
                }
              });
            }
          }
        );
      });
    }
  });

  it('should trigger massive amount of getMores', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      const self = this;
      const docs = [];
      let counter = 0;
      let counter2 = 0;

      for (let i = 0; i < 1000; i++) {
        docs.push({ a: i, bin: new Binary(Buffer.alloc(256)) });
      }

      const client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      client.connect(function (err, client) {
        const db = client.db(self.configuration.db);
        db.createCollection(
          'test_streaming_function_with_limit_for_fetching_3',
          function (err, collection) {
            collection.insert(docs, { writeConcern: { w: 1 } }, function (err) {
              expect(err).to.not.exist;

              // Perform a find to get a cursor
              const stream = collection.find({}).stream();

              // For each data item
              stream.on('data', function () {
                counter++;
                stream.pause();
                stream.resume();
                counter2++;
              });

              // When the stream is done
              stream.on('end', function () {
                expect(counter).to.equal(1000);
                expect(counter2).to.equal(1000);
                client.close(done);
              });
            });
          }
        );
      });
    }
  });

  it('should stream documents across getMore command and count correctly', async function () {
    if (process.platform === 'darwin') {
      this.skipReason = 'TODO(NODE-3819): Unskip flaky MacOS tests.';
      return this.skip();
    }

    const db = client.db();
    const collection = db.collection('streaming');
    const updateCollection = db.collection('update_within_streaming');

    await collection.drop();
    await updateCollection.drop();

    const docs = Array.from({ length: 10 }, (_, i) => ({
      _id: i,
      b: new Binary(Buffer.alloc(1024))
    }));

    await collection.insertMany(docs);
    // Set the batchSize to be a 5th of the total docCount to make getMores happen
    const stream = collection.find({}, { batchSize: 2 }).stream();

    let done;
    const end = new Promise((resolve, reject) => {
      done = error => (error != null ? reject(error) : resolve());
    });

    stream.on('end', () => {
      updateCollection
        .findOne({ id: 1 })
        .then(function (doc) {
          expect(doc.count).to.equal(9);
          done();
        })
        .catch(done)
        .finally(() => client.close());
    });

    let docCount = 0;
    stream.on('data', data => {
      stream.pause();
      try {
        expect(data).to.have.property('_id', docCount);
      } catch (assertionError) {
        return done(assertionError);
      }

      if (docCount++ === docs.length - 1) {
        stream.resume();
        return;
      }

      updateCollection
        .updateMany({ id: 1 }, { $inc: { count: 1 } }, { writeConcern: { w: 1 }, upsert: true })
        .then(() => {
          stream.resume();
        })
        .catch(done);
    });

    return end;
  });

  it('should correctly error out stream', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      const self = this;
      const client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      client.connect((err, client) => {
        const db = client.db(self.configuration.db);
        const cursor = db.collection('myCollection').find({
          timestamp: { $ltx: '1111' } // Error in query.
        });

        let error;
        const stream = cursor.stream();
        stream.on('error', err => (error = err));
        cursor.on('close', function () {
          setImmediate(() => {
            expect(error).to.exist;
            client.close(done);
          });
        });

        stream.pipe(process.stdout);
      });
    }
  });

  it('should correctly stream cursor after stream', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      const self = this;
      const client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      client.connect(function (err, client) {
        const db = client.db(self.configuration.db);
        const docs = [];
        const received = [];

        for (let i = 0; i < 1000; i++) {
          docs.push({ a: i, field: 'hello world' });
        }

        db.collection('cursor_sort_stream').insertMany(docs, function (err) {
          expect(err).to.not.exist;

          const cursor = db
            .collection('cursor_sort_stream')
            .find({})
            .project({ a: 1 })
            .sort({ a: -1 });
          const stream = cursor.stream();

          stream.on('end', function () {
            expect(received).to.have.length(1000);

            client.close(done);
          });

          stream.on('data', function (d) {
            received.push(d);
          });
        });
      });
    }
  });
});
