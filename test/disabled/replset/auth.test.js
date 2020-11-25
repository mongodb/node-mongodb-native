'use strict';

const ReplSet = require('../../../../src/core/topologies/replset');
const mock = require('mongodb-mock-server');
const ReplSetFixture = require('../common').ReplSetFixture;
const { ReadPreference } = require('../../../../src/core/topologies/read_preference');
const MongoCredentials = require('../../../../src/core/auth/mongo_credentials').MongoCredentials;

describe('Auth (ReplSet)', function () {
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

  it('should not stall on authentication when you are connected', function (done) {
    const credentials = new MongoCredentials({
      mechanism: 'default',
      source: 'db',
      username: 'user',
      password: 'pencil'
    });

    let timeoutIds = [];
    let finish = err => {
      finish = () => {};
      timeoutIds.forEach(timeoutId => clearTimeout(timeoutId));
      replSet.destroy({ force: true }, err2 => done(err || err2));
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
        timeoutIds.push(setTimeout(() => request.reply(test.firstSecondaryStates[0]), 2000));
      } else if (doc.saslStart) {
        finish();
      }
    });

    const replSet = new ReplSet(
      [test.primaryServer.address(), test.firstSecondaryServer.address()],
      {
        setName: 'rs',

        connectionTimeout: 3000,
        disconnectHandler: mockDisconnectHandler,
        secondaryOnlyConnectionAllowed: true,
        size: 1,
        credentials
      }
    );

    replSet.once('error', finish);
    replSet.connect({
      readPreference: new ReadPreference('primary'),
      checkServerIdentity: true,
      rejectUnauthorized: true
    });

    timeoutIds.push(
      setTimeout(() => finish('replicaset stalled when attempting to authenticate'), 5000)
    );
  });
});
