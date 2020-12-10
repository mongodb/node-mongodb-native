'use strict';
const { expect } = require('chai');
const { setupDatabase, withClientV2 } = require('../shared');

describe('Tailable cursor tests', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('should correctly perform awaitData', {
    metadata: { requires: { mongodb: '>=3.2' } },
    test: withClientV2((client, done) => {
      const db = client.db();
      db.collection('cursor_tailable').drop(() => {
        db.createCollection('cursor_tailable', { capped: true, size: 10000 }, (err, coll) => {
          expect(err).to.not.exist;

          coll.insertOne({ a: 1 }, (err, res) => {
            expect(err).to.not.exist;
            expect(res).property('insertedId').to.exist;

            const cursor = coll.find({}, { batchSize: 2, tailable: true, awaitData: true });
            cursor.next((err, doc) => {
              expect(err).to.not.exist;
              expect(doc).to.exist;

              const s = new Date();
              cursor.next(() => {
                const e = new Date();
                expect(e.getTime() - s.getTime()).to.be.at.least(300);

                done();
              });

              setTimeout(() => cursor.close(), 300);
            });
          });
        });
      });
    })
  });
});
