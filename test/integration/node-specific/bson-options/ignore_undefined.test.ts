import { expect } from 'chai';

import { type MongoClient, ObjectId } from '../../../mongodb';
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

  it('Should correctly insert document ignoring undefined field', {
    metadata: { requires: { topology: ['single'] } },

    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1,
        ignoreUndefined: true
      });

      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        const collection = db.collection('shouldCorrectlyIgnoreUndefinedValue');

        // Ignore the undefined field
        collection.insert({ a: 1, b: undefined }, configuration.writeConcernMax(), function (err) {
          expect(err).to.not.exist;

          // Locate the doument
          collection.findOne(function (err, item) {
            test.equal(1, item.a);
            test.ok(item.b === undefined);
            client.close(done);
          });
        });
      });
    }
  });

  it(
    'Should correctly connect using MongoClient and perform insert document ignoring undefined field',
    {
      metadata: { requires: { topology: ['single'] } },

      test: function (done) {
        const configuration = this.configuration;
        const client = configuration.newClient(
          {},
          {
            ignoreUndefined: true
          }
        );

        client.connect(function (err, client) {
          const db = client.db(configuration.db);
          const collection = db.collection('shouldCorrectlyIgnoreUndefinedValue1');
          collection.insert({ a: 1, b: undefined }, function (err) {
            expect(err).to.not.exist;

            collection.findOne(function (err, item) {
              test.equal(1, item.a);
              test.ok(item.b === undefined);

              collection.insertOne({ a: 2, b: undefined }, function (err) {
                expect(err).to.not.exist;

                collection.findOne({ a: 2 }, function (err, item) {
                  test.equal(2, item.a);
                  test.ok(item.b === undefined);

                  collection.insertMany([{ a: 3, b: undefined }], function (err) {
                    expect(err).to.not.exist;

                    collection.findOne({ a: 3 }, function (err, item) {
                      test.equal(3, item.a);
                      test.ok(item.b === undefined);
                      client.close(done);
                    });
                  });
                });
              });
            });
          });
        });
      }
    }
  );

  it('Should correctly update document ignoring undefined field', {
    metadata: { requires: { topology: ['single'] } },

    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1,
        ignoreUndefined: true
      });

      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        const collection = db.collection('shouldCorrectlyIgnoreUndefinedValue2');
        const id = new ObjectId();

        collection.updateOne(
          { _id: id, a: 1, b: undefined },
          { $set: { a: 1, b: undefined } },
          { upsert: true },
          function (err) {
            expect(err).to.not.exist;
            collection.findOne({ _id: id }, function (err, item) {
              test.equal(1, item.a);
              test.ok(item.b === undefined);
              const id = new ObjectId();

              collection.updateMany(
                { _id: id, a: 1, b: undefined },
                { $set: { a: 1, b: undefined } },
                { upsert: true },
                function (err) {
                  expect(err).to.not.exist;
                  collection.findOne({ _id: id }, function (err, item) {
                    test.equal(1, item.a);
                    test.ok(item.b === undefined);
                    const id = new ObjectId();

                    collection.update(
                      { _id: id, a: 1, b: undefined },
                      { $set: { a: 1, b: undefined } },
                      { upsert: true },
                      function (err) {
                        expect(err).to.not.exist;
                        collection.findOne({ _id: id }, function (err, item) {
                          test.equal(1, item.a);
                          test.ok(item.b === undefined);
                          client.close(done);
                        });
                      }
                    );
                  });
                }
              );
            });
          }
        );
      });
    }
  });

  it('Should correctly inherit ignore undefined field from db during insert', async function () {
    const configuration = this.configuration;
    const client = configuration.newClient(configuration.writeConcernMax(), {
      maxPoolSize: 1,
      ignoreUndefined: false
    });

    const db = client.db(configuration.db, { ignoreUndefined: true });
    const collection = db.collection('shouldCorrectlyIgnoreUndefinedValue3');

    await collection.insert({ a: 1, b: undefined });
    const item = await collection.findOne();
    expect(item).to.have.property('a', 1);
    expect(item).to.not.have.property('b');

    await client.close();
  });

  it('Should correctly inherit ignore undefined field from collection during insert', function (done) {
    const db = client.db('shouldCorrectlyIgnoreUndefinedValue4', { ignoreUndefined: false });
    const collection = db.collection('shouldCorrectlyIgnoreUndefinedValue4', {
      ignoreUndefined: true
    });

    // Ignore the undefined field
    collection.insert({ a: 1, b: undefined }, err => {
      expect(err).to.not.exist;

      // Locate the doument
      collection.findOne((err, item) => {
        expect(err).to.not.exist;
        expect(item).to.have.property('a', 1);
        expect(item).to.not.have.property('b');
        done();
      });
    });
  });

  it('Should correctly inherit ignore undefined field from operation during insert', function (done) {
    const db = client.db('shouldCorrectlyIgnoreUndefinedValue5');
    const collection = db.collection('shouldCorrectlyIgnoreUndefinedValue5', {
      ignoreUndefined: false
    });

    // Ignore the undefined field
    collection.insert({ a: 1, b: undefined }, { ignoreUndefined: true }, err => {
      expect(err).to.not.exist;

      // Locate the doument
      collection.findOne({}, (err, item) => {
        expect(err).to.not.exist;
        expect(item).to.have.property('a', 1);
        expect(item).to.not.have.property('b');
        done();
      });
    });
  });

  it('Should correctly inherit ignore undefined field from operation during findOneAndReplace', function (done) {
    const db = client.db('shouldCorrectlyIgnoreUndefinedValue6');
    const collection = db.collection('shouldCorrectlyIgnoreUndefinedValue6', {
      ignoreUndefined: false
    });

    collection.insert({ a: 1, b: 2 }, err => {
      expect(err).to.not.exist;

      // Replace the doument, ignoring undefined fields
      collection.findOneAndReplace({}, { a: 1, b: undefined }, { ignoreUndefined: true }, err => {
        expect(err).to.not.exist;

        // Locate the doument
        collection.findOne((err, item) => {
          expect(err).to.not.exist;
          expect(item).to.have.property('a', 1);
          expect(item).to.not.have.property('b');
          done();
        });
      });
    });
  });

  it('Should correctly ignore undefined field during bulk write', function (done) {
    const db = client.db('shouldCorrectlyIgnoreUndefinedValue7');
    const collection = db.collection('shouldCorrectlyIgnoreUndefinedValue7');

    // Ignore the undefined field
    collection.bulkWrite(
      [{ insertOne: { a: 1, b: undefined } }],
      { ignoreUndefined: true },
      err => {
        expect(err).to.not.exist;

        // Locate the doument
        collection.findOne((err, item) => {
          expect(err).to.not.exist;
          expect(item).to.have.property('a', 1);
          expect(item).to.not.have.property('b');
          done();
        });
      }
    );
  });

  describe('ignoreUndefined A server', function () {
    it('should correctly execute insert culling undefined', {
      metadata: { requires: { mongodb: '>=3.2' } },
      test: function (done) {
        const coll = client.db().collection('insert1');
        coll.drop(() => {
          const objectId = new ObjectId();
          coll.insertOne(
            { _id: objectId, a: 1, b: undefined },
            { ignoreUndefined: true },
            (err, res) => {
              expect(err).to.not.exist;
              expect(res).property('insertedId').to.exist;

              const cursor = coll.find({ _id: objectId });
              this.defer(() => cursor.close());

              cursor.next((err, doc) => {
                expect(err).to.not.exist;
                expect(doc).to.not.have.property('b');
                done();
              });
            }
          );
        });
      }
    });

    it('should correctly execute update culling undefined', {
      metadata: { requires: { mongodb: '>=3.2' } },
      test: function (done) {
        const coll = client.db().collection('update1');
        coll.drop(() => {
          const objectId = new ObjectId();
          coll.updateOne(
            { _id: objectId, a: 1, b: undefined },
            { $set: { a: 1, b: undefined } },
            { ignoreUndefined: true, upsert: true },
            (err, res) => {
              expect(err).to.not.exist;
              expect(res).property('upsertedCount').to.equal(1);

              const cursor = coll.find({ _id: objectId });
              this.defer(() => cursor.close());

              cursor.next((err, doc) => {
                expect(err).to.not.exist;
                expect(doc).to.not.have.property('b');
                done();
              });
            }
          );
        });
      }
    });

    it('should correctly execute remove culling undefined', {
      metadata: { requires: { mongodb: '>=3.2' } },
      test: function (done) {
        const coll = client.db().collection('remove1');
        coll.drop(() => {
          const objectId = new ObjectId();
          coll.insertMany(
            [
              { id: objectId, a: 1, b: undefined },
              { id: objectId, a: 2, b: 1 }
            ],
            (err, res) => {
              expect(err).to.not.exist;
              expect(res).property('insertedCount').to.equal(2);

              coll.deleteMany({ b: undefined }, { ignoreUndefined: true }, (err, res) => {
                expect(err).to.not.exist;
                expect(res).property('deletedCount').to.equal(2);
                done();
              });
            }
          );
        });
      }
    });

    it('should correctly execute remove not culling undefined', {
      metadata: { requires: { mongodb: '>=3.2' } },
      test: function (done) {
        const coll = client.db().collection('remove1');
        coll.drop(() => {
          const objectId = new ObjectId();
          coll.insertMany(
            [
              { id: objectId, a: 1, b: undefined },
              { id: objectId, a: 2, b: 1 }
            ],
            (err, res) => {
              expect(err).to.not.exist;
              expect(res).property('insertedCount').to.equal(2);

              coll.deleteMany({ b: null }, (err, res) => {
                expect(err).to.not.exist;
                expect(res).property('deletedCount').to.equal(1);
                done();
              });
            }
          );
        });
      }
    });
  });
});
