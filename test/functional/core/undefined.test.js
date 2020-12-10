'use strict';

const { expect } = require('chai');
const { ObjectId } = require('bson');
const { withClientV2 } = require('../shared');

describe('A server', function () {
  it('should correctly execute insert culling undefined', {
    metadata: { requires: { mongodb: '>=3.2' } },
    test: withClientV2(function (client, done) {
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
    })
  });

  it('should correctly execute update culling undefined', {
    metadata: { requires: { mongodb: '>=3.2' } },
    test: withClientV2(function (client, done) {
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
    })
  });

  it('should correctly execute remove culling undefined', {
    metadata: { requires: { mongodb: '>=3.2' } },
    test: withClientV2(function (client, done) {
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

            coll.removeMany({ b: undefined }, { ignoreUndefined: true }, (err, res) => {
              expect(err).to.not.exist;
              expect(res).property('deletedCount').to.equal(2);
              done();
            });
          }
        );
      });
    })
  });

  it('should correctly execute remove not culling undefined', {
    metadata: { requires: { mongodb: '>=3.2' } },
    test: withClientV2(function (client, done) {
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

            coll.removeMany({ b: null }, (err, res) => {
              expect(err).to.not.exist;
              expect(res).property('deletedCount').to.equal(1);
              done();
            });
          }
        );
      });
    })
  });
});
