'use strict';

const Mongos = require('../../../../lib/topologies/mongos');
const expect = require('chai').expect;
const mock = require('mongodb-mock-server');
const genClusterTime = require('../common').genClusterTime;

const Connection = require('../../../../lib/connection/connection');

describe('Reconnect (Mongos)', function() {
  const fixture = {};

  function startServer() {
    return mock.createServer(fixture.port).then(mockServer => {
      mockServer.setMessageHandler(request => {
        request.reply(
          Object.assign({}, mock.DEFAULT_ISMASTER, {
            $clusterTime: genClusterTime(Date.now()),
            msg: 'isdbgrid'
          })
        );
      });
      fixture.server = mockServer;
      fixture.port = mockServer.port;
    });
  }

  function stopServer() {
    return mock.cleanup();
  }

  beforeEach(() => startServer());
  beforeEach(() => Connection.enableConnectionAccounting());
  afterEach(() => Connection.disableConnectionAccounting());
  afterEach(() => stopServer());

  it('should not connection swarm when reconnecting', function(done) {
    const reconnectInterval = 500;
    const socketTimeout = reconnectInterval * 5;
    const haInterval = reconnectInterval * 10;
    const reconnectTries = Number.MAX_VALUE;

    const connectOptions = {
      haInterval,
      reconnectInterval,
      socketTimeout,
      reconnectTries,
      reconnect: true,
      poolSize: 500
    };

    const mongos = new Mongos([fixture.server.address()], connectOptions);

    function runIsMaster(assertion) {
      return new Promise((resolve, reject) => {
        mongos.command('admin.$cmd', { ismaster: 1 }, {}, (err, response) => {
          try {
            assertion(err, response);
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });
    }

    function connectMongos() {
      return new Promise((resolve, reject) => {
        mongos.once('error', reject);
        mongos.once('connect', resolve);
        mongos.connect(connectOptions);
      });
    }

    function assertSuccess(err, response) {
      expect(err).to.not.exist;
      expect(response).to.exist;
    }

    function assertError(err, response) {
      expect(err).to.exist;
      expect(response).to.not.exist;
    }

    function delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    function cleanup(err) {
      mongos.destroy();
      return err;
    }

    Promise.resolve()
      .then(() => connectMongos())
      .then(() => runIsMaster(assertSuccess))
      .then(() => stopServer())
      .then(() => runIsMaster(assertError))
      .then(() => delay(haInterval * 2))
      .then(() => startServer())
      .then(() => delay(haInterval * 2))
      .then(() => expect(Object.keys(Connection.connections())).to.have.a.lengthOf(1))
      .then(() => cleanup(), cleanup)
      .then(done);
  });
});
