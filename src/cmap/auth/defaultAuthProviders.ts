import { MongoCR } from './mongocr';
import { X509 } from './x509';
import { Plain } from './plain';
import { GSSAPI } from './gssapi';
import { ScramSHA1, ScramSHA256 } from './scram';
import { MongoDBAWS } from './mongodb_aws';
import type { AuthProvider } from './auth_provider';

/**
 * Returns the default authentication providers.
 *
 * @returns {Record<string, AuthProvider>} a mapping of auth names to auth types
 */
function defaultAuthProviders(): Record<string, AuthProvider> {
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
