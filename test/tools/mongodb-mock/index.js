const fs = require('fs');
const { MockServer, LEGACY_HELLO_COMMAND } = require('../../mongodb');
const process = require('node:process');

let mockServers = [];

// Default message fields
const DEFAULT_HELLO = {
  __nodejs_mock_server__: true,
  [LEGACY_HELLO_COMMAND]: true,
  maxBsonObjectSize: 16777216,
  maxMessageSizeBytes: 48000000,
  maxWriteBatchSize: 1000,
  localTime: new Date(),
  maxWireVersion: 5,
  minWireVersion: 0,
  ok: 1
};

const DEFAULT_HELLO_42 = Object.assign({}, DEFAULT_HELLO, {
  maxWireVersion: 8,
  logicalSessionTimeoutMinutes: 10
});

/*
 * Main module
 */
function createServer(port, host, options) {
  port = port || 0;
  host = host || 'localhost';
  options = options || {};

  if (process.env.MONGODB_SERVER_PEM || process.env.MONGODB_CA_PEM) {
    if (process.env.MONGODB_SERVER_PEM == null) {
      throw new Error('MONGODB_SERVER_PEM must be provided for TLS support');
    }

    if (process.env.MONGODB_CA_PEM == null) {
      throw new Error('MONGODB_CA_PEM must be provided for TLS support');
    }

    Object.assign(options, {
      tls: true,
      ca: fs.readFileSync(process.env.MONGODB_CA_PEM),
      cert: fs.readFileSync(process.env.MONGODB_SERVER_PEM),
      key: fs.readFileSync(process.env.MONGODB_SERVER_PEM)
    });
  }

  let mockServer = new MockServer(port, host, options);
  mockServers.push(mockServer);
  return mockServer.start();
}

function cleanup(spy, callback) {
  if (typeof spy === 'function') {
    callback = spy;
    spy = undefined;
  }

  if (spy) {
    const alreadyDrained = spy.connectionCount() === 0;
    const drainedPromise = !alreadyDrained
      ? new Promise(resolve => spy.once('drained', () => resolve()))
      : Promise.resolve();

    const cleanupPromise = Promise.all(mockServers.map(server => server.destroy()))
      .then(drainedPromise)
      .then(() => {
        mockServers = [];
      })
      .catch(err => {
        mockServers = [];
        throw err;
      });

    if (typeof callback !== 'function') {
      return cleanupPromise;
    }

    return cleanupPromise.then(() => callback(null, null)).catch(err => callback(err, null));
  } else {
    const cleanupPromise = Promise.all(mockServers.map(server => server.destroy()));
    if (typeof callback !== 'function') {
      return cleanupPromise;
    }

    return cleanupPromise.then(() => callback(null, null)).catch(err => callback(err, null));
  }
}

module.exports = {
  createServer,
  cleanup,
  HELLO: DEFAULT_HELLO_42
};
