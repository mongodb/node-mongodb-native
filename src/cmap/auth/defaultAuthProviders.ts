'use strict';
import MongoCR = require('./mongocr');
import X509 = require('./x509');
import Plain = require('./plain');
import GSSAPI = require('./gssapi');
import { ScramSHA1, ScramSHA256 } from './scram';
import MongoDBAWS = require('./mongodb_aws');

/**
 * Returns the default authentication providers.
 *
 * @returns {object} a mapping of auth names to auth types
 */
function defaultAuthProviders(): object {
  return {
    'mongodb-aws': new MongoDBAWS(),
    mongocr: new MongoCR(),
    x509: new X509(),
    plain: new Plain(),
    gssapi: new GSSAPI(),
    'scram-sha-1': new ScramSHA1(),
    'scram-sha-256': new ScramSHA256()
  };
}

export { defaultAuthProviders };
