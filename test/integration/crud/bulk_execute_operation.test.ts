import { expect } from 'chai';

describe('Bulk executeOperation', () => {
  let client;

  beforeEach(function () {
    client = this.configuration.newClient({ monitorCommands: true });
  });

  afterEach(async () => {
    await client?.close();
  });

  it('should use the same session for every operation', async () => {
    const collection = client.db().collection('bulk_execute_operation');

    // TODO(NODE-4263): Legacy bulk operations require connecting invocation
    await client.db().command({ ping: 1 });

    const batch = collection.initializeOrderedBulkOp();

    const events = [];
    client.on('commandStarted', ev => events.push(ev));

    batch.insert({ a: 1 });
    batch.find({ a: 1 }).update({ $set: { b: 1 } });
    batch.find({ b: 1 }).deleteOne();

    await batch.execute();

    expect(events).to.have.lengthOf(3);
    const sessions = events.map(ev => ev.command.lsid.id.toString('hex'));
    expect(new Set(sessions)).to.have.property('size', 1);
  });
});
