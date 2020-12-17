'use strict';
var f = require('util').format;
var test = require('./shared').assert;
const { setupDatabase, withClient } = require(`./shared`);
const { expect } = require('chai');

describe('Find and Modify', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('should pass through writeConcern to all findAndModify commands at command level', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var started = [];
      var succeeded = [];

      var listener = require('../../src').instrument(function (err) {
        expect(err).to.not.exist;
      });

      listener.on('started', function (event) {
        if (event.commandName === 'findAndModify') started.push(event);
      });

      listener.on('succeeded', function (event) {
        if (event.commandName === 'findAndModify') succeeded.push(event);
      });

      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        expect(err).to.not.exist;

        var collection = db.collection('findAndModifyTEST');
        // Execute findOneAndUpdate
        collection.findOneAndUpdate(
          {},
          { $set: { a: 1 } },
          { writeConcern: { fsync: 1 } },
          function (err) {
            expect(err).to.not.exist;
            test.deepEqual({ fsync: 1 }, started[0].command.writeConcern);

            // Cleanup
            started = [];
            succeeded = [];

            // Execute findOneAndReplace
            collection.findOneAndReplace({}, { b: 1 }, { writeConcern: { fsync: 1 } }, function (
              err
            ) {
              expect(err).to.not.exist;
              test.deepEqual({ fsync: 1 }, started[0].command.writeConcern);

              // Cleanup
              started = [];
              succeeded = [];

              // Execute findOneAndReplace
              collection.findOneAndDelete({}, { writeConcern: { fsync: 1 } }, function (err) {
                expect(err).to.not.exist;
                test.deepEqual({ fsync: 1 }, started[0].command.writeConcern);

                listener.uninstrument();
                client.close(done);
              });
            });
          }
        );
      });
    }
  });

  it('should pass through writeConcern to all findAndModify at collection level', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var started = [];
      var succeeded = [];

      var listener = require('../../src').instrument(function (err) {
        expect(err).to.not.exist;
      });

      listener.on('started', function (event) {
        if (event.commandName === 'findAndModify') started.push(event);
      });

      listener.on('succeeded', function (event) {
        if (event.commandName === 'findAndModify') succeeded.push(event);
      });

      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        expect(err).to.not.exist;

        var collection = db.collection('findAndModifyTEST', { writeConcern: { fsync: 1 } });
        // Execute findOneAndUpdate
        collection.findOneAndUpdate({}, { $set: { a: 1 } }, function (err) {
          expect(err).to.not.exist;
          test.deepEqual({ fsync: 1 }, started[0].command.writeConcern);

          // Cleanup
          started = [];
          succeeded = [];

          // Execute findOneAndReplace
          collection.findOneAndReplace({}, { b: 1 }, function (err) {
            expect(err).to.not.exist;
            test.deepEqual({ fsync: 1 }, started[0].command.writeConcern);

            // Cleanup
            started = [];
            succeeded = [];

            // Execute findOneAndReplace
            collection.findOneAndDelete({}, function (err) {
              expect(err).to.not.exist;
              test.deepEqual({ fsync: 1 }, started[0].command.writeConcern);

              listener.uninstrument();
              client.close(done);
            });
          });
        });
      });
    }
  });

  it('should pass through writeConcern to all findAndModify at db level', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var started = [];
      var succeeded = [];

      var listener = require('../../src').instrument(function (err) {
        expect(err).to.not.exist;
      });

      listener.on('started', function (event) {
        if (event.commandName === 'findAndModify') started.push(event);
      });

      listener.on('succeeded', function (event) {
        if (event.commandName === 'findAndModify') succeeded.push(event);
      });

      var url = configuration.url();
      url = url.indexOf('?') !== -1 ? f('%s&%s', url, 'fsync=true') : f('%s?%s', url, 'fsync=true');

      // Establish connection to db
      const client = configuration.newClient(url, { sslValidate: false });
      client.connect(function (err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);
        var collection = db.collection('findAndModifyTEST');
        // Execute findOneAndUpdate
        collection.findOneAndUpdate({}, { $set: { a: 1 } }, function (err) {
          expect(err).to.not.exist;
          test.deepEqual({ fsync: true }, started[0].command.writeConcern);

          // Cleanup
          started = [];
          succeeded = [];

          // Execute findOneAndReplace
          collection.findOneAndReplace({}, { b: 1 }, function (err) {
            expect(err).to.not.exist;
            test.deepEqual({ fsync: true }, started[0].command.writeConcern);

            // Cleanup
            started = [];
            succeeded = [];

            // Execute findOneAndReplace
            collection.findOneAndDelete({}, function (err) {
              expect(err).to.not.exist;
              test.deepEqual({ fsync: true }, started[0].command.writeConcern);

              listener.uninstrument();
              client.close(done);
            });
          });
        });
      });
    }
  });

  it('should allow all findAndModify commands with non-primary readPreference', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: 'replicaset' }
    },

    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient({ readPreference: 'secondary' }, { maxPoolSize: 1 });
      client.connect((err, client) => {
        const db = client.db(configuration.db);
        expect(err).to.not.exist;

        const collection = db.collection('findAndModifyTEST');
        // Execute findOneAndUpdate
        collection.findOneAndUpdate({}, { $set: { a: 1 } }, err => {
          expect(err).to.not.exist;

          client.close(true, done);
        });
      });
    }
  });

  it('should not allow atomic operators for findOneAndReplace', {
    metadata: { requires: { topology: 'single' } },
    test: withClient((client, done) => {
      const db = client.db('fakeDb');
      const collection = db.collection('test');
      expect(() => {
        collection.findOneAndReplace({ a: 1 }, { $set: { a: 14 } });
      }).to.throw(/must not contain atomic operators/);
      done();
    })
  });
});
