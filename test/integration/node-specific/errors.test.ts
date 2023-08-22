import { expect } from 'chai';

import { MongoClient, MongoServerSelectionError } from '../../mongodb';

describe('Error (Integration)', function () {
  it('NODE-5296: handles aggregate errors from dns lookup', async function () {
    const error = await MongoClient.connect('mongodb://localhost:27222', {
      serverSelectionTimeoutMS: 1000
    }).catch(e => e);
    expect(error).to.be.instanceOf(MongoServerSelectionError);
    expect(error.message).not.to.be.empty;
  });
});
