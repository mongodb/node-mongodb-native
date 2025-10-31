import { expect } from 'chai';

import { type MongoClient, MongoServerError } from '../../../src';
import { setupDatabase } from '../shared';

describe('Errors', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  let client: MongoClient;

  beforeEach(function () {
    client = this.configuration.newClient(this.configuration.writeConcernMax(), { maxPoolSize: 1 });
    return client.connect();
  });

  afterEach(function () {
    return client.close();
  });

  it('should fail insert due to unique index', async function () {
    const db = client.db(this.configuration.db);
    const collection = await db.createCollection('test_failing_insert_due_to_unique_index');
    await collection.createIndexes([
      {
        name: 'test_failing_insert_due_to_unique_index',
        key: { a: 1 },
        unique: true
      }
    ]);

    await collection.insertOne({ a: 2 }, { writeConcern: { w: 1 } });

    const err = await collection.insertOne({ a: 2 }, { writeConcern: { w: 1 } }).catch(err => err);
    expect(err).to.be.instanceOf(MongoServerError);
    expect(err.code).to.equal(11000);
  });

  const PROJECTION_ERRORS = new Set([
    'Projection cannot have a mix of inclusion and exclusion.',
    'Cannot do exclusion on field b in inclusion projection'
  ]);

  it('should return an error object with message when mixing included and excluded fields', async () => {
    const db = client.db();
    const c = db.collection('test_error_object_should_include_message');
    await c.insertOne({ a: 2, b: 5 }, { writeConcern: { w: 1 } });
    const error = await c.findOne({ a: 2 }, { projection: { a: 1, b: 0 } }).catch(error => error);
    expect(error).to.be.instanceOf(MongoServerError);
    expect(PROJECTION_ERRORS).to.include(error.errmsg);
  });

  it('should reject promise with projection errors', async () => {
    const db = client.db();
    const c = db.collection('test_error_object_should_include_message');
    const error = await c.findOne({}, { projection: { a: 1, b: 0 } }).catch(error => error);
    expect(error).to.be.instanceOf(MongoServerError);
    expect(PROJECTION_ERRORS).to.include(error.errmsg);
  });
});
