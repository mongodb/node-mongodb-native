import { expect } from 'chai';
import * as dns from 'dns';
import * as sinon from 'sinon';

import { MongoClient } from '../../mongodb';

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
// 27018 localhost.test.build.10gen.cc.
// 27017 localhost.test.build.10gen.cc.

describe('DNS timeout errors', () => {
  let client: MongoClient;

  beforeEach(async function () {
    client = new MongoClient(CONNECTION_STRING, { serverSelectionTimeoutMS: 2000, tls: false });
  });

  afterEach(async function () {
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
      sinon
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
    });
  });

  describe('when TXT record look up times out', () => {
    beforeEach(() => {
      sinon
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
    });
  });

  describe('when SRV record look up times out twice', () => {
    beforeEach(() => {
      sinon
        .stub(dns.promises, 'resolveSrv')
        .onFirstCall()
        .rejects(new DNSTimeoutError())
        .onSecondCall()
        .rejects(new DNSTimeoutError())
        .onThirdCall()
        .callsFake(restoreDNS('resolveSrv'));
    });

    afterEach(async function () {
      sinon.restore();
    });

    it('throws timeout error', metadata, async () => {
      const error = await client.connect().catch(error => error);
      expect(error).to.be.instanceOf(DNSTimeoutError);
    });
  });

  describe('when TXT record look up times out twice', () => {
    beforeEach(() => {
      sinon
        .stub(dns.promises, 'resolveTxt')
        .onFirstCall()
        .rejects(new DNSTimeoutError())
        .onSecondCall()
        .rejects(new DNSTimeoutError())
        .onThirdCall()
        .callsFake(restoreDNS('resolveTxt'));
    });

    afterEach(async function () {
      sinon.restore();
    });

    it('throws timeout error', metadata, async () => {
      const error = await client.connect().catch(error => error);
      expect(error).to.be.instanceOf(DNSTimeoutError);
    });
  });

  describe('when SRV record look up throws a non-timeout error', () => {
    beforeEach(() => {
      sinon
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
    });
  });

  describe('when TXT record look up throws a non-timeout error', () => {
    beforeEach(() => {
      sinon
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
    });
  });
});
