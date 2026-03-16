import { expect } from 'chai';
import * as dns from 'dns';
import * as sinon from 'sinon';

import { MongoClient } from '../../mongodb';

const metadata: MongoDBMetadataUI = { requires: { topology: '!single', tls: 'disabled' } };

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
    stub = sinon.stub(dns.promises, 'resolve').callThrough();
  });

  afterEach(async function () {
    stub = undefined;
    sinon.restore();
    await client.close();
  });

  const restoreDNS = rrtype => async hostname => {
    stub.restore();
    return await dns.promises.resolve(hostname, rrtype);
  };

  describe('when SRV record look up times out', () => {
    beforeEach(() => {
      stub
        .withArgs(sinon.match.string, 'SRV')
        .onFirstCall()
        .rejects(new DNSTimeoutError())
        .onSecondCall()
        .callsFake(restoreDNS('SRV'));
    });

    it('retries timeout error', metadata, async () => {
      await client.connect();
      expect(stub.withArgs(sinon.match.string, 'SRV')).to.have.been.calledTwice;
    });
  });

  describe('when TXT record look up times out', () => {
    beforeEach(() => {
      stub
        .withArgs(sinon.match.string, 'TXT')
        .onFirstCall()
        .rejects(new DNSTimeoutError())
        .onSecondCall()
        .callsFake(restoreDNS('TXT'));
    });

    it('retries timeout error', metadata, async () => {
      await client.connect();
      expect(stub.withArgs(sinon.match.string, 'TXT')).to.have.been.calledTwice;
    });
  });

  describe('when SRV record look up times out twice', () => {
    beforeEach(() => {
      stub
        .withArgs(sinon.match.string, 'SRV')
        .onFirstCall()
        .rejects(new DNSTimeoutError())
        .onSecondCall()
        .rejects(new DNSTimeoutError());
    });

    it('throws timeout error', metadata, async () => {
      const error = await client.connect().catch(error => error);
      expect(error).to.be.instanceOf(DNSTimeoutError);
      expect(stub.withArgs(sinon.match.string, 'SRV')).to.have.been.calledTwice;
    });
  });

  describe('when TXT record look up times out twice', () => {
    beforeEach(() => {
      stub
        .withArgs(sinon.match.string, 'TXT')
        .onFirstCall()
        .rejects(new DNSTimeoutError())
        .onSecondCall()
        .rejects(new DNSTimeoutError());
    });

    it('throws timeout error', metadata, async () => {
      const error = await client.connect().catch(error => error);
      expect(error).to.be.instanceOf(DNSTimeoutError);
      expect(stub.withArgs(sinon.match.string, 'TXT')).to.have.been.calledTwice;
    });
  });

  describe('when SRV record look up throws a non-timeout error', () => {
    beforeEach(() => {
      stub
        .withArgs(sinon.match.string, 'SRV')
        .onFirstCall()
        .rejects(new DNSSomethingError())
        .onSecondCall()
        .callsFake(restoreDNS('SRV'));
    });

    it('throws that error', metadata, async () => {
      const error = await client.connect().catch(error => error);
      expect(error).to.be.instanceOf(DNSSomethingError);
      expect(stub.withArgs(sinon.match.string, 'SRV')).to.have.been.calledOnce;
    });
  });

  describe('when TXT record look up throws a non-timeout error', () => {
    beforeEach(() => {
      stub
        .withArgs(sinon.match.string, 'TXT')
        .onFirstCall()
        .rejects(new DNSSomethingError())
        .onSecondCall()
        .callsFake(restoreDNS('TXT'));
    });

    it('throws that error', metadata, async () => {
      const error = await client.connect().catch(error => error);
      expect(error).to.be.instanceOf(DNSSomethingError);
      expect(stub.withArgs(sinon.match.string, 'TXT')).to.have.been.calledOnce;
    });
  });
});
