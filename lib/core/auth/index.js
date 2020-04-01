'use strict';

const GSSAPI = require('./gssapi').GSSAPI;
const MongoDBAWS = require('./mongodb_aws').MongoDBAWS;
const MongoDBCR = require('./mongodb_cr').MongoDBCR;
const MongoDBX509 = require('./mongodb_x509').MongoDBX509;
const Plain = require('./plain').Plain;
const ScramSHA1 = require('./scram').ScramSHA1;
const ScramSHA256 = require('./scram').ScramSHA256;
const SSPI = require('./sspi').SSPI;

/** @type Map<string, Authenticator> */
const AUTHENTICATORS = new Map([
  ['GSSAPI', GSSAPI],
  ['MONGODB-AWS', MongoDBAWS],
  ['MONGODB-CR', MongoDBCR],
  ['MONGODB-X509', MongoDBX509],
  ['PLAIN', Plain],
  ['SCRAM-SHA-1', ScramSHA1],
  ['SCRAM-SHA-256', ScramSHA256],
  ['DEFAULT', ScramSHA256], // TODO(neal): Nice way to document the default mechanism
  ['SSPI', SSPI]
]);

/**
 * Make a map of mechanism string to initialized Authenticators
 *
 * @param {any} bson BSON library
 * @returns {Map<string, any>} initialized Authenticator Map
 */
function makeAuthenticatorsMap(bson) {
  const initializedAuthenticators = new Map();
  for (const entry of AUTHENTICATORS.entries()) {
    const key = entry[0];
    const AuthClass = entry[1];
    initializedAuthenticators.set(key, new AuthClass(bson));
  }
  return initializedAuthenticators;
}

module.exports = { makeAuthenticatorsMap, AUTHENTICATORS };
