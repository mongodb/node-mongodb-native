import { expect } from 'chai';

import type { UnifiedMongoClient } from '../../../tools/unified-spec-runner/entities';

describe('Bulk executeOperation', () => {
  let client: UnifiedMongoClient;
  beforeEach(async function () {
    client = await this.configuration.client({
      entityDescription: {
        observeEvents: ['commandStartedEvent']
      }
    });
  });
  afterEach(async () => {
    await client?.close();
  });

  it('should use the same session for every operation', async () => {
    const collection = client.db().collection('bulk_execute_operation');
    const batch = collection.initializeOrderedBulkOp();

    batch.insert({ a: 1 });
    batch.find({ a: 1 }).update({ $set: { b: 1 } });
    batch.find({ b: 1 }).deleteOne();

    await batch.execute();

    const events = client.commandStartedEvents();

    expect(events).to.have.lengthOf(3);
    const sessions = events.map(ev => ev.command.lsid.id.toString('hex'));
    expect(new Set(sessions)).to.have.property('size', 1);
  });
});
