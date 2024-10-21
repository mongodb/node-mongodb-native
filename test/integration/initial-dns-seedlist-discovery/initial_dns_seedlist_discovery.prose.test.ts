import { expect } from 'chai';
import * as dns from 'dns';
import * as sinon from 'sinon';

import { MongoAPIError, Server, ServerDescription, Topology } from '../../mongodb';
import { topologyWithPlaceholderClient } from '../../tools/utils';

describe('Initial DNS Seedlist Discovery (Prose Tests)', () => {
  describe('1. Allow SRVs with fewer than 3 . separated parts', function () {
    context('when running validation on an SRV string before DNS resolution', function () {
      /**
       * When running validation on an SRV string before DNS resolution, do not throw a error due to number of SRV parts.
       *  - mongodb+srv://localhost
       *  - mongodb+srv://mongo.localhost
       */

      let client;

      beforeEach(async function () {
        // this fn stubs DNS resolution to always pass - so we are only checking pre-DNS validation

        sinon.stub(dns.promises, 'resolveSrv').callsFake(async () => {
          return [
            {
              name: 'resolved.mongo.localhost',
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
        await client.close();
      });

      it('does not error on an SRV because it has one domain level', async function () {
        client = await this.configuration.newClient('mongodb+srv://localhost', {});
        await client.connect();
      });

      it('does not error on an SRV because it has two domain levels', async function () {
        client = await this.configuration.newClient('mongodb+srv://mongo.localhost', {});
        await client.connect();
      });
    });
  });

  describe('2. Throw when return address does not end with SRV domain', function () {
    context(
      'when given a host from DNS resolution that does NOT end with the original SRVs domain name',
      function () {
        /**
         * When given a returned address that does NOT end with the original SRV's domain name, throw a runtime error.
         * For this test, run each of the following cases:
         *  - the SRV mongodb+srv://localhost resolving to localhost.mongodb
         *  - the SRV mongodb+srv://mongo.local resolving to test_1.evil.local
         *  - the SRV mongodb+srv://blogs.mongodb.com resolving to blogs.evil.com
         * Remember, the domain of an SRV with one or two . separated parts is the SRVs entire hostname.
         */

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
                name: 'localhost.mongodb',
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
                name: 'test_1.evil.local', // this string only ends with part of the domain, not all of it!
                port: 27017,
                weight: 0,
                priority: 0
              }
            ];
          });
          const err = await this.configuration
            .newClient('mongodb+srv://mongo.local', {})
            .connect()
            .catch(e => e);
          expect(err).to.be.instanceOf(MongoAPIError);
          expect(err.message).to.equal('Server record does not share hostname with parent URI');
        });

        it('an SRV with three or more domain levels causes a runtime error', async function () {
          sinon.stub(dns.promises, 'resolveSrv').callsFake(async () => {
            return [
              {
                name: 'blogs.evil.com',
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
  });

  describe('3. Throw when return address is identical to SRV hostname', function () {
    /**
     * When given a returned address that is identical to the SRV hostname and the SRV hostname has fewer than three . separated parts, throw a runtime error.
     * For this test, run each of the following cases:
     *  - the SRV mongodb+srv://localhost resolving to localhost
     *  - the SRV mongodb+srv://mongo.local resolving to mongo.local
     */

    context(
      'when given a host from DNS resolution that is identical to the original SRVs hostname',
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
            'Server record does not have at least one more domain level than parent URI'
          );
        });

        it('an SRV with two domain levels causes a runtime error', async function () {
          sinon.stub(dns.promises, 'resolveSrv').callsFake(async () => {
            return [
              {
                name: 'mongo.local',
                port: 27017,
                weight: 0,
                priority: 0
              }
            ];
          });
          const err = await this.configuration
            .newClient('mongodb+srv://mongo.local', {})
            .connect()
            .catch(e => e);
          expect(err).to.be.instanceOf(MongoAPIError);
          expect(err.message).to.equal(
            'Server record does not have at least one more domain level than parent URI'
          );
        });
      }
    );
  });

  describe('4. Throw when return address does not contain . separating shared part of domain', function () {
    /**
     * When given a returned address that does NOT share the domain name of the SRV record because it's missing a ., throw a runtime error.
     * For this test, run each of the following cases:
     *  - the SRV mongodb+srv://localhost resolving to test_1.cluster_1localhost
     *  - the SRV mongodb+srv://mongo.local resolving to test_1.my_hostmongo.local
     *  - the SRV mongodb+srv://blogs.mongodb.com resolving to cluster.testmongodb.com
     */

    context(
      'when given a returned address that does NOT share the domain name of the SRV record because its missing a `.`',
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
                name: 'test_1.cluster_1localhost',
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
          expect(err.message).to.equal('Server record does not share hostname with parent URI');
        });

        it('an SRV with two domain levels causes a runtime error', async function () {
          sinon.stub(dns.promises, 'resolveSrv').callsFake(async () => {
            return [
              {
                name: 'test_1.my_hostmongo.local',
                port: 27017,
                weight: 0,
                priority: 0
              }
            ];
          });
          const err = await this.configuration
            .newClient('mongodb+srv://mongo.local', {})
            .connect()
            .catch(e => e);
          expect(err).to.be.instanceOf(MongoAPIError);
          expect(err.message).to.equal('Server record does not share hostname with parent URI');
        });

        it('an SRV with three domain levels causes a runtime error', async function () {
          sinon.stub(dns.promises, 'resolveSrv').callsFake(async () => {
            return [
              {
                name: 'cluster.testmongodb.com',
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
  });
});
