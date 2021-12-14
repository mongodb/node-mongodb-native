import * as dns from 'dns';
import * as sinon from 'sinon';
import { expect } from 'chai';
import { MongoCredentials } from '../../src/cmap/auth/mongo_credentials';
import { resolveSRVRecord } from '../../src/connection_string';
import { AuthMechanism } from '../../src/cmap/auth/defaultAuthProviders';

describe('Srv Option Handling', () => {
  let resolveSrvStub: sinon.SinonStub;
  let resolveTxtStub: sinon.SinonStub;
  let resolveSRVRecordStub: sinon.SinonStub;
  let lookupStub: sinon.SinonStub;

  afterEach(async () => {
    if (resolveSrvStub) {
      resolveSrvStub.restore();
      resolveSrvStub = undefined;
    }
    if (resolveTxtStub) {
      resolveTxtStub.restore();
      resolveTxtStub = undefined;
    }
    if (lookupStub) {
      lookupStub.restore();
      lookupStub = undefined;
    }
    if (resolveSRVRecordStub) {
      resolveSRVRecordStub.restore();
      resolveSRVRecordStub = undefined;
    }
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

  for (const iterator of [
    {
      mechanism: AuthMechanism.MONGODB_AWS,
      source: '',
      userSpecifiedAuthSource: false,
      expected: 'succeed'
    },
    {
      mechanism: AuthMechanism.MONGODB_AWS,
      source: 'admin',
      userSpecifiedAuthSource: true,
      expected: 'succeed'
    },
    {
      mechanism: null,
      source: 'admin',
      userSpecifiedAuthSource: false,
      expected: 'fail'
    }
  ]) {
    it(`should ${iterator.expected} for ${iterator.mechanism} mechanism and ${
      iterator.userSpecifiedAuthSource ? '' : 'non-'
    }user-specified source: ${iterator.source}`, function () {
      makeStub('authSource=admin');

      const options = {
        credentials: new MongoCredentials({
          source: '$external',
          mechanism: iterator.mechanism,
          username: 'username',
          password: 'password',
          mechanismProperties: {}
        }),
        srvHost: 'host',
        srvServiceName: 'mongodb',
        userSpecifiedAuthSource: iterator.userSpecifiedAuthSource
      };

      resolveSRVRecord(options as any, (err, hostAddress) => {
        if (iterator.expected === 'succeed') {
          expect(options).to.have.nested.property('credentials.source', '$external');
        } else {
          expect(options).to.not.have.nested.property('credentials.source', '$external');
        }
      });

      // expect(client).to.have.nested.property('options.credentials.source', '$external');
    });
  }
});
