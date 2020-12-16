'use strict';
const setupDatabase = require('./shared').setupDatabase;
const chai = require('chai');
const expect = chai.expect;
const sinonChai = require('sinon-chai');
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
    const collection = db.collection('test_failing_insert_due_to_unique_index');
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

  it('should fail insert due to unique index strict', function (done) {
    const db = client.db(this.configuration.db);
    db.dropCollection('test_failing_insert_due_to_unique_index_strict', () => {
      db.createCollection('test_failing_insert_due_to_unique_index_strict', err => {
        expect(err).to.not.exist;
        db.collection('test_failing_insert_due_to_unique_index_strict', (err, collection) => {
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
  });

  const PROJECTION_ERRORS = new Set([
    'Projection cannot have a mix of inclusion and exclusion.',
    'Cannot do exclusion on field b in inclusion projection'
  ]);

  it('should return an error object with message when mixing included and excluded fields', {
    metadata: { requires: { mongodb: '>3.0' } },
    test: function (done) {
      const db = client.db(this.configuration.db);
      const c = db.collection('test_error_object_should_include_message');
      c.insertOne({ a: 2, b: 5 }, { writeConcern: { w: 1 } }, err => {
        expect(err).to.not.exist;
        c.findOne({ a: 2 }, { projection: { a: 1, b: 0 } }, err => {
          expect(PROJECTION_ERRORS).to.include(err.errmsg);
          done();
        });
      });
    }
  });

  it('should handle error throw in user callback', {
    metadata: { requires: { mongodb: '>3.0' } },
    test: function (done) {
      const db = client.db(this.configuration.db);
      const c = db.collection('test_error_object_should_include_message');
      c.findOne({}, { projection: { a: 1, b: 0 } }, err => {
        expect(PROJECTION_ERRORS).to.include(err.errmsg);
        done();
      });
    }
  });
});
