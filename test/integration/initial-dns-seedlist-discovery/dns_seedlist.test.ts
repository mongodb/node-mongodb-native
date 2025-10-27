import { expect } from 'chai';
import * as dns from 'dns';
import * as sinon from 'sinon';

import { MongoClient } from '../../../src';

const metadata: MongoDBMetadataUI = { requires: { topology: '!single' } };

// This serves as a placeholder for _whatever_ node.js may throw. We only rely upon `.code`
class DNSTimeoutError extends Error {
  code = 'ETIMEOUT';
}
// This serves as a placeholder for _whatever_ node.js may throw. We only rely upon `.code`
class DNSSomethingError extends Error {
  code = undefined;
}

const CONNECTION_STRING = `mongodb+srv://test1.test.build.10gen.cc`;

describe('DNS timeout errors', () => {
  let client: MongoClient;
  let stub;

  beforeEach(async function () {
    client = new MongoClient(CONNECTION_STRING, { serverSelectionTimeoutMS: 2000, tls: false });
  });

  afterEach(async function () {
    stub = undefined;
    sinon.restore();
    await client.close();
  });

  const restoreDNS =
    api =>
    async (...args) => {
      sinon.restore();
      return await dns.promises[api](...args);
    };

  describe('when SRV record look up times out', () => {
    beforeEach(() => {
      stub = sinon
        .stub(dns.promises, 'resolveSrv')
        .onFirstCall()
        .rejects(new DNSTimeoutError())
        .onSecondCall()
        .callsFake(restoreDNS('resolveSrv'));
    });

    afterEach(async function () {
      sinon.restore();
    });

    it('retries timeout error', metadata, async () => {
      await client.connect();
      expect(stub).to.have.been.calledTwice;
    });
  });

  describe('when TXT record look up times out', () => {
    beforeEach(() => {
      stub = sinon
        .stub(dns.promises, 'resolveTxt')
        .onFirstCall()
        .rejects(new DNSTimeoutError())
        .onSecondCall()
        .callsFake(restoreDNS('resolveTxt'));
    });

    afterEach(async function () {
      sinon.restore();
    });

    it('retries timeout error', metadata, async () => {
      await client.connect();
      expect(stub).to.have.been.calledTwice;
    });
  });

  describe('when SRV record look up times out twice', () => {
    beforeEach(() => {
      stub = sinon
        .stub(dns.promises, 'resolveSrv')
        .onFirstCall()
        .rejects(new DNSTimeoutError())
        .onSecondCall()
        .rejects(new DNSTimeoutError());
    });

    afterEach(async function () {
      sinon.restore();
    });

    it('throws timeout error', metadata, async () => {
      const error = await client.connect().catch(error => error);
      expect(error).to.be.instanceOf(DNSTimeoutError);
      expect(stub).to.have.been.calledTwice;
    });
  });

  describe('when TXT record look up times out twice', () => {
    beforeEach(() => {
      stub = sinon
        .stub(dns.promises, 'resolveTxt')
        .onFirstCall()
        .rejects(new DNSTimeoutError())
        .onSecondCall()
        .rejects(new DNSTimeoutError());
    });

    afterEach(async function () {
      sinon.restore();
    });

    it('throws timeout error', metadata, async () => {
      const error = await client.connect().catch(error => error);
      expect(error).to.be.instanceOf(DNSTimeoutError);
      expect(stub).to.have.been.calledTwice;
    });
  });

  describe('when SRV record look up throws a non-timeout error', () => {
    beforeEach(() => {
      stub = sinon
        .stub(dns.promises, 'resolveSrv')
        .onFirstCall()
        .rejects(new DNSSomethingError())
        .onSecondCall()
        .callsFake(restoreDNS('resolveSrv'));
    });

    afterEach(async function () {
      sinon.restore();
    });

    it('throws that error', metadata, async () => {
      const error = await client.connect().catch(error => error);
      expect(error).to.be.instanceOf(DNSSomethingError);
      expect(stub).to.have.been.calledOnce;
    });
  });

  describe('when TXT record look up throws a non-timeout error', () => {
    beforeEach(() => {
      stub = sinon
        .stub(dns.promises, 'resolveTxt')
        .onFirstCall()
        .rejects(new DNSSomethingError())
        .onSecondCall()
        .callsFake(restoreDNS('resolveTxt'));
    });

    afterEach(async function () {
      sinon.restore();
    });

    it('throws that error', metadata, async () => {
      const error = await client.connect().catch(error => error);
      expect(error).to.be.instanceOf(DNSSomethingError);
      expect(stub).to.have.been.calledOnce;
    });
  });
});
