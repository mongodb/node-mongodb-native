import { expect } from 'chai';
import * as dns from 'dns';
import * as sinon from 'sinon';

import { MongoAPIError, Server, ServerDescription, Topology } from '../../mongodb';
import { topologyWithPlaceholderClient } from '../../tools/utils';

describe('Initial DNS Seedlist Discovery (Prose Tests)', () => {
  context('1) When running validation on an SRV string before DNS resolution', function () {
    beforeEach(async function () {
      // this fn stubs DNS resolution to always pass - so we are only checking pre-DNS validation

      sinon.stub(dns.promises, 'resolveSrv').callsFake(async () => {
        return [
          {
            name: 'resolved.mongodb.localhost',
            port: 27017,
            weight: 0,
            priority: 0
          }
        ];
      });

      sinon.stub(dns.promises, 'resolveTxt').callsFake(async () => {
        throw { code: 'ENODATA' };
      });

      sinon.stub(Topology.prototype, 'selectServer').callsFake(async () => {
        return new Server(
          topologyWithPlaceholderClient([], {} as any),
          new ServerDescription('a:1'),
          {} as any
        );
      });
    });

    afterEach(async function () {
      sinon.restore();
    });

    it('does not error on an SRV because it has one domain level', async function () {
      const client = await this.configuration.newClient('mongodb+srv://localhost', {});
      client.connect();
      client.close();
    });

    it('does not error on an SRV because it has two domain levels', async function () {
      const client = await this.configuration.newClient('mongodb+srv://mongodb.localhost', {});
      client.connect();
      client.close();
    });
  });

  context(
    '2) When given a host from DNS resolution that does NOT end with the original SRVs domain name',
    function () {
      beforeEach(async function () {
        sinon.stub(dns.promises, 'resolveTxt').callsFake(async () => {
          throw { code: 'ENODATA' };
        });
      });

      afterEach(async function () {
        sinon.restore();
      });

      it('an SRV with one domain level causes a runtime error', async function () {
        sinon.stub(dns.promises, 'resolveSrv').callsFake(async () => {
          return [
            {
              name: 'localhost.mongodb', // this string contains the SRV but does not end with it
              port: 27017,
              weight: 0,
              priority: 0
            }
          ];
        });
        const err = await this.configuration
          .newClient('mongodb+srv://localhost', {})
          .connect()
          .catch((e: any) => e);
        expect(err).to.be.instanceOf(MongoAPIError);
        expect(err.message).to.equal('Server record does not share hostname with parent URI');
      });

      it('an SRV with two domain levels causes a runtime error', async function () {
        sinon.stub(dns.promises, 'resolveSrv').callsFake(async () => {
          return [
            {
              name: 'evil.localhost', // this string only ends with part of the domain, not all of it!
              port: 27017,
              weight: 0,
              priority: 0
            }
          ];
        });
        const err = await this.configuration
          .newClient('mongodb+srv://mongodb.localhost', {})
          .connect()
          .catch(e => e);
        expect(err).to.be.instanceOf(MongoAPIError);
        expect(err.message).to.equal('Server record does not share hostname with parent URI');
      });

      it('an SRV with three or more domain levels causes a runtime error', async function () {
        sinon.stub(dns.promises, 'resolveSrv').callsFake(async () => {
          return [
            {
              name: 'blogs.evil.co.uk',
              port: 27017,
              weight: 0,
              priority: 0
            }
          ];
        });
        const err = await this.configuration
          .newClient('mongodb+srv://blogs.mongodb.com', {})
          .connect()
          .catch(e => e);
        expect(err).to.be.instanceOf(MongoAPIError);
        expect(err.message).to.equal('Server record does not share hostname with parent URI');
      });
    }
  );

  context(
    '3) When given a host from DNS resolution that is identical to the original SRVs hostname',
    function () {
      beforeEach(async function () {
        sinon.stub(dns.promises, 'resolveTxt').callsFake(async () => {
          throw { code: 'ENODATA' };
        });
      });

      afterEach(async function () {
        sinon.restore();
      });

      it('an SRV with one domain level causes a runtime error', async function () {
        sinon.stub(dns.promises, 'resolveSrv').callsFake(async () => {
          return [
            {
              name: 'localhost',
              port: 27017,
              weight: 0,
              priority: 0
            }
          ];
        });
        const err = await this.configuration
          .newClient('mongodb+srv://localhost', {})
          .connect()
          .catch(e => e);
        expect(err).to.be.instanceOf(MongoAPIError);
        expect(err.message).to.equal(
          'Server record does not have least one more domain than parent URI'
        );
      });

      it('an SRV with two domain levels causes a runtime error', async function () {
        sinon.stub(dns.promises, 'resolveSrv').callsFake(async () => {
          return [
            {
              name: 'mongodb.localhost',
              port: 27017,
              weight: 0,
              priority: 0
            }
          ];
        });
        const err = await this.configuration
          .newClient('mongodb+srv://mongodb.localhost', {})
          .connect()
          .catch(e => e);
        expect(err).to.be.instanceOf(MongoAPIError);
        expect(err.message).to.equal(
          'Server record does not have least one more domain than parent URI'
        );
      });
    }
  );
});
