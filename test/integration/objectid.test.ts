import { expect } from 'chai';

import { type Collection, type Db, type MongoClient, ObjectId } from '../../src';
import { sleep } from '../tools/utils';
// TODO(NODE-4989): Improve these tests, likely can be made unit tests, or migrated to CRUD coverage (find oid range)
describe('ObjectId', function () {
  let client: MongoClient;
  let collection: Collection<{
    name: string;
  }>;
  let commandStartedEvents;
  let commandSucceededEvents;

  beforeEach(async function () {
    client = this.configuration.newClient({ monitorCommands: true });
    await client
      .db()
      .collection('oid_test')
      .drop()
      .catch(() => null);
    collection = client.db().collection('oid_test');
    commandStartedEvents = [];
    commandSucceededEvents = [];
    client.on('commandStarted', e => commandStartedEvents.push(e));
    client.on('commandSucceeded', e => commandSucceededEvents.push(e));
  });

  afterEach(async function () {
    await client.close();
  });

  it('generated objectId returns inserted document when cloned via hex string', async function () {
    const { insertedId } = await collection.insertOne({ name: 'toph' });
    expect(insertedId).to.have.property('_bsontype', 'ObjectId');
    const found = await collection.findOne({ _id: new ObjectId(insertedId.toHexString()) });
    expect(found).to.have.property('name', 'toph');
    expect(found).to.have.property('_id');
    expect(found?._id.toHexString()).to.equal(insertedId.toHexString());
  });

  it('ObjectId toString returns 24 character string', () => {
    const objectId = new ObjectId();
    expect(objectId.toString()).to.have.lengthOf(24);
  });

  it('ObjectId toJSON returns 24 character string', function () {
    const objectId = new ObjectId();
    expect(objectId.toJSON()).to.have.lengthOf(24);
  });

  it('Date can be used as a primary key _id', async function () {
    // This has nothing to do with ObjectId
    const configuration = this.configuration;
    const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
    const db: Db = client.db(configuration.db);
    const collection = db.collection<{
      _id: Date;
    }>('test_non_oid_id');
    const date = new Date();
    date.setUTCDate(12);
    date.setUTCFullYear(2009);
    date.setUTCMonth(11 - 1);
    date.setUTCHours(12);
    date.setUTCMinutes(0);
    date.setUTCSeconds(30);
    await collection.insertOne({ _id: date }, { writeConcern: { w: 1 } });
    const items = await collection.find({ _id: date }).toArray();
    expect('' + date).to.equal('' + items[0]._id);
    // Let's close the db
    await client.close();
  });

  it('getTimestamp should return date equal to input Date', function () {
    const date = new Date();
    // ObjectId timestamp is only in seconds
    date.setMilliseconds(0);
    const epochSeconds = date.getTime() / 1000;
    const oid = new ObjectId(epochSeconds);
    const time = oid.getTimestamp();
    expect(time).to.deep.equal(date);
    expect(time.getTime() / 1000).to.deep.equal(epochSeconds);
  });

  it('range query based on objectId timestamp', async () => {
    const oid1 = new ObjectId();
    await sleep(1000);
    const oid2 = new ObjectId();
    await sleep(1000);
    const oid3 = new ObjectId();
    const collection = client.db().collection<{
      _id: ObjectId;
    }>('oid_range');
    await collection.drop().catch(() => null);
    // Insertion intentionally out of order, we want to filter out 3 with a range query
    await collection.insertMany([{ _id: oid1 }, { _id: oid3 }, { _id: oid2 }]);
    // Greater than or equal to the time in oid1
    const $gte = ObjectId.createFromTime(oid1.getTimestamp().getTime() / 1000);
    // Strictly less than the time in oid3
    const $lt = ObjectId.createFromTime(oid3.getTimestamp().getTime() / 1000);
    const found = await collection.find({ _id: { $gte, $lt } }).toArray();
    expect(found).to.have.lengthOf(2);
    expect(found).to.have.deep.nested.property('[0]._id', oid1);
    expect(found).to.have.deep.nested.property('[1]._id', oid2);
  });

  it('timestamp section of ObjectId should translate to Date', async function () {
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
    const date1 = items[0]._id.getTimestamp();
    // Date 2
    const date2 = items[1]._id.getTimestamp();
    // Compare
    expect(firstCompareDate.getFullYear()).to.equal(date1.getFullYear());
    expect(firstCompareDate.getDate()).to.equal(date1.getDate());
    expect(firstCompareDate.getMonth()).to.equal(date1.getMonth());
    expect(firstCompareDate.getHours()).to.equal(date1.getHours());
    expect(secondCompareDate.getFullYear()).to.equal(date2.getFullYear());
    expect(secondCompareDate.getDate()).to.equal(date2.getDate());
    expect(secondCompareDate.getMonth()).to.equal(date2.getMonth());
    expect(secondCompareDate.getHours()).to.equal(date2.getHours());
    // Let's close the db
    await client.close();
  });
});
