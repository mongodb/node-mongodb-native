import { MongoCR } from './mongocr';
import { X509 } from './x509';
import { Plain } from './plain';
import { GSSAPI } from './gssapi';
import { ScramSHA1, ScramSHA256 } from './scram';
import { MongoDBAWS } from './mongodb_aws';
import type { AuthProvider } from './auth_provider';

/** @public */
export const AuthMechanismEnum = {
  MONGODB_AWS: 'MONGODB-AWS',
  MONGODB_CR: 'MONGODB-CR',
  MONGODB_DEFAULT: 'DEFAULT',
  MONGODB_GSSAPI: 'GSSAPI',
  MONGODB_PLAIN: 'PLAIN',
  MONGODB_SCRAM_SHA1: 'SCRAM-SHA-1',
  MONGODB_SCRAM_SHA256: 'SCRAM-SHA-256',
  MONGODB_X509: 'MONGODB-X509'
} as const;

/** @public */
export type AuthMechanism = typeof AuthMechanismEnum[keyof typeof AuthMechanismEnum];

export const AUTH_PROVIDERS = {
  [AuthMechanismEnum.MONGODB_AWS]: new MongoDBAWS(),
  [AuthMechanismEnum.MONGODB_CR]: new MongoCR(),
  [AuthMechanismEnum.MONGODB_GSSAPI]: new GSSAPI(),
  [AuthMechanismEnum.MONGODB_PLAIN]: new Plain(),
  [AuthMechanismEnum.MONGODB_SCRAM_SHA1]: new ScramSHA1(),
  [AuthMechanismEnum.MONGODB_SCRAM_SHA256]: new ScramSHA256(),
  [AuthMechanismEnum.MONGODB_X509]: new X509()
};

// TODO: We can make auth mechanism more functional since we pass around a context object
// and we improve the the typing here to use the enum, the current issue is that the mechanism is
// 'default' until resolved maybe we can do that resolution here and make the this strictly
// AuthMechanism -> AuthProviders
export function defaultAuthProviders(): Record<string, AuthProvider> {
  return AUTH_PROVIDERS;
}
