import { expect } from 'chai';

import { MongoError, MongoServerError, TopologyType } from '../../../src';

describe('Retryable Writes Spec Prose', () => {
  /**
   * 1 Test that retryable writes raise an exception when using the MMAPv1 storage engine.
   * For this test, execute a write operation, such as insertOne, which should generate an exception and the error code is 20.
   * Assert that the error message is the replacement error message:
   *
   * ```
   * This MongoDB deployment does not support retryable writes. Please add
   * retryWrites=false to your connection string.
   * ```
   * Note: Drivers that rely on serverStatus to determine the storage engine in use MAY skip this test for sharded clusters, since mongos does not report this information in its serverStatus response.
   */
  let client;

  beforeEach(async function () {
    if (
      this.configuration.buildInfo.versionArray[0] < 4 ||
      this.configuration.topologyType !== TopologyType.ReplicaSetWithPrimary
    ) {
      this.currentTest.skipReason =
        'configureFailPoint only works on server versions greater than 4';
      this.skip();
    }
    client = this.configuration.newClient();
    await client.connect();
  });

  afterEach(async () => {
    await client?.close();
  });

  it('retryable writes raise an exception when using the MMAPv1 storage engine', async () => {
    const failPoint = await client.db('admin').command({
      configureFailPoint: 'failCommand',
      mode: { times: 1 },
      data: {
        failCommands: ['insert'],
        errorCode: 20, // MMAP Error code,
        closeConnection: false
      }
    });

    expect(failPoint).to.have.property('ok', 1);

    const error = await client
      .db('test')
      .collection('test')
      .insertOne({ a: 1 })
      .catch(error => error);

    expect(error).to.exist;
    expect(error).that.is.instanceOf(MongoServerError);
    expect(error).to.have.property('originalError').that.instanceOf(MongoError);
    expect(error.originalError).to.have.property('code', 20);
    expect(error).to.have.property(
      'message',
      'This MongoDB deployment does not support retryable writes. Please add retryWrites=false to your connection string.'
    );
  });
});
