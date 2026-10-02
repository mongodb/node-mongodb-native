import { expect } from 'chai';
import * as dns from 'dns';
import * as sinon from 'sinon';

import {
  ConnectionPool,
  MongoAPIError,
  type MongoClient,
  MongoInvalidArgumentError,
  MongoParseError,
  resolveSRVRecord,
  Server,
  ServerDescription,
  Topology
} from '../../mongodb';
import { topologyWithPlaceholderClient } from '../../tools/utils';

/** Stubs DNS so the SRV lookup returns `names` and the TXT lookup returns no records */
function stubSrvLookup(...names: string[]) {
  const stub = sinon.stub(dns.promises, 'resolve');
  stub.withArgs(sinon.match.string, 'SRV').callsFake(async () => {
    return names.map(name => ({ name, port: 27017, weight: 0, priority: 0 }));
  });
  stub.withArgs(sinon.match.string, 'TXT').callsFake(async () => {
    throw { code: 'ENODATA' };
  });
}

/** Performs the initial SRV lookup for `client`, returning the host names of the resulting seedlist */
async function resolveSeedlist(client: MongoClient): Promise<string[]> {
  const hosts = await resolveSRVRecord(client.options);
  return hosts.map(host => host.toHostPort().host);
}

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

        const stub = sinon.stub(dns.promises, 'resolve');
        stub.withArgs(sinon.match.string, 'SRV').callsFake(async () => {
          return [
            {
              name: 'resolved.mongo.localhost',
              port: 27017,
              weight: 0,
              priority: 0
            }
          ];
        });

        stub.withArgs(sinon.match.string, 'TXT').callsFake(async () => {
          throw { code: 'ENODATA' };
        });

        sinon.stub(Topology.prototype, 'selectServer').callsFake(async () => {
          return new Server(
            topologyWithPlaceholderClient([], {} as any),
            new ServerDescription('a:1'),
            {} as any
          );
        });

        sinon.stub(ConnectionPool.prototype, 'checkOut').callsFake(async function () {
          return {};
        });

        sinon.stub(ConnectionPool.prototype, 'checkIn').callsFake(function () {
          return;
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
        let stub;

        beforeEach(async function () {
          stub = sinon.stub(dns.promises, 'resolve');
          stub.withArgs(sinon.match.string, 'TXT').callsFake(async () => {
            throw { code: 'ENODATA' };
          });
        });

        afterEach(async function () {
          sinon.restore();
        });

        it('an SRV with one domain level causes a runtime error', async function () {
          stub.withArgs(sinon.match.string, 'SRV').callsFake(async () => {
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
          stub.withArgs(sinon.match.string, 'SRV').callsFake(async () => {
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
          stub.withArgs(sinon.match.string, 'SRV').callsFake(async () => {
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
        let stub;

        beforeEach(async function () {
          stub = sinon.stub(dns.promises, 'resolve');
          stub.withArgs(sinon.match.string, 'TXT').callsFake(async () => {
            throw { code: 'ENODATA' };
          });
        });

        afterEach(async function () {
          sinon.restore();
        });

        it('an SRV with one domain level causes a runtime error', async function () {
          stub.withArgs(sinon.match.string, 'SRV').callsFake(async () => {
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
          stub.withArgs(sinon.match.string, 'SRV').callsFake(async () => {
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
        let stub;

        beforeEach(async function () {
          stub = sinon.stub(dns.promises, 'resolve');
          stub.withArgs(sinon.match.string, 'TXT').callsFake(async () => {
            throw { code: 'ENODATA' };
          });
        });

        afterEach(async function () {
          sinon.restore();
        });

        it('an SRV with one domain level causes a runtime error', async function () {
          stub.withArgs(sinon.match.string, 'SRV').callsFake(async () => {
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
          stub.withArgs(sinon.match.string, 'SRV').callsFake(async () => {
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
          stub.withArgs(sinon.match.string, 'SRV').callsFake(async () => {
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

  describe('5. srvHostValidator accepts a host the default verification would reject', function () {
    /**
     * When srvHostValidator is configured, it replaces the default verification entirely, so a returned
     * address that the default verification check would reject must be accepted if the validator returns true.
     * Configure a validator that returns true for every host name, then run each of the following cases:
     *  - the SRV mongodb+srv://blogs.mongodb.com resolving to blogs.evil.com, which does not share the SRV's
     *    domain name, produces a seedlist containing blogs.evil.com
     *  - the SRV mongodb+srv://mongo.local resolving to mongo.local, which does not add a domain level to an
     *    SRV hostname with fewer than three . separated parts, produces a seedlist containing mongo.local
     */
    let client: MongoClient;

    afterEach(async function () {
      sinon.restore();
      await client?.close();
    });

    it('accepts a host that does not share the SRV domain name', async function () {
      stubSrvLookup('blogs.evil.com');
      client = this.configuration.newClient('mongodb+srv://blogs.mongodb.com', {
        srvHostValidator: () => true
      });
      expect(await resolveSeedlist(client)).to.deep.equal(['blogs.evil.com']);
    });

    it('accepts a host that does not add a domain level to the SRV hostname', async function () {
      stubSrvLookup('mongo.local');
      client = this.configuration.newClient('mongodb+srv://mongo.local', {
        srvHostValidator: () => true
      });
      expect(await resolveSeedlist(client)).to.deep.equal(['mongo.local']);
    });
  });

  describe('6. Reject a host the default verification would accept', function () {
    /**
     * Configure a validator that returns false for every host name and assert that the SRV
     * mongodb+srv://blogs.mongodb.com resolving to cluster.mongodb.com throws an error, even though the
     * returned address shares the SRV's domain name.
     */
    afterEach(async function () {
      sinon.restore();
    });

    it('throws when the validator rejects the host', async function () {
      stubSrvLookup('cluster.mongodb.com');
      const err = await this.configuration
        .newClient('mongodb+srv://blogs.mongodb.com', { srvHostValidator: () => false })
        .connect()
        .catch(e => e);
      expect(err).to.be.instanceOf(MongoAPIError);
      expect(err.message).to.equal(
        'Server record "cluster.mongodb.com" was rejected by srvHostValidator'
      );
    });
  });

  describe('7. The validator receives the normalized host name', function () {
    /**
     * The returned address is normalized before verification, so the validator must be passed the normalized
     * form rather than the address exactly as returned by DNS.
     * Configure a validator that records the host names it is passed and returns true, then run the SRV
     * mongodb+srv://blogs.mongodb.com resolving to CLUSTER.MONGODB.COM. and assert that the validator was
     * passed cluster.mongodb.com.
     */
    let client: MongoClient;

    afterEach(async function () {
      sinon.restore();
      await client?.close();
    });

    it('passes the normalized host name to the validator', async function () {
      stubSrvLookup('CLUSTER.MONGODB.COM.');
      const validatedHosts: string[] = [];
      client = this.configuration.newClient('mongodb+srv://blogs.mongodb.com', {
        srvHostValidator: host => {
          validatedHosts.push(host);
          return true;
        }
      });
      await resolveSeedlist(client);
      expect(validatedHosts).to.deep.equal(['cluster.mongodb.com']);
    });
  });

  describe('8. Wrap an error raised by the validator', function () {
    /**
     * When the validator raises an error during initial seedlist resolution, the driver must catch it and
     * re-raise it wrapped in a driver error rather than letting it propagate unchanged.
     * Configure a validator that raises an error and assert that the SRV mongodb+srv://blogs.mongodb.com
     * resolving to cluster.mongodb.com throws an error which retains the error raised by the validator.
     */
    afterEach(async function () {
      sinon.restore();
    });

    it('wraps the error in a driver error that retains it as the cause', async function () {
      stubSrvLookup('cluster.mongodb.com');
      const validatorError = new Error('validator failed');
      const err = await this.configuration
        .newClient('mongodb+srv://blogs.mongodb.com', {
          srvHostValidator: () => {
            throw validatorError;
          }
        })
        .connect()
        .catch(e => e);
      expect(err).to.be.instanceOf(MongoAPIError);
      expect(err).to.have.property('cause', validatorError);
    });
  });

  describe('9. Throw when both srvAllowedHostsSuffix and srvHostValidator are configured', function () {
    /**
     * The two options are mutually exclusive.
     * Assert that configuring a MongoClient with both srvAllowedHostsSuffix=.mongodb.com and any
     * srvHostValidator throws an error.
     */
    it('throws', function () {
      expect(() =>
        this.configuration.newClient(
          'mongodb+srv://blogs.mongodb.com/?srvAllowedHostsSuffix=.mongodb.com',
          { srvHostValidator: () => true }
        )
      ).to.throw(
        MongoParseError,
        'Cannot use srvAllowedHostsSuffix together with srvHostValidator'
      );
    });
  });

  describe('10. Accept a mixed case returned address with srvAllowedHostsSuffix', function () {
    /**
     * Returned addresses must be normalized before verification.
     * Configure a MongoClient with srvAllowedHostsSuffix=.mongodb.com and assert that the SRV
     * mongodb+srv://blogs.mongodb.com resolving to CLUSTER.MONGODB.COM. produces a seedlist containing
     * cluster.mongodb.com.
     */
    let client: MongoClient;

    afterEach(async function () {
      sinon.restore();
      await client?.close();
    });

    it('produces a seedlist containing the normalized host', async function () {
      stubSrvLookup('CLUSTER.MONGODB.COM.');
      client = this.configuration.newClient(
        'mongodb+srv://blogs.mongodb.com/?srvAllowedHostsSuffix=.mongodb.com'
      );
      expect(await resolveSeedlist(client)).to.deep.equal(['cluster.mongodb.com']);
    });
  });

  describe('11. Throw when srvHostValidator is not callable', function () {
    /**
     * Assert that configuring a MongoClient with a srvHostValidator that is not callable, such as the string
     * "notacallable", throws an error.
     */
    it('throws', function () {
      expect(() =>
        this.configuration.newClient('mongodb+srv://blogs.mongodb.com', {
          // @ts-expect-error: srvHostValidator must be a function
          srvHostValidator: 'notacallable'
        })
      ).to.throw(MongoParseError, 'srvHostValidator must be a function');
    });
  });

  describe('12. Accept a reserved single label as srvAllowedHostsSuffix', function () {
    /**
     * A single label is a public suffix under the Public Suffix List's * rule, but the names reserved for
     * private or special use must be accepted despite that.
     * Configure a MongoClient with srvAllowedHostsSuffix=localhost and assert that the SRV
     * mongodb+srv://cluster.localhost resolving to db.cluster.localhost produces a seedlist containing
     * db.cluster.localhost.
     */
    let client: MongoClient;

    afterEach(async function () {
      sinon.restore();
      await client?.close();
    });

    it('produces a seedlist containing the host', async function () {
      stubSrvLookup('db.cluster.localhost');
      client = this.configuration.newClient(
        'mongodb+srv://cluster.localhost/?srvAllowedHostsSuffix=localhost'
      );
      expect(await resolveSeedlist(client)).to.deep.equal(['db.cluster.localhost']);
    });
  });

  describe('13. Throw when srvHostValidator is used with a non-SRV URI', function () {
    /**
     * srvHostValidator only has an effect on SRV resolution, so it MUST NOT be accepted alongside a non-SRV URI.
     * Assert that configuring a MongoClient with any srvHostValidator and the non-SRV URI
     * mongodb://localhost:27017 throws an error.
     */
    it('throws', function () {
      expect(() =>
        this.configuration.newClient('mongodb://localhost:27017', { srvHostValidator: () => true })
      ).to.throw(MongoParseError, 'Cannot use srvHostValidator with a non-srv connection string');
    });
  });

  describe('14. Throw when srvHostValidator returns a non-boolean value', function () {
    /**
     * During initial seedlist resolution, a validator that returns a value that is not a bool results in an error.
     * Configure a validator that returns the string "true" and assert that the SRV mongodb+srv://blogs.mongodb.com
     * resolving to cluster.mongodb.com throws an error.
     */
    afterEach(async function () {
      sinon.restore();
    });

    it('throws', async function () {
      stubSrvLookup('cluster.mongodb.com');
      const err = await this.configuration
        .newClient('mongodb+srv://blogs.mongodb.com', {
          // @ts-expect-error: srvHostValidator must return a boolean
          srvHostValidator: () => 'true'
        })
        .connect()
        .catch(e => e);
      expect(err).to.be.instanceOf(MongoInvalidArgumentError);
      expect(err.message).to.equal('srvHostValidator must return a boolean, received string');
    });
  });

  describe('15. Accept an underscore in srvAllowedHostsSuffix', function () {
    /**
     * Drivers MUST NOT apply hostname syntax validation to srvAllowedHostsSuffix beyond the listed steps, so a value
     * containing an underscore must be accepted.
     * Configure a MongoClient with srvAllowedHostsSuffix=.my_domain.net and assert that the SRV
     * mongodb+srv://blogs.my_domain.net resolving to cluster.my_domain.net produces a seedlist containing
     * cluster.my_domain.net.
     */
    let client: MongoClient;

    afterEach(async function () {
      sinon.restore();
      await client?.close();
    });

    it('produces a seedlist containing the host', async function () {
      stubSrvLookup('cluster.my_domain.net');
      client = this.configuration.newClient(
        'mongodb+srv://blogs.my_domain.net/?srvAllowedHostsSuffix=.my_domain.net'
      );
      expect(await resolveSeedlist(client)).to.deep.equal(['cluster.my_domain.net']);
    });
  });
});
