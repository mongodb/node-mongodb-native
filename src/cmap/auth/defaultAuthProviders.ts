import { MongoCR } from './mongocr';
import { X509 } from './x509';
import { Plain } from './plain';
import { GSSAPI } from './gssapi';
import { ScramSHA1, ScramSHA256 } from './scram';
import { MongoDBAWS } from './mongodb_aws';
import type { AuthProvider } from './auth_provider';

export enum AuthMechanisms {
  MONGODB_AWS = 'mongodb-aws',
  MONGODB_CR = 'mongocr',
  MONGODB_X509 = 'x509',
  MONGODB_PLAIN = 'plain',
  MONGODB_GSSAPI = 'gssapi',
  MONGODB_SCRAM_SHA1 = 'scram-sha-1',
  MONGODB_SCRAM_SHA256 = 'scram-sha-256'
}

export const AUTH_PROVIDERS = {
  [AuthMechanisms.MONGODB_AWS]: new MongoDBAWS(),
  [AuthMechanisms.MONGODB_CR]: new MongoCR(),
  [AuthMechanisms.MONGODB_GSSAPI]: new GSSAPI(),
  [AuthMechanisms.MONGODB_PLAIN]: new Plain(),
  [AuthMechanisms.MONGODB_SCRAM_SHA1]: new ScramSHA1(),
  [AuthMechanisms.MONGODB_SCRAM_SHA256]: new ScramSHA256(),
  [AuthMechanisms.MONGODB_X509]: new X509()
};

// TODO: We can make auth mechanism more functional since we pass around a context object
// and we improve the the typing here to use the enum, the current issue is that the mechanism is
// 'default' until resolved maybe we can do that resolution here and make the this strictly
// AuthMechanism -> AuthProviders
export function defaultAuthProviders(): Record<string, AuthProvider> {
  return AUTH_PROVIDERS;
}
