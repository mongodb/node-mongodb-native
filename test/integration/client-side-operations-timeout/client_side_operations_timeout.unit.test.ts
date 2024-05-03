/**
 * The following tests are described in CSOTs spec prose tests as "unit" tests
 * The tests enumerated in this section could not be expressed in either spec or prose format.
 * Drivers SHOULD implement these if it is possible to do so using the driver's existing test infrastructure.
 */

import { expect } from 'chai';
import * as sinon from 'sinon';

import { ConnectionPool, type MongoClient, Timeout, Topology } from '../../mongodb';

// TODO(NODE-5824): Implement CSOT prose tests
describe('CSOT spec unit tests', function () {
  let client: MongoClient;

  afterEach(async function () {
    sinon.restore();
    await client?.close();
  });

  it('Operations should ignore waitQueueTimeoutMS if timeoutMS is also set.', async function () {
    //
    client = this.configuration.newClient({ waitQueueTimeoutMS: 999999, timeoutMS: 200 });
    sinon.spy(Timeout, 'expires');

    await client.db('db').collection('collection').insertOne({ x: 1 });

    expect(Timeout.expires).to.have.been.calledWith(200);
    expect(Timeout.expires).to.not.have.been.calledWith(999999);
  });

  it('If timeoutMS is set for an operation, the remaining timeoutMS value should apply to connection checkout after a server has been selected.', async function () {
    client = this.configuration.newClient({ timeoutMS: 200 });
    // Spy on connection checkout and pull options argument
    const checkoutSpy = sinon.spy(ConnectionPool.prototype, 'checkOut');
    const remainingTimeSpy = sinon.spy(Timeout.prototype, 'remainingTime', ['get']);

    await client.db('db').collection('collection').insertOne({ x: 1 });
    const remainingTimeFirstCall = remainingTimeSpy.get.firstCall;

    expect(checkoutSpy).to.have.been.calledOnce;
    expect(checkoutSpy.firstCall.args[0].timeout).to.exist;
    expect(checkoutSpy.firstCall.args[0].timeout.duration).to.be.equal(
      remainingTimeFirstCall.returnValue
    );
  });

  it('If timeoutMS is not set for an operation, waitQueueTimeoutMS should apply to connection checkout after a server has been selected.', async function () {
    client = this.configuration.newClient({ waitQueueTimeoutMS: 123456 });

    const checkoutSpy = sinon.spy(ConnectionPool.prototype, 'checkOut');
    const selectServerSpy = sinon.spy(Topology.prototype, 'selectServer');
    const expiresSpy = sinon.spy(Timeout, 'expires');

    await client.db('db').collection('collection').insertOne({ x: 1 });
    expect(checkoutSpy).to.have.been.calledAfter(selectServerSpy);

    expect(expiresSpy).to.have.been.calledWith(123456);
  });

  context.skip(
    'If a new connection is required to execute an operation, min(remaining computedServerSelectionTimeout, connectTimeoutMS) should apply to socket establishment.',
    () => {}
  ).skipReason =
    'TODO(DRIVERS-2347): Requires this ticket to be implemented before we can assert on connection CSOT behaviour';

  context(
    'For drivers that have control over OCSP behavior, min(remaining computedServerSelectionTimeout, 5 seconds) should apply to HTTP requests against OCSP responders.',
    () => {}
  );

  context.skip(
    'If timeoutMS is unset, operations fail after two non-consecutive socket timeouts.',
    () => {}
  ).skipReason =
    'TODO(NODE-5682): Add CSOT support for socket read/write at the connection layer for CRUD APIs';

  context.skip(
    'The remaining timeoutMS value should apply to HTTP requests against KMS servers for CSFLE.',
    () => {}
  ).skipReason = 'TODO(NODE-5686): Add CSOT support to client side encryption';

  context.skip(
    'The remaining timeoutMS value should apply to commands sent to mongocryptd as part of automatic encryption.',
    () => {}
  ).skipReason = 'TODO(NODE-5686): Add CSOT support to client side encryption';

  context.skip(
    'When doing minPoolSize maintenance, connectTimeoutMS is used as the timeout for socket establishment.',
    () => {}
  ).skipReason = 'TODO(NODE-6091): Implement CSOT logic for Background Connection Pooling';
});
