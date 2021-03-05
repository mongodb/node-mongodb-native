'use strict';
var test = require('./shared').assert;
const { expect } = require('chai');
var setupDatabase = require('./shared').setupDatabase;
const { Long, Int32, Double } = require('../../src');

describe('Promote Values', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('should correctly honor promoteValues when creating an instance using Db', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1,
        promoteValues: false
      });

      client.connect(function (err, client) {
        var db = client.db(configuration.db);

        db.collection('shouldCorrectlyHonorPromoteValues').insert(
          {
            doc: Long.fromNumber(10),
            int: 10,
            double: 2.2222,
            array: [[Long.fromNumber(10)]]
          },
          function (err) {
            expect(err).to.not.exist;

            db.collection('shouldCorrectlyHonorPromoteValues').findOne(function (err, doc) {
              expect(err).to.not.exist;

              test.deepEqual(Long.fromNumber(10), doc.doc);
              test.deepEqual(new Int32(10), doc.int);
              test.deepEqual(new Double(2.2222), doc.double);

              client.close(done);
            });
          }
        );
      });
    }
  });

  it('should correctly honor promoteValues when creating an instance using MongoClient', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      const client = configuration.newClient({}, { promoteValues: false });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.collection('shouldCorrectlyHonorPromoteValues').insert(
          {
            doc: Long.fromNumber(10),
            int: 10,
            double: 2.2222,
            array: [[Long.fromNumber(10)]]
          },
          function (err) {
            expect(err).to.not.exist;

            db.collection('shouldCorrectlyHonorPromoteValues').findOne(function (err, doc) {
              expect(err).to.not.exist;

              test.deepEqual(Long.fromNumber(10), doc.doc);
              test.deepEqual(new Int32(10), doc.int);
              test.deepEqual(new Double(2.2222), doc.double);

              client.close(done);
            });
          }
        );
      });
    }
  });

  it('should correctly honor promoteValues at cursor level', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      const client = configuration.newClient({}, { promoteValues: false });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.collection('shouldCorrectlyHonorPromoteValues').insert(
          {
            doc: Long.fromNumber(10),
            int: 10,
            double: 2.2222,
            array: [[Long.fromNumber(10)]]
          },
          function (err) {
            expect(err).to.not.exist;

            db.collection('shouldCorrectlyHonorPromoteValues')
              .find()
              .next(function (err, doc) {
                expect(err).to.not.exist;

                test.deepEqual(Long.fromNumber(10), doc.doc);
                test.deepEqual(new Int32(10), doc.int);
                test.deepEqual(new Double(2.2222), doc.double);

                client.close(done);
              });
          }
        );
      });
    }
  });

  it('should correctly honor promoteValues at cursor find level', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      const client = configuration.newClient();
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.collection('shouldCorrectlyHonorPromoteValues').insert(
          {
            doc: Long.fromNumber(10),
            int: 10,
            double: 2.2222,
            array: [[Long.fromNumber(10)]]
          },
          function (err) {
            expect(err).to.not.exist;

            db.collection('shouldCorrectlyHonorPromoteValues')
              .find({}, { promoteValues: false })
              .next(function (err, doc) {
                expect(err).to.not.exist;

                test.deepEqual(Long.fromNumber(10), doc.doc);
                test.deepEqual(new Int32(10), doc.int);
                test.deepEqual(new Double(2.2222), doc.double);

                client.close(done);
              });
          }
        );
      });
    }
  });

  it('should correctly honor promoteValues at aggregate level', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      const client = configuration.newClient();
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.collection('shouldCorrectlyHonorPromoteValues2').insert(
          {
            doc: Long.fromNumber(10),
            int: 10,
            double: 2.2222,
            array: [[Long.fromNumber(10)]]
          },
          function (err) {
            expect(err).to.not.exist;

            db.collection('shouldCorrectlyHonorPromoteValues2')
              .aggregate([{ $match: {} }], { promoteValues: false })
              .next(function (err, doc) {
                expect(err).to.not.exist;

                test.deepEqual(Long.fromNumber(10), doc.doc);
                test.deepEqual(new Int32(10), doc.int);
                test.deepEqual(new Double(2.2222), doc.double);

                client.close(done);
              });
          }
        );
      });
    }
  });

  it('Should correctly promoteValues when calling getMore on queries', {
    metadata: {
      requires: {
        topology: ['single', 'ssl', 'wiredtiger']
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      const client = configuration.newClient();
      client.connect(function (err, client) {
        var docs = new Array(150).fill(0).map(function (_, i) {
          return {
            _id: 'needle_' + i,
            is_even: i % 2,
            long: Long.fromString('1234567890'),
            double: 0.23456,
            int: 1234
          };
        });

        var db = client.db(configuration.db);

        db.collection('haystack').insertMany(docs, function (errInsert) {
          if (errInsert) throw errInsert;
          // change limit from 102 to 101 and this test passes.
          // seems to indicate that the promoteValues flag is used for the
          // initial find, but not for subsequent getMores
          db.collection('haystack')
            .find({}, { limit: 102, promoteValues: false })
            .stream()
            .on('data', function (doc) {
              test.equal(typeof doc.int, 'object');
              test.equal(doc.int._bsontype, 'Int32');
              test.equal(typeof doc.long, 'object');
              test.equal(doc.long._bsontype, 'Long');
              test.equal(typeof doc.double, 'object');
              test.equal(doc.double._bsontype, 'Double');
            })
            .on('end', function () {
              db.dropCollection('haystack', function () {
                client.close(done);
              });
            });
        });
      });
    }
  });
});
