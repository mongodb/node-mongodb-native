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
        const close = e => client.close().then(() => done(e));
        let collection;

        client
          .connect()
          .then(() => client.db('bson_regex_db', passOptionTo === 'db' ? option : undefined))
          .then(db =>
            db.collection('bson_regex_coll', passOptionTo === 'collection' ? option : undefined)
          )
          .then(coll => {
            collection = coll;
            collection.insertOne({ regex: new BSONRegExp('abc', 'imx') });
          })
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
          .finally(() => close());
        // .catch(e => done(e));
      });

      // it(`should respond with BSONRegExp class with option passed to ${passOptionTo}`, async function() {
      //   try {
      //     client = this.configuration.newClient(passOptionTo === 'client' ? option : undefined);
      //     await client.connect();

      //     const db = client.db('bson_regex_db', passOptionTo === 'db' ? option : undefined);
      //     const collection = db.collection(
      //       'bson_regex_coll',
      //       passOptionTo === 'collection' ? option : undefined
      //     );

      //     await collection.insertOne({ regex: new BSONRegExp('abc', 'imx') });
      //     const res = await collection.findOne(
      //       { regex: new BSONRegExp('abc', 'imx') },
      //       passOptionTo === 'operation' ? option : undefined
      //     );

      //     expect(res)
      //       .has.property('regex')
      //       .that.is.instanceOf(BSONRegExp);
      //   } finally {
      //     await client.close();
      //   }
      // });
    }
  });
});
