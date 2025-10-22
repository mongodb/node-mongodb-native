import { expect } from 'chai';

import { type MongoClient, ObjectId } from '../../../../src';
import { assert as test, setupDatabase } from '../../shared';

describe('Ignore Undefined', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  let client: MongoClient;

  beforeEach(async function () {
    client = this.configuration.newClient();
  });

  afterEach(async function () {
    await client.close();
  });

  it('should correctly insert document ignoring undefined field', async function () {
    const configuration = this.configuration;
    const client = configuration.newClient(configuration.writeConcernMax(), {
      maxPoolSize: 1,
      ignoreUndefined: true
    });

    const db = client.db(configuration.db);
    const collection = db.collection('shouldCorrectlyIgnoreUndefinedValue');

    // Ignore the undefined field
    await collection.insertOne({ a: 1, b: undefined }, configuration.writeConcernMax());

    const item = await collection.findOne();
    test.equal(1, item.a);
    test.ok(item.b === undefined);
    await client.close();
  });

  // TODO(NODE-7192): remove as it duplicates "should correctly insert document ignoring undefined field"
  // it('Should correctly connect using MongoClient and perform insert document ignoring undefined field', async function () {
  //   const configuration = this.configuration;
  //   const client = configuration.newClient(
  //     {},
  //     {
  //       ignoreUndefined: true
  //     }
  //   );
  //
  //   const db = client.db(configuration.db);
  //   const collection = db.collection('shouldCorrectlyIgnoreUndefinedValue1');
  //   await collection.insertOne({ a: 1, b: undefined });
  //
  //   const item = await collection.findOne();
  //   test.equal(1, item.a);
  //   test.ok(item.b === undefined);
  //
  //   await collection.insertOne({ a: 2, b: undefined });
  //
  //   const item1 = await collection.findOne({ a: 2 });
  //   test.equal(2, item1.a);
  //   test.ok(item1.b === undefined);
  //
  //   await collection.insertMany([{ a: 3, b: undefined }]);
  //
  //   const item2 = await collection.findOne({ a: 3 });
  //   test.equal(3, item2.a);
  //   test.ok(item2.b === undefined);
  //   await client.close();
  // });

  it('Should correctly update document ignoring undefined field', async function () {
    const configuration = this.configuration;
    const client = configuration.newClient(configuration.writeConcernMax(), {
      maxPoolSize: 1,
      ignoreUndefined: true
    });

    const db = client.db(configuration.db);
    const collection = db.collection('shouldCorrectlyIgnoreUndefinedValue2');

    const id1 = new ObjectId();
    await collection.updateOne(
      { _id: id1, a: 1, b: undefined },
      { $set: { a: 1, b: undefined } },
      { upsert: true }
    );
    const item1 = await collection.findOne({ _id: id1 });
    test.equal(1, item1.a);
    test.ok(item1.b === undefined);

    const id2 = new ObjectId();
    await collection.updateMany(
      { _id: id2, a: 1, b: undefined },
      { $set: { a: 1, b: undefined } },
      { upsert: true }
    );
    const item2 = await collection.findOne({ _id: id2 });
    test.equal(1, item2.a);
    test.ok(item2.b === undefined);

    await client.close();
  });

  it('should correctly inherit ignore undefined field from db during insert', async function () {
    const configuration = this.configuration;
    const client = configuration.newClient(configuration.writeConcernMax(), {
      maxPoolSize: 1,
      ignoreUndefined: false
    });

    const db = client.db(configuration.db, { ignoreUndefined: true });
    const collection = db.collection('shouldCorrectlyIgnoreUndefinedValue3');

    await collection.insertOne({ a: 1, b: undefined });
    const item = await collection.findOne();
    expect(item).to.have.property('a', 1);
    expect(item).to.not.have.property('b');

    await client.close();
  });

  it('should correctly inherit ignore undefined field from collection during insert', async function () {
    const db = client.db('shouldCorrectlyIgnoreUndefinedValue4', { ignoreUndefined: false });
    const collection = db.collection('shouldCorrectlyIgnoreUndefinedValue4', {
      ignoreUndefined: true
    });

    // Ignore the undefined field
    await collection.insertOne({ a: 1, b: undefined });

    const item = await collection.findOne();
    expect(item).to.have.property('a', 1);
    expect(item).to.not.have.property('b');
  });

  it('Should correctly inherit ignore undefined field from operation during insert', async function () {
    const db = client.db('shouldCorrectlyIgnoreUndefinedValue5');
    const collection = db.collection('shouldCorrectlyIgnoreUndefinedValue5', {
      ignoreUndefined: false
    });

    // Ignore the undefined field
    await collection.insertOne({ a: 1, b: undefined }, { ignoreUndefined: true });

    const item = await collection.findOne({});
    expect(item).to.have.property('a', 1);
    expect(item).to.not.have.property('b');
  });

  it('Should correctly inherit ignore undefined field from operation during findOneAndReplace', async function () {
    const db = client.db('shouldCorrectlyIgnoreUndefinedValue6');
    const collection = db.collection('shouldCorrectlyIgnoreUndefinedValue6', {
      ignoreUndefined: false
    });

    await collection.insertOne({ a: 1, b: 2 });

    // Replace the doument, ignoring undefined fields
    await collection.findOneAndReplace({}, { a: 1, b: undefined }, { ignoreUndefined: true });

    const item = await collection.findOne();
    expect(item).to.have.property('a', 1);
    expect(item).to.not.have.property('b');
  });

  it('Should correctly ignore undefined field during bulk write', async function () {
    const db = client.db('shouldCorrectlyIgnoreUndefinedValue7');
    const collection = db.collection('shouldCorrectlyIgnoreUndefinedValue7');

    // Ignore the undefined field
    await collection.bulkWrite([{ insertOne: { document: { a: 1, b: undefined } } }], {
      ignoreUndefined: true
    });

    const item = await collection.findOne();
    expect(item).to.have.property('a', 1);
    expect(item).to.not.have.property('b');
  });

  describe('ignoreUndefined A server', function () {
    it('should correctly execute insert culling undefined', async function () {
      const coll = client.db().collection('insert1');
      await coll.drop();
      const objectId = new ObjectId();
      const res = await coll.insertOne(
        { _id: objectId, a: 1, b: undefined },
        { ignoreUndefined: true }
      );
      expect(res).property('insertedId').to.exist;

      const cursor = coll.find({ _id: objectId });

      const doc = await cursor.next();
      expect(doc).to.not.have.property('b');
    });

    it('should correctly execute update culling undefined', async function () {
      const coll = client.db().collection('update1');
      await coll.drop();
      const objectId = new ObjectId();
      const res = await coll.updateOne(
        { _id: objectId, a: 1, b: undefined },
        { $set: { a: 1, b: undefined } },
        { ignoreUndefined: true, upsert: true }
      );
      expect(res).property('upsertedCount').to.equal(1);

      const cursor = coll.find({ _id: objectId });

      const doc = await cursor.next();
      expect(doc).to.not.have.property('b');
    });

    it('should correctly execute remove culling undefined', async function () {
      const coll = client.db().collection('remove1');
      await coll.drop();
      const objectId = new ObjectId();
      const res = await coll.insertMany([
        { id: objectId, a: 1, b: undefined },
        { id: objectId, a: 2, b: 1 }
      ]);
      expect(res).property('insertedCount').to.equal(2);

      const res2 = await coll.deleteMany({ b: undefined }, { ignoreUndefined: true });
      expect(res2).property('deletedCount').to.equal(2);
    });

    it('should correctly execute remove not culling undefined', async function () {
      const coll = client.db().collection('remove1');
      await coll.drop();
      const objectId = new ObjectId();
      const res = await coll.insertMany([
        { id: objectId, a: 1, b: undefined },
        { id: objectId, a: 2, b: 1 }
      ]);
      expect(res).property('insertedCount').to.equal(2);

      const res2 = await coll.deleteMany({ b: null });
      expect(res2).property('deletedCount').to.equal(1);
    });
  });
});
