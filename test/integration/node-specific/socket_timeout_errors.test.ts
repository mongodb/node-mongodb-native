import { expect } from 'chai';

import { MongoClient, MongoNetworkTimeoutError } from '../../../src';
import { LEGACY_HELLO_COMMAND } from '../../../src/constants';
import { FailPoint, sleep } from '../../tools/utils';

describe('new Connection()', () => {
  let client: MongoClient;
  beforeEach(async function () {
    client = await this.configuration
      .newClient({
        connectTimeoutMS: 10,
        heartBeatFrequencyMS: 40,
        minHeartBeatFrequencyMS: 30
      })
      .connect();
  });

  afterEach(async () => {
    await client?.close();
  });

  const failPoint: FailPoint = {
    configureFailPoint: 'failCommand',
    mode: { times: 1 },
    data: {
      failCommands: ['hello', LEGACY_HELLO_COMMAND],
      blockConnection: true,
      blockTimeMS: 60
    }
  };

  it('should still handle timeout errors even when they are delayed', async function () {
    const failureEvents = [];
    client.on('serverHeartbeatFailed', failEvent => failureEvents.push(failEvent));

    await client.db().admin().command(failPoint);

    await sleep(80);

    expect(failureEvents).to.have.lengthOf.at.least(1);
    expect(failureEvents[0])
      .to.have.property('failure')
      .that.is.instanceOf(MongoNetworkTimeoutError);

    await client
      .db()
      .admin()
      .command({ ...failPoint, mode: 'off' });
  });
});
