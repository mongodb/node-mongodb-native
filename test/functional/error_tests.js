'use strict';
const setupDatabase = require('./shared').setupDatabase;
const chai = require('chai');
const expect = chai.expect;
const sinonChai = require('sinon-chai');
chai.use(sinonChai);

describe('Errors', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  it('should fail insert due to unique index', function(done) {
    const configuration = this.configuration;
    const client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
    client.connect((err, client) => {
      const db = client.db(configuration.db);
      const collection = db.collection('test_failing_insert_due_to_unique_index');
      collection.createIndexes(
        [
          {
            name: 'test_failing_insert_due_to_unique_index',
            key: { a: 1 },
            unique: true
          }
        ],
        { w: 1 },
        err => {
          expect(err).to.not.exist;

          collection.insertOne({ a: 2 }, { w: 1 }, err => {
            expect(err).to.not.exist;

            collection.insertOne({ a: 2 }, { w: 1 }, err => {
              expect(err.code).to.equal(11000);
              client.close(done);
            });
          });
        }
      );
    });
  });

  it('should fail insert due to unique index strict', function(done) {
    const configuration = this.configuration;
    const client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
    client.connect((err, client) => {
      const db = client.db(configuration.db);
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
              { w: 1 },
              err => {
                expect(err).to.not.exist;
                collection.insertOne({ a: 2 }, { w: 1 }, err => {
                  expect(err).to.not.exist;

                  collection.insertOne({ a: 2 }, { w: 1 }, err => {
                    expect(err.code).to.equal(11000);
                    client.close(done);
                  });
                });
              }
            );
          });
        });
      });
    });
  });

  it('should return an error object with message when mixing included and excluded fields', {
    metadata: { requires: { mongodb: '>3.0' } },
    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect((err, client) => {
        const db = client.db(configuration.db);
        const c = db.collection('test_error_object_should_include_message');
        c.insertOne({ a: 2, b: 5 }, { w: 1 }, err => {
          expect(err).to.not.exist;
          c.findOne({ a: 2 }, { fields: { a: 1, b: 0 } }, err => {
            expect(err.errmsg).to.equal('Projection cannot have a mix of inclusion and exclusion.');
            client.close(done);
          });
        });
      });
    }
  });

  it('should handle error throw in user callback', {
    metadata: { requires: { mongodb: '>3.0' } },
    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient({ w: 1 }, { poolSize: 1 });

      client.connect((err, client) => {
        const db = client.db(configuration.db);
        const c = db.collection('test_error_object_should_include_message');
        c.findOne({}, { fields: { a: 1, b: 0 } }, err => {
          expect(err.errmsg).to.equal('Projection cannot have a mix of inclusion and exclusion.');
          client.close(done);
        });
      });
    }
  });
});
