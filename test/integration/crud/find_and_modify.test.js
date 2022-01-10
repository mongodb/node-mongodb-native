'use strict';
const { format: f } = require('util');

const { setupDatabase, withClient, assert: test } = require(`../shared`);
const { expect } = require('chai');

describe('Find and Modify', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  context('promise tests', function () {
    it('Should correctly execute findOneAndDelete operation With Promises and no options passed in', function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      client.connect().then(function (client) {
        const db = client.db(configuration.db);
        const col = db.collection('find_one_and_delete_with_promise_no_option');
        col.insertMany([{ a: 1, b: 1 }], { writeConcern: { w: 1 } }).then(function (r) {
          expect(r).property('insertedCount').to.equal(1);

          col
            .findOneAndDelete({ a: 1 })
            .then(function (r) {
              test.equal(1, r.lastErrorObject.n);
              test.equal(1, r.value.b);

              client.close(done);
            })
            .catch(function (err) {
              test.ok(err != null);
            });
        });
      });
    });

    it('Should correctly execute findOneAndUpate operation With Promises and no options passed in', function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      client.connect().then(function (client) {
        const db = client.db(configuration.db);
        const col = db.collection('find_one_and_update_with_promise_no_option');
        col.insertMany([{ a: 1, b: 1 }], { writeConcern: { w: 1 } }).then(function (r) {
          expect(r).property('insertedCount').to.equal(1);

          col
            .findOneAndUpdate({ a: 1 }, { $set: { a: 1 } })
            .then(function (r) {
              test.equal(1, r.lastErrorObject.n);
              test.equal(1, r.value.b);

              client.close(done);
            })
            .catch(function (err) {
              test.ok(err != null);
            });
        });
      });
    });

    it('Should correctly execute findOneAndReplace operation With Promises and no options passed in', function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      client.connect().then(function (client) {
        const db = client.db(configuration.db);
        const col = db.collection('find_one_and_replace_with_promise_no_option');
        col.insertMany([{ a: 1, b: 1 }], { writeConcern: { w: 1 } }).then(function (r) {
          expect(r).property('insertedCount').to.equal(1);

          col
            .findOneAndReplace({ a: 1 }, { a: 1 })
            .then(function (r) {
              test.equal(1, r.lastErrorObject.n);
              test.equal(1, r.value.b);

              client.close(done);
            })
            .catch(function (err) {
              test.ok(err != null);
            });
        });
      });
    });
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

      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1,
        monitorCommands: true
      });

      client.on('commandStarted', function (event) {
        if (event.commandName === 'findAndModify') started.push(event);
      });

      client.on('commandSucceeded', function (event) {
        if (event.commandName === 'findAndModify') succeeded.push(event);
      });

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
            collection.findOneAndReplace(
              {},
              { b: 1 },
              { writeConcern: { fsync: 1 } },
              function (err) {
                expect(err).to.not.exist;
                test.deepEqual({ fsync: 1 }, started[0].command.writeConcern);

                // Cleanup
                started = [];
                succeeded = [];

                // Execute findOneAndReplace
                collection.findOneAndDelete({}, { writeConcern: { fsync: 1 } }, function (err) {
                  expect(err).to.not.exist;
                  test.deepEqual({ fsync: 1 }, started[0].command.writeConcern);

                  client.close(done);
                });
              }
            );
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

      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1,
        monitorCommands: true
      });

      client.on('commandStarted', function (event) {
        if (event.commandName === 'findAndModify') started.push(event);
      });

      client.on('commandSucceeded', function (event) {
        if (event.commandName === 'findAndModify') succeeded.push(event);
      });

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

      var url = configuration.url();
      url = url.indexOf('?') !== -1 ? f('%s&%s', url, 'fsync=true') : f('%s?%s', url, 'fsync=true');

      // Establish connection to db
      const client = configuration.newClient(url, { sslValidate: false, monitorCommands: true });

      client.on('commandStarted', function (event) {
        if (event.commandName === 'findAndModify') started.push(event);
      });

      client.on('commandSucceeded', function (event) {
        if (event.commandName === 'findAndModify') succeeded.push(event);
      });

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
        expect(err).to.not.exist;
        const db = client.db(configuration.db);

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
