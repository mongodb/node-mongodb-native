'use strict';

const expect = require('chai').expect;
const BSONRegExp = require('bson').BSONRegExp;

describe('BSONRegExp', () => {
  describe('bsonRegExp option', () => {
    // define option for tests to use
    const option = { bsonRegExp: true };
    for (const passOptionTo of ['client', 'db', 'collection', 'operation']) {
      it(`should respond with BSONRegExp class with option passed to ${passOptionTo}`, function(done) {
        const client = this.configuration.newClient(passOptionTo === 'client' ? option : undefined);
        let collection;

        client
          .connect()
          .then(() => {
            const db = client.db('bson_regex_db', passOptionTo === 'db' ? option : undefined);
            collection = db.collection(
              'bson_regex_coll',
              passOptionTo === 'collection' ? option : undefined
            );
          })
          .then(() => collection.insertOne({ regex: new BSONRegExp('abc', 'imx') }))
          .then(() =>
            collection.findOne(
              { regex: new BSONRegExp('abc', 'imx') },
              passOptionTo === 'operation' ? option : undefined
            )
          )
          .then(res =>
            expect(res)
              .has.property('regex')
              .that.is.instanceOf(BSONRegExp)
          )
          .then(
            () => client.close(done),
            err => client.close(() => done(err))
          );
      });
    }
  });
});
