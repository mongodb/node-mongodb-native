'use strict';
const setupDatabase = require('./shared').setupDatabase;
const expect = require('chai').expect;

describe('Changestream Examples', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  it('supports hasNext', {
    metadata: {
      requires: {
        topology: ['replicaset']
      }
    },

    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        const db = client.db(configuration.db);
        const collection = db.collection('changeStreamExample1a');

        // Start Changestream Example 1
        const changeStream = collection.watch();
        changeStream.next(function(err, next) {
          if (err) return console.log(err);
          expect(err).to.equal(null);
          expect(next).to.exist;
          client.close();
          done();
        });
        // End Changestream Example 1

        // Insert something
        setTimeout(function() {
          collection.insertOne({ a: 1 }, function(err, result) {
            if (err) return console.log(err);
            expect(err).to.equal(null);
            expect(result).to.exist;
          });
        });
      });
    }
  });

  it('supports the EventEmitter api', {
    metadata: {
      requires: {
        topology: ['replicaset']
      }
    },

    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        const db = client.db(configuration.db);
        const collection = db.collection('changeStreamExample1b');

        // Using event emitter API
        const changeStream = collection.watch();
        changeStream.on('change', function(change) {
          expect(change).to.exist;
          client.close();
          done();
        });

        // Insert something
        setTimeout(function() {
          collection.insertOne({ a: 1 }, function(err, result) {
            if (err) return console.log(err);
            expect(err).to.equal(null);
            expect(result).to.exist;
          });
        });
      });
    }
  });

  it('can stream a ChangeStream', {
    metadata: {
      requires: {
        topology: ['replicaset']
      }
    },

    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        const db = client.db(configuration.db);
        const collection = db.collection('changeStreamExample1c');
        const changeStream = collection.watch();

        changeStream.stream({ transform: JSON.stringify }).once('data', function(chunk) {
          expect(chunk).to.exist;
          done();
        });

        // Insert something
        setTimeout(function() {
          collection.insertOne({ a: 1 }, function(err, result) {
            if (err) return console.log(err);
            expect(err).to.equal(null);
            expect(result).to.exist;
          });
        });
      });
    }
  });

  it('can specify a full document update', {
    metadata: {
      requires: {
        topology: ['replicaset']
      }
    },

    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        const db = client.db(configuration.db);
        const collection = db.collection('changeStreamExample1b');

        // Start Changestream Example 2
        const changeStream = collection.watch({ fullDocument: 'updateLookup' });
        changeStream.on('change', function(change) {
          expect(change).to.exist;
          client.close();
          done();
        });
        // End Changestream Eample 2

        // Insert something
        setTimeout(function() {
          collection.insertOne({ a: 1 }, function(err, result) {
            if (err) return console.log(err);
            expect(err).to.equal(null);
            expect(result).to.exist;
          });
        });
      });
    }
  });

  it('creates and uses a resume token', {
    metadata: {
      requires: {
        topology: ['replicaset']
      }
    },

    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        const db = client.db(configuration.db);
        const collection = db.collection('changeStreamExample3');
        // Start Changestream Example 3
        let resumeToken;

        const changeStream = collection.watch();
        changeStream.hasNext(function(err, change) {
          if (err) return console.log(err);
          expect(err).to.equal(null);
          expect(change).to.exist;
          changeStream.next(function(err, change) {
            if (err) return console.log(err);
            expect(err).to.equal(null);

            resumeToken = change._id;

            expect(change._id).to.exist;
            expect(changeStream.resumeToken).to.exist;

            changeStream.close(function(err) {
              if (err) return console.log(err);
              expect(err).to.equal(null);
              const newChangeStream = collection.watch({ resumeAfter: resumeToken });

              newChangeStream.next(function(err, next) {
                if (err) return console.log(err);
                expect(err).to.equal(null);
                expect(next).to.exist;
                client.close();
                done();
              });
            });
          });
        });
        // End Changestream Example 3
        // Insert something
        setTimeout(function() {
          collection.insertOne({ a: 1 }, function(err, result) {
            if (err) return console.log(err);
            expect(err).to.equal(null);
            expect(result).to.exist;
            // Insert something else
            collection.insertOne({ a: 2 }, function(err, result) {
              if (err) return console.log(err);
              expect(err).to.equal(null);
              expect(result).to.exist;
            });
          });
        });
      });
    }
  });

  it('should support an aggregation pipeline as the first paramter of watch', {
    metadata: { requires: { topology: ['replicaset'] } },
    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        const db = client.db(configuration.db);
        const collection = db.collection('changeStreamExample1a');

        // Start Changestream Example 4
        const pipeline = [
          { $match: { 'fullDocument.username': 'alice' } },
          { $addFields: { newField: 'this is an added field!' } }
        ];

        const changeStream = collection.watch(pipeline);
        changeStream.next(function(err, next) {
          expect(err).to.not.exist;
          expect(next).to.exist;
          expect(next.fullDocument.username).to.equal('alice');
          expect(next.newField).to.exist;
          expect(next.newField).to.equal('this is an added field!');

          client.close();
          done();
        });
        // End Changestream Example 4

        setTimeout(function() {
          collection.insertOne({ username: 'alice' }, function(err, result) {
            expect(err).to.not.exist;
            expect(result).to.exist;
          });
        });
      });
    }
  });
});
