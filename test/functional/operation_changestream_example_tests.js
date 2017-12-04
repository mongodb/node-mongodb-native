'use strict';
var setupDatabase = require('./shared').setupDatabase;
var expect = require('chai').expect;

// ./node_modules/.bin/mongodb-test-runner -l -e replicaset test/functional/operation_changestream_example_tests.js

describe('Changestream Examples', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  it('has next', {
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
        const changeStream = collection.watch();

        // Start Changestream Example 1
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

  it('uses an event emitter api', {
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
        const changeStream = collection.watch();

        // Using event emitter API
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

  it('streams a changestream', {
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

        changeStream.stream({ transform: JSON.stringify }).on('data', function(chunk) {
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

  it('specifies a full document update', {
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
        const changeStream = collection.watch({ fullDocument: 'updateLookup' });

        // Start Changestream Example 2
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
        const changeStream = collection.watch();
        // Start Changestream Example 3
        let resumeToken;

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
              // End Changestream Example 3
            });
          });
        });
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
});
