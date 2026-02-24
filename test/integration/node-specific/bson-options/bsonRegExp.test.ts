import { expect } from 'chai';

import { BSONRegExp, type MongoClient } from '../../../mongodb';

describe('BSONRegExp', () => {
  describe('bsonRegExp option', () => {
    // define client and option for tests to use
    let client: MongoClient;
    const option = { bsonRegExp: true };
    for (const passOptionTo of ['client', 'db', 'collection', 'operation']) {
      it(`should respond with BSONRegExp class with option passed to ${passOptionTo}`, async function () {
        try {
          client = this.configuration.newClient(passOptionTo === 'client' ? option : undefined);
          await client.connect();

          const db = client.db('bson_regex_db', passOptionTo === 'db' ? option : undefined);
          const collection = db.collection(
            'bson_regex_coll',
            passOptionTo === 'collection' ? option : undefined
          );

          await collection.insertOne({ regex: new BSONRegExp('abc', 'imx') });
          const res = await collection.findOne(
            { regex: new BSONRegExp('abc', 'imx') },
            passOptionTo === 'operation' ? option : undefined
          );

          expect(res).has.property('regex').that.is.instanceOf(BSONRegExp);
        } finally {
          await client.close();
        }
      });
    }
  });
});
