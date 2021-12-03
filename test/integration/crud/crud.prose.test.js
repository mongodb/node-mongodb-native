const { expect } = require('chai');
const { MongoBulkWriteError } = require('../../../src');

describe('CRUD Prose Spec Tests', () => {
  let client;

  beforeEach(async function () {
    client = this.configuration.newClient({ monitorCommands: true });
    await client.connect();
  });

  afterEach(async () => {
    if (client) {
      await client.close();
    }
  });

  // Note: This test does not fully implement the described test, it's missing command monitoring assertions
  it('2. WriteError.details exposes writeErrors[].errInfo', {
    metadata: { requires: { mongodb: '>=5.0.0' } },
    async test() {
      try {
        await client.db().collection('wc_details').drop();
      } catch {
        // don't care
      }

      const collection = await client
        .db()
        .createCollection('wc_details', { validator: { x: { $type: 'string' } } });

      try {
        await collection.insertMany([{ x: /not a string/ }]);
        expect.fail('The insert should fail the validation that x must be a string');
      } catch (error) {
        expect(error).to.be.instanceOf(MongoBulkWriteError);
        expect(error).to.have.property('code', 121);
        expect(error).to.have.property('writeErrors').that.is.an('array');
        expect(error.writeErrors[0]).to.have.property('errInfo').that.is.an('object');
      }
    }
  });
});
