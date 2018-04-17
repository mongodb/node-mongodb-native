'use strict';

const ReplSet = require('../../../../lib/topologies/replset');
const mock = require('mongodb-mock-server');
const ReplSetFixture = require('../common').ReplSetFixture;
const ReadPreference = require('../../../../lib/topologies/read_preference');

describe('Auth (ReplSet)', function() {
  let test;
  before(() => (test = new ReplSetFixture()));
  afterEach(() => mock.cleanup());
  beforeEach(() => test.setup());

  // mock ops store from node-mongodb-native
  const mockDisconnectHandler = {
    add: () => {},
    execute: () => {},
    flush: () => {}
  };

  it('should not stall on authentication when you are connected', function(done) {
    let finish = err => {
      finish = () => {};
      done(err);
    };

    test.primaryServer.setMessageHandler(request => {
      const doc = request.document;
      if (doc.ismaster) {
        setTimeout(() => request.reply(test.primaryStates[0]));
      } else if (doc.saslStart) {
        finish();
      }
    });

    test.firstSecondaryServer.setMessageHandler(request => {
      const doc = request.document;
      if (doc.ismaster) {
        setTimeout(() => request.reply(test.firstSecondaryStates[0]), 2000);
      } else if (doc.saslStart) {
        finish();
      }
    });

    const replSet = new ReplSet(
      [test.primaryServer.address(), test.firstSecondaryServer.address()],
      {
        setName: 'rs',
        haInterval: 10000,
        connectionTimeout: 3000,
        disconnectHandler: mockDisconnectHandler,
        secondaryOnlyConnectionAllowed: true,
        size: 1
      }
    );

    replSet.once('error', finish);
    replSet.once('connect', () => replSet.auth('default', 'db', 'user', 'pencil', () => {}));
    replSet.connect({
      readPreference: new ReadPreference('primary'),
      checkServerIdentity: true,
      rejectUnauthorized: true
    });

    setTimeout(() => finish('replicaset stalled when attempting to authenticate'), 5000);
  });
});
