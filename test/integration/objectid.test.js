'use strict';
var test = require('./shared').assert;
const { expect } = require('chai');
const { ObjectId } = require('../mongodb');
const { sleep } = require('../tools/utils');

describe('ObjectId', function () {
  let client;
  beforeEach(async function () {
    client = this.configuration.newClient();
  });

  afterEach(async function () {
    await client.close();
  });

  it('generates new ObjectId for documents without _id property', async function () {
    const db = client.db();
    const collection = db.collection('test_object_id_generation');
    await collection.drop().catch(() => null);

    const documents = [{ a: 1 }, { a: 1 }, { a: 1 }];

    const parallelInserts = await Promise.all([
      collection.insertOne(documents[0]),
      collection.insertOne(documents[1]),
      collection.insertOne(documents[2])
    ]);

    expect(parallelInserts).to.have.lengthOf(3);

    // Input documents are modified
    expect(documents[0]).to.have.deep.property('_id', parallelInserts[0].insertedId);
    expect(documents[1]).to.have.deep.property('_id', parallelInserts[1].insertedId);
    expect(documents[2]).to.have.deep.property('_id', parallelInserts[2].insertedId);

    // ObjectIds are generated in a predictable order
    expect(documents[0]._id.id.compare(documents[1]._id.id)).to.equal(-1);
    expect(documents[1]._id.id.compare(documents[2]._id.id)).to.equal(-1);
    expect(documents[2]._id.id.compare(documents[0]._id.id)).to.equal(1);
  });

  it('shouldCorrectlyRetrieve24CharacterHexStringFromToString', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      // Create a new ObjectId
      var objectId = new ObjectId();
      // Verify that the hex string is 24 characters long
      test.equal(24, objectId.toString().length);
      done();
    }
  });

  it('shouldCorrectlyRetrieve24CharacterHexStringFromToJSON', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      // Create a new ObjectId
      var objectId = new ObjectId();
      // Verify that the hex string is 24 characters long
      test.equal(24, objectId.toJSON().length);
      done();
    }
  });

  it('shouldCorrectlyCreateOIDNotUsingObjectId', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      var db = client.db(configuration.db);
      var collection = db.collection('test_non_oid_id');
      var date = new Date();
      date.setUTCDate(12);
      date.setUTCFullYear(2009);
      date.setUTCMonth(11 - 1);
      date.setUTCHours(12);
      date.setUTCMinutes(0);
      date.setUTCSeconds(30);

      collection.insert({ _id: date }, { writeConcern: { w: 1 } }, function (err) {
        expect(err).to.not.exist;
        collection.find({ _id: date }).toArray(function (err, items) {
          test.equal('' + date, '' + items[0]._id);

          // Let's close the db
          client.close(done);
        });
      });
    }
  });

  it('shouldCorrectlyGenerateObjectIdFromTimestamp', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var timestamp = Math.floor(new Date().getTime() / 1000);
      var objectID = new ObjectId(timestamp);
      var time2 = objectID.generationTime;
      test.equal(timestamp, time2);
      done();
    }
  });

  it('shouldCorrectlyCreateAnObjectIdAndOverrideTheTimestamp', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var timestamp = 1000;
      var objectID = new ObjectId();
      var id1 = objectID.id;
      // Override the timestamp
      objectID.generationTime = timestamp;
      var id2 = objectID.id;

      // Check the timestamp
      if (id1 instanceof Buffer && id2 instanceof Buffer) {
        test.deepEqual(id1.slice(0, 4), id2.slice(0, 4));
      } else {
        test.equal(id1.substr(4), id2.substr(4));
      }

      done();
    }
  });

  it('shouldCorrectlyInsertWithObjectId', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: async function () {
      const client = this.configuration.newClient(this.configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      const db = client.db(this.configuration.db);
      const collection = db.collection('shouldCorrectlyInsertWithObjectId');
      await collection.insertMany([{}], { writeConcern: { w: 1 } });
      const firstCompareDate = new Date();

      await sleep(200);

      await collection.insertMany([{}], { writeConcern: { w: 1 } });
      const secondCompareDate = new Date();

      const items = await collection.find().toArray();
      // Date 1
      const date1 = new Date();
      date1.setTime(items[0]._id.generationTime * 1000);
      // Date 2
      const date2 = new Date();
      date2.setTime(items[1]._id.generationTime * 1000);

      // Compare
      test.equal(firstCompareDate.getFullYear(), date1.getFullYear());
      test.equal(firstCompareDate.getDate(), date1.getDate());
      test.equal(firstCompareDate.getMonth(), date1.getMonth());
      test.equal(firstCompareDate.getHours(), date1.getHours());

      test.equal(secondCompareDate.getFullYear(), date2.getFullYear());
      test.equal(secondCompareDate.getDate(), date2.getDate());
      test.equal(secondCompareDate.getMonth(), date2.getMonth());
      test.equal(secondCompareDate.getHours(), date2.getHours());

      // Let's close the db
      await client.close();
    }
  });
});
