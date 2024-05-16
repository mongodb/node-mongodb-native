'use strict';
const { setupDatabase } = require('../shared');
const chai = require('chai');

const expect = chai.expect;
const sinonChai = require('sinon-chai');
const { MongoServerError } = require('../../mongodb');

chai.use(sinonChai);
describe('Errors', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });
  let client;

  beforeEach(function () {
    client = this.configuration.newClient(this.configuration.writeConcernMax(), { maxPoolSize: 1 });
    return client.connect();
  });

  afterEach(function () {
    return client.close();
  });

  it('should fail insert due to unique index', function (done) {
    const db = client.db(this.configuration.db);
    db.createCollection('test_failing_insert_due_to_unique_index', (err, collection) => {
      expect(err).to.not.exist;
      collection.createIndexes(
        [
          {
            name: 'test_failing_insert_due_to_unique_index',
            key: { a: 1 },
            unique: true
          }
        ],
        { writeConcern: { w: 1 } },
        err => {
          expect(err).to.not.exist;
          collection.insertOne({ a: 2 }, { writeConcern: { w: 1 } }, err => {
            expect(err).to.not.exist;
            collection.insertOne({ a: 2 }, { writeConcern: { w: 1 } }, err => {
              expect(err.code).to.equal(11000);
              done();
            });
          });
        }
      );
    });
  });

  it('should fail insert due to unique index strict', function (done) {
    const db = client.db(this.configuration.db);
    db.dropCollection('test_failing_insert_due_to_unique_index_strict', () => {
      db.createCollection('test_failing_insert_due_to_unique_index_strict', err => {
        expect(err).to.not.exist;
        const collection = db.collection('test_failing_insert_due_to_unique_index_strict');
        collection.createIndexes(
          [
            {
              name: 'test_failing_insert_due_to_unique_index_strict',
              key: { a: 1 },
              unique: true
            }
          ],
          { writeConcern: { w: 1 } },
          err => {
            expect(err).to.not.exist;
            collection.insertOne({ a: 2 }, { writeConcern: { w: 1 } }, err => {
              expect(err).to.not.exist;
              collection.insertOne({ a: 2 }, { writeConcern: { w: 1 } }, err => {
                expect(err.code).to.equal(11000);
                done();
              });
            });
          }
        );
      });
    });
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
