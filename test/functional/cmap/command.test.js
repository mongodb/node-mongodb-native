import { BSONRegExp } from 'bson';
import { expect } from 'chai';
import { spy } from 'sinon';
import { deserialize } from 'bson';

describe.only('class BinMsg', () => {
  describe('enableUtf8Validation option', () => {
    // define client and option for tests to use
    let client;
    const option = { enableUtf8Validation: true };
    // for (const passOptionTo of ['client', 'db', 'collection', 'operation']) {
    for (const passOptionTo of ['client']) {
      it(`should respond with BSONRegExp class with option passed to ${passOptionTo}`, async function () {
        const serializeSpy = spy(deserialize);
        try {
          client = this.configuration.newClient(passOptionTo === 'client' ? option : undefined);
          await client.connect();

          const db = client.db('bson_regex_db', passOptionTo === 'db' ? option : undefined);
          const collection = db.collection(
            'bson_regex_coll',
            passOptionTo === 'collection' ? option : undefined
          );

          await collection.insertOne({ regex: new BSONRegExp('abc', 'imx') });

          await collection.find();

          // const result = serializeSpy.lastCall;
          expect(serializeSpy.called).to.be.true;
          console.error(serializeSpy.called);
          //   expect(serializeSpy.getCall(0).args).to.deep.equal({ utf8: { writeErrors: false } });
          expect(true).to.be.true;
        } finally {
          await client.close();
        }
      });
    }
  });
});
