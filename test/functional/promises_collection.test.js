'use strict';
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;
var f = require('util').format;
const { expect } = require('chai');

describe('Promises (Collection)', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('Should correctly execute Collection.prototype.insertOne', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var url = configuration.url();
      url =
        url.indexOf('?') !== -1
          ? f('%s&%s', url, 'maxPoolSize=100')
          : f('%s?%s', url, 'maxPoolSize=100');

      const client = configuration.newClient(url);
      client.connect().then(function (client) {
        var db = client.db(configuration.db);

        db.collection('insertOne')
          .insertOne({ a: 1 })
          .then(function (r) {
            expect(r).property('insertedId').to.exist;
            client.close(done);
          });
      });
    }
  });

  it('Should correctly execute findOneAndDelete operation With Promises and no options passed in', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      client.connect().then(function (client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Get the collection
        var col = db.collection('find_one_and_delete_with_promise_no_option');
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
      // END
    }
  });

  it('Should correctly execute findOneAndUpate operation With Promises and no options passed in', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      client.connect().then(function (client) {
        var db = client.db(configuration.db);
        // LINE var MongoClient = require('mongodb').MongoClient,
        // LINE   test = require('assert');
        // LINE const client = new MongoClient('mongodb://localhost:27017/test');
        // LINE client.connect().then(() => {
        // LINE
        // LINE   var db = client.db('test);
        // REPLACE configuration.writeConcernMax() WITH {w:1}
        // REMOVE-LINE done();
        // BEGIN
        // Get the collection
        var col = db.collection('find_one_and_update_with_promise_no_option');
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
      // END
    }
  });

  it(
    'Should correctly execute findOneAndReplace operation With Promises and no options passed in',
    {
      metadata: {
        requires: {
          topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
        }
      },

      test: function (done) {
        var configuration = this.configuration;
        var client = configuration.newClient(configuration.writeConcernMax(), {
          maxPoolSize: 1
        });

        client.connect().then(function (client) {
          var db = client.db(configuration.db);
          // LINE var MongoClient = require('mongodb').MongoClient,
          // LINE   test = require('assert');
          // LINE const client = new MongoClient('mongodb://localhost:27017/test');
          // LINE client.connect().then(() => {
          // LINE
          // LINE   var db = client.db('test);
          // REPLACE configuration.writeConcernMax() WITH {w:1}
          // REMOVE-LINE done();
          // BEGIN
          // Get the collection
          var col = db.collection('find_one_and_replace_with_promise_no_option');
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
        // END
      }
    }
  );

  it('Should correctly handle bulkWrite with no options', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });
      var error = null;
      var result = null;

      client
        .connect()
        .then(function (client) {
          var db = client.db(configuration.db);
          // Get the collection
          var col = db.collection('find_one_and_replace_with_promise_no_option');
          return col.bulkWrite([{ insertOne: { document: { a: 1 } } }]);
        })
        .then(function (r) {
          result = r;
        })
        .catch(function (err) {
          error = err;
        })
        .then(function () {
          expect(error).to.not.exist;
          test.ok(result != null);

          client.close(done);
        });
    }
  });

  it('Should correctly return failing Promise when no document array passed into insertMany', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var url = configuration.url();
      url =
        url.indexOf('?') !== -1
          ? f('%s&%s', url, 'maxPoolSize=100')
          : f('%s?%s', url, 'maxPoolSize=100');

      const client = configuration.newClient(url);
      client.connect().then(() => {
        this.defer(() => client.close());

        const db = client.db(configuration.db);
        expect(() => {
          db.collection('insertMany_Promise_error').insertMany({ a: 1 });
        }).to.throw(/docs parameter must be an array of documents/);

        done();
      });
    }
  });

  it('Should correctly execute unordered bulk operation in promise form', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var url = configuration.url();
      url =
        url.indexOf('?') !== -1
          ? f('%s&%s', url, 'maxPoolSize=100')
          : f('%s?%s', url, 'maxPoolSize=100');

      const client = configuration.newClient(url);
      client.connect().then(function (client) {
        var db = client.db(configuration.db);
        var bulk = db
          .collection('unordered_bulk_promise_form')
          .initializeUnorderedBulkOp({ writeConcern: { w: 1 } });
        bulk.insert({ a: 1 });
        return bulk
          .execute()
          .then(function (r) {
            test.ok(r);
            test.deepEqual({ w: 1 }, bulk.s.writeConcern);

            client.close(done);
          })
          .catch(done);
      });
    }
  });

  it('Should correctly execute ordered bulk operation in promise form', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var url = configuration.url();
      url =
        url.indexOf('?') !== -1
          ? f('%s&%s', url, 'maxPoolSize=100')
          : f('%s?%s', url, 'maxPoolSize=100');

      const client = configuration.newClient(url);
      client.connect().then(function (client) {
        var db = client.db(configuration.db);
        var bulk = db
          .collection('unordered_bulk_promise_form')
          .initializeOrderedBulkOp({ writeConcern: { w: 1 } });
        bulk.insert({ a: 1 });
        return bulk
          .execute()
          .then(function (r) {
            test.ok(r);
            test.deepEqual({ w: 1 }, bulk.s.writeConcern);

            client.close(done);
          })
          .catch(done);
      });
    }
  });
});
