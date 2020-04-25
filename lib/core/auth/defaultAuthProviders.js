'use strict';

const MongoCR = require('./mongocr');
const X509 = require('./x509');
const Plain = require('./plain');
const GSSAPI = require('./gssapi');
const ScramSHA1 = require('./scram').ScramSHA1;
const ScramSHA256 = require('./scram').ScramSHA256;
const MongoDBAWS = require('./mongodb_aws');

/**
 * Returns the default authentication providers.
 *
 * @param {BSON} bson Bson definition
 * @returns {Object} a mapping of auth names to auth types
 */
function defaultAuthProviders(bson) {
  return {
    'mongodb-aws': new MongoDBAWS(bson),
    mongocr: new MongoCR(bson),
    x509: new X509(bson),
    plain: new Plain(bson),
    gssapi: new GSSAPI(bson),
    'scram-sha-1': new ScramSHA1(bson),
    'scram-sha-256': new ScramSHA256(bson)
  };
}

module.exports = { defaultAuthProviders };
