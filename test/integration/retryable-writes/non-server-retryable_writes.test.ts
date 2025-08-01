import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  type Collection,
  type MongoClient,
  MongoWriteConcernError,
  PoolClearedError,
  Server
} from '../../mongodb';

describe('Non Server Retryable Writes', function () {
  let client: MongoClient;
  let collection: Collection<{ _id: 1 }>;

  beforeEach(async function () {
    client = this.configuration.newClient({ monitorCommands: true, retryWrites: true });
    await client
      .db()
      .collection('retryReturnsOriginal')
      .drop()
      .catch(() => null);
    collection = client.db().collection('retryReturnsOriginal');
  });

  afterEach(async function () {
    sinon.restore();
    await client.close();
  });

  it(
    'returns the original error with a PoolRequstedRetry label after encountering a WriteConcernError',
    { requires: { topology: 'replicaset' } },
    async () => {
      const serverCommandStub = sinon.stub(Server.prototype, 'modernCommand');
      serverCommandStub.onCall(0).rejects(new PoolClearedError('error'));
      serverCommandStub.onCall(1).returns(
        Promise.reject(
          new MongoWriteConcernError({
            errorLabels: ['NoWritesPerformed'],
            writeConcernError: { errmsg: 'NotWritablePrimary error', errorCode: 10107 }
          })
        )
      );

      const insertResult = await collection.insertOne({ _id: 1 }).catch(error => error);
      sinon.restore();

      expect(insertResult.errorLabels).to.be.deep.equal(['PoolRequstedRetry']);
    }
  );
});
