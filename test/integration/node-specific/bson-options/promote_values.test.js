'use strict';
const { expect } = require('chai');
const { Long, Int32, Double } = require('../../../mongodb');
const { assert: test, setupDatabase } = require('../../shared');

describe('Promote Values', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it(
    'should correctly honor promoteValues when creating an instance using Db',
    {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },
    async function () {
      let configuration = this.configuration;
      let client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1,
        promoteValues: false
      });
      await client.connect();
      let db = client.db(configuration.db);
      await db.collection('shouldCorrectlyHonorPromoteValues').insertOne({
        doc: Long.fromNumber(10),
        int: 10,
        double: 2.2222,
        array: [[Long.fromNumber(10)]]
      });
      let doc = await db.collection('shouldCorrectlyHonorPromoteValues').findOne();
      expect(Long.fromNumber(10)).deep.equals(doc.doc);
      expect(new Int32(10)).deep.equals(doc.int);
      expect(new Double(2.2222)).deep.equals(doc.double);
      await client.close();
    }
  );

  it(
    'should correctly honor promoteValues when creating an instance using MongoClient',
    {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },
    async function () {
      var configuration = this.configuration;
      const client = configuration.newClient({}, { promoteValues: false });
      await client.connect();
      const db = client.db(configuration.db);
      await db.collection('shouldCorrectlyHonorPromoteValues').insertOne({
        doc: Long.fromNumber(10),
        int: 10,
        double: 2.2222,
        array: [[Long.fromNumber(10)]]
      });
      const doc = await db.collection('shouldCorrectlyHonorPromoteValues').findOne();
      expect(Long.fromNumber(10)).deep.equals(doc.doc);
      expect(new Int32(10)).deep.equals(doc.int);
      expect(new Double(2.2222)).deep.equals(doc.double);
      await client.close();
    }
  );

  it(
    'should correctly honor promoteValues at cursor level',
    {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },
    async function () {
      const configuration = this.configuration;
      const client = configuration.newClient({}, { promoteValues: false });
      await client.connect();
      const db = client.db(configuration.db);
      await db.collection('shouldCorrectlyHonorPromoteValues').insertOne({
        doc: Long.fromNumber(10),
        int: 10,
        double: 2.2222,
        array: [[Long.fromNumber(10)]]
      });
      const doc = await db.collection('shouldCorrectlyHonorPromoteValues').find().next();
      expect(doc.doc).to.deep.equal(Long.fromNumber(10));
      expect(doc.int).to.deep.equal(new Int32(10));
      expect(doc.double).to.deep.equal(new Double(2.2222));
      await client.close();
    }
  );

  it(
    'should correctly honor promoteValues at cursor find level',
    {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },
    async function () {
      const configuration = this.configuration;
      const client = configuration.newClient();
      await client.connect();
      const db = client.db(configuration.db);
      await db.collection('shouldCorrectlyHonorPromoteValues').insertOne({
        doc: Long.fromNumber(10),
        int: 10,
        double: 2.2222,
        array: [[Long.fromNumber(10)]]
      });
      const doc = await db
        .collection('shouldCorrectlyHonorPromoteValues')
        .find({}, { promoteValues: false })
        .next();
      expect(doc.doc).to.deep.equal(Long.fromNumber(10));
      expect(doc.int).to.deep.equal(new Int32(10));
      expect(doc.double).to.deep.equal(new Double(2.2222));
      await client.close();
    }
  );

  it(
    'should correctly honor promoteValues at aggregate level',
    {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },
    async function () {
      const configuration = this.configuration;
      const client = configuration.newClient();
      await client.connect();
      const db = client.db(configuration.db);
      await db.collection('shouldCorrectlyHonorPromoteValues2').insertOne({
        doc: Long.fromNumber(10),
        int: 10,
        double: 2.2222,
        array: [[Long.fromNumber(10)]]
      });
      const doc = await db
        .collection('shouldCorrectlyHonorPromoteValues2')
        .aggregate([{ $match: {} }], { promoteValues: false })
        .next();
      expect(doc.doc, Long.fromNumber(10));
      expect(doc.int, new Int32(10));
      expect(doc.double, new Double(2.2222));
      await client.close();
    }
  );

  it(
    'Should correctly promoteValues when calling getMore on queries',
    {
      requires: {
        topology: ['single', 'ssl', 'wiredtiger']
      }
    },
    function (done) {
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
  );
});
