'use strict';

const bson = require('bson');
const expect = require('chai').expect;
const mock = require('../../mock');
const Connection = require('../../../lib/connection/connection');

describe('Connection', function() {
  const noop = () => {};
  let server;
  afterEach(() => mock.cleanup());

  function testCase(name, options) {
    const config = options.config;
    const args = {
      metadata: { requires: { topology: ['single'] } },
      test: function(done) {
        const connection = new Connection(
          noop,
          Object.assign(
            {
              bson,
              port: server.port
            },
            config
          )
        );

        const cleanup = err => {
          connection.destroy();
          done(err);
        };

        const errorHandler = options.error
          ? err => {
              try {
                options.error(err);
                cleanup();
              } catch (e) {
                cleanup(e);
              }
            }
          : cleanup;

        const connectHandler = options.connect
          ? () => {
              try {
                options.connect(connection);
                cleanup();
              } catch (e) {
                cleanup(e);
              }
            }
          : () => {
              cleanup(new Error('Expected test to not connect, but it connected successfully'));
            };

        connection.on('error', errorHandler);
        connection.on('connect', connectHandler);
        connection.connect();
      }
    };

    if (options.skip) {
      it.skip(name, args);
    } else if (options.only) {
      it.only(name, args);
    } else {
      it(name, args);
    }
  }

  describe('IPv4', function() {
    beforeEach(() => mock.createServer(0, '127.0.0.1').then(_server => (server = _server)));

    testCase('should connect with no family', {
      config: { host: 'localhost' },
      connect: connection => {
        expect(connection.connection.remotePort).to.equal(server.port);
        expect(connection.connection.remoteFamily).to.equal('IPv4');
      }
    });

    testCase('should connect with family=4', {
      config: { host: 'localhost', family: 4 },
      connect: connection => {
        expect(connection.connection.remotePort).to.equal(server.port);
        expect(connection.connection.remoteFamily).to.equal('IPv4');
      }
    });

    testCase('should error with family=6', {
      config: { host: 'localhost', family: 6 },
      error: err => expect(err).to.be.an.instanceOf(Error)
    });
  });

  describe('IPv6', function() {
    beforeEach(() => mock.createServer(0, '::').then(_server => (server = _server)));

    testCase('should connect with no family', {
      config: { host: 'localhost' },
      connect: connection => {
        expect(connection.connection.remotePort).to.equal(server.port);
        expect(connection.connection.remoteFamily).to.equal('IPv6');
      }
    });

    // NOTE: this test is currently being skipped b/c of a "feature" in
    // most operating systems where listening on an IPv6 port
    // also listens on an IPv4 port. Don't want to spend time working around
    // this. See https://github.com/nodejs/node/issues/9390 for more info.
    testCase('should error with family=4', {
      skip: true,
      config: { host: 'localhost', family: 4 },
      error: err => expect(err).to.be.an.instanceOf(Error)
    });

    testCase('should connect with family=6', {
      config: { host: 'localhost', family: 6 },
      connect: connection => {
        expect(connection.connection.remotePort).to.equal(server.port);
        expect(connection.connection.remoteFamily).to.equal('IPv6');
      }
    });
  });
});
