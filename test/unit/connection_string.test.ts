import { expect } from 'chai';
import * as dns from 'dns';
import * as sinon from 'sinon';
import { promisify } from 'util';

import { MongoCredentials } from '../../src/cmap/auth/mongo_credentials';
import { $EXTERNAL_AUTH_SOURCE_MECHANISMS, AuthMechanism } from '../../src/cmap/auth/providers';
import { resolveSRVRecord } from '../../src/connection_string';

describe('Connection String', () => {
  describe('resolveSRVRecord()', () => {
    let resolveSrvStub: sinon.SinonStub;
    let resolveTxtStub: sinon.SinonStub;
    const resolveSRVRecordAsync = promisify(resolveSRVRecord);

    afterEach(async () => {
      sinon.restore();
    });

    function makeStub(txtRecord: string) {
      const mockAddress = [
        {
          name: 'localhost.test.mock.test.build.10gen.cc',
          port: 2017,
          weight: 0,
          priority: 0
        }
      ];

      const mockRecord: string[][] = [[txtRecord]];

      // first call is for the driver initial connection
      // second call will check the poller
      resolveSrvStub = sinon.stub(dns, 'resolveSrv').callsFake((address, callback) => {
        return process.nextTick(callback, null, mockAddress);
      });

      resolveTxtStub = sinon.stub(dns, 'resolveTxt').callsFake((address, thisIsWhatWeAreTesting) => {
        thisIsWhatWeAreTesting(null, mockRecord);
      });
    }

    for (const mechanism of $EXTERNAL_AUTH_SOURCE_MECHANISMS) {
      it(`should set authSource to $external for ${mechanism} external mechanism`, async function () {
        makeStub('authSource=thisShouldNotBeAuthSource');
        const options = {
          credentials: new MongoCredentials({
            source: '$external',
            mechanism: mechanism,
            username: 'username',
            password: 'password',
            mechanismProperties: {}
          }),
          srvHost: 'test.mock.test.build.10gen.cc',
          srvServiceName: 'mongodb',
          userSpecifiedAuthSource: false
        };

        await resolveSRVRecordAsync(options as any);
        expect(options).to.have.nested.property('credentials.source', '$external');
      });
    }

    it('should set a default authSource for non-external mechanisms with no user-specified source', async function () {
      makeStub('authSource=thisShouldBeAuthSource');

      const options = {
        credentials: new MongoCredentials({
          source: 'admin',
          mechanism: AuthMechanism.MONGODB_SCRAM_SHA256,
          username: 'username',
          password: 'password',
          mechanismProperties: {}
        }),
        srvHost: 'test.mock.test.build.10gen.cc',
        srvServiceName: 'mongodb',
        userSpecifiedAuthSource: false
      };

      await resolveSRVRecordAsync(options as any);
      expect(options).to.have.nested.property('credentials.source', 'thisShouldBeAuthSource');
    });

    it('should retain credentials for any mechanism with no user-sepcificed source and no source in DNS', async function () {
      makeStub('');
      const options = {
        credentials: new MongoCredentials({
          source: 'admin',
          mechanism: AuthMechanism.MONGODB_SCRAM_SHA256,
          username: 'username',
          password: 'password',
          mechanismProperties: {}
        }),
        srvHost: 'test.mock.test.build.10gen.cc',
        srvServiceName: 'mongodb',
        userSpecifiedAuthSource: false
      };

      await resolveSRVRecordAsync(options as any);
      expect(options).to.have.nested.property('credentials.source', 'admin');
    });
  });
});
