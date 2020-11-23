'use strict';

const ReplSet = require('../../../../src/core/topologies/replset');
const mock = require('mongodb-mock-server');
const ReplSetFixture = require('../common').ReplSetFixture;
const expect = require('chai').expect;

describe('Compression (ReplSet)', function () {
  let test;
  before(() => (test = new ReplSetFixture()));
  afterEach(() => mock.cleanup());
  beforeEach(() => test.setup());

  it('should pass compression information to child server instances on connect', function (done) {
    const compressionData = [];
    test.primaryServer.setMessageHandler(request => {
      const doc = request.document;
      if (doc.ismaster) {
        compressionData.push(doc.compression);
        request.reply(test.primaryStates[0]);
      }
    });

    test.firstSecondaryServer.setMessageHandler(request => {
      const doc = request.document;
      if (doc.ismaster) {
        compressionData.push(doc.compression);
        request.reply(test.firstSecondaryStates[0]);
      }
    });

    const replSet = new ReplSet(
      [test.primaryServer.address(), test.firstSecondaryServer.address()],
      {
        setName: 'rs',

        connectionTimeout: 3000,
        secondaryOnlyConnectionAllowed: true,
        size: 1
      }
    );

    replSet.on('fullsetup', () => {
      compressionData.forEach(data => {
        expect(data).to.eql(['zlib']);
      });

      replSet.destroy(done);
    });

    replSet.connect({ compression: { compressors: ['zlib'] } });
  });
});
