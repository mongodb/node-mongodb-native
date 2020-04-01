'use strict';

const MongoCR = require('./mongocr');
const X509 = require('./x509');
const Plain = require('./plain');
const GSSAPI = require('./gssapi');
const SSPI = require('./sspi');
const ScramSHA1 = require('./scram').ScramSHA1;
const ScramSHA256 = require('./scram').ScramSHA256;
const MongoDBAWS = require('./mongodb_aws');

/**
 * Returns the default authentication providers.
 *
 * @returns {object} a mapping of auth names to auth types
 */
function defaultAuthProviders() {
  return {
    'mongodb-aws': new MongoDBAWS(),
    mongocr: new MongoCR(),
    x509: new X509(),
    plain: new Plain(),
    gssapi: new GSSAPI(),
    sspi: new SSPI(),
    'scram-sha-1': new ScramSHA1(),
    'scram-sha-256': new ScramSHA256()
  };
}

module.exports = { defaultAuthProviders };
