import { expect } from 'chai';
import { spy } from 'sinon';

import * as BSON from '../../../src/bson';

const deserializeSpy = spy(BSON, 'deserialize');

const EXPECTED_VALIDATION_DISABLED_ARGUMENT = {
  utf8: false
};

const EXPECTED_VALIDATION_ENABLED_ARGUMENT = {
  utf8: {
    writeErrors: false
  }
};

describe('class BinMsg', () => {
  beforeEach(() => {
    deserializeSpy.resetHistory();
  });

  describe('enableUtf8Validation option set to false', () => {
    let client;
    const option = { enableUtf8Validation: false };

    for (const passOptionTo of ['client', 'db', 'collection', 'operation']) {
      it(`should disable validation with option passed to ${passOptionTo}`, async function () {
        try {
          client = this.configuration.newClient(passOptionTo === 'client' ? option : undefined);
          await client.connect();

          const db = client.db(
            'bson_utf8Validation_db',
            passOptionTo === 'db' ? option : undefined
          );
          const collection = db.collection(
            'bson_utf8Validation_coll',
            passOptionTo === 'collection' ? option : undefined
          );

          await collection.insertOne(
            { name: 'John Doe' },
            passOptionTo === 'operation' ? option : {}
          );

          expect(deserializeSpy.called).to.be.true;
          const validationArgument = deserializeSpy.lastCall.lastArg.validation;
          expect(validationArgument).to.deep.equal(EXPECTED_VALIDATION_DISABLED_ARGUMENT);
        } finally {
          await client.close();
        }
      });
    }
  });

  describe('enableUtf8Validation option set to true', () => {
    // define client and option for tests to use
    let client;
    const option = { enableUtf8Validation: true };
    for (const passOptionTo of ['client', 'db', 'collection', 'operation']) {
      it(`should enable validation with option passed to ${passOptionTo}`, async function () {
        try {
          client = this.configuration.newClient(passOptionTo === 'client' ? option : undefined);
          await client.connect();

          const db = client.db(
            'bson_utf8Validation_db',
            passOptionTo === 'db' ? option : undefined
          );
          const collection = db.collection(
            'bson_utf8Validation_coll',
            passOptionTo === 'collection' ? option : undefined
          );

          await collection.insertOne(
            { name: 'John Doe' },
            passOptionTo === 'operation' ? option : {}
          );

          expect(deserializeSpy.called).to.be.true;
          const validationArgument = deserializeSpy.lastCall.lastArg.validation;
          expect(validationArgument).to.deep.equal(EXPECTED_VALIDATION_ENABLED_ARGUMENT);
        } finally {
          await client.close();
        }
      });
    }
  });

  describe('enableUtf8Validation option not set', () => {
    let client;
    const option = { enableUtf8Validation: true };
    for (const passOptionTo of ['client', 'db', 'collection', 'operation']) {
      it(`should default to enabled with option passed to ${passOptionTo}`, async function () {
        try {
          client = this.configuration.newClient(passOptionTo === 'client' ? option : undefined);
          await client.connect();

          const db = client.db(
            'bson_utf8Validation_db',
            passOptionTo === 'db' ? option : undefined
          );
          const collection = db.collection(
            'bson_utf8Validation_coll',
            passOptionTo === 'collection' ? option : undefined
          );

          await collection.insertOne(
            { name: 'John Doe' },
            passOptionTo === 'operation' ? option : {}
          );

          expect(deserializeSpy.called).to.be.true;
          const validationArgument = deserializeSpy.lastCall.lastArg.validation;
          expect(validationArgument).to.deep.equal(EXPECTED_VALIDATION_ENABLED_ARGUMENT);
        } finally {
          await client.close();
        }
      });
    }
  });
});
