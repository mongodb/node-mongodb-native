'use strict';

const {
  createServer: superCreateServer,
  cleanup,
  DEFAULT_ISMASTER,
  DEFAULT_ISMASTER_36
  // eslint-disable-next-line no-restricted-modules
} = require('mongodb-mock-server');
const { HostAddress } = require('../../src/utils');

/**
 * @callback GetHostAddress
 * @returns {import('../../src/mongo_client').HostAddress}
 */

/**
 * @callback GetAddress
 * @returns {({host: string, port: number})}
 */

/**
 * @callback GetURI
 * @returns {string}
 */

/**
 * @typedef {Object} MockServer
 * @property {Function} onRead - todo
 * @property {string} host - todo
 * @property {number} port - todo
 * @property {import('net').Server | import('tls').Server} server - todo
 * @property {boolean} tlsEnabled - todo
 * @property {any} messages - todo
 * @property {any} state - todo
 * @property {number} connections - todo
 * @property {any[]} sockets - todo
 * @property {object} messageHandlers - todo
 * // methods
 * @property {GetHostAddress} hostAddress - the HostAddress type
 * @property {GetAddress} address - the address as a string
 * @property {GetURI} uri - the connection string
 * @property {Function} destroy - todo
 * @property {Function} start - todo
 * @property {Function} receive - todo
 * @property {Function} setMessageHandler - todo
 * @property {Function} addMessageHandler - todo
 */

/**
 * Make a mock mongodb server.
 *
 * @param {number} port - port number
 * @param {string} host - address
 * @param {object} options - options
 * @returns {Promise<MockServer>}
 */
function createServer(port, host, options) {
  const willBeServer = superCreateServer(port, host, options);
  willBeServer.then(s => {
    s.hostAddress = () => {
      const address = s.address();
      return new HostAddress(`${address.host}:${address.port}`);
    };
    return s;
  });
  return willBeServer;
}

module.exports = {
  createServer,
  cleanup,
  DEFAULT_ISMASTER,
  DEFAULT_ISMASTER_36
};
