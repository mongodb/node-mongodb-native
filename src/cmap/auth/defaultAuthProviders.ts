import { MongoCR } from './mongocr';
import { X509 } from './x509';
import { Plain } from './plain';
import { GSSAPI } from './gssapi';
import { ScramSHA1, ScramSHA256 } from './scram';
import { MongoDBAWS } from './mongodb_aws';
import type { AuthProvider } from './auth_provider';

export enum AuthMechanism {
  'MONGODB-AWS' = 'MONGODB-AWS',
  'MONGODB-CR' = 'MONGODB-CR',
  'DEFAULT' = 'DEFAULT',
  'GSSAPI' = 'GSSAPI',
  'PLAIN' = 'PLAIN',
  'SCRAM-SHA-1' = 'SCRAM-SHA-1',
  'SCRAM-SHA-256' = 'SCRAM-SHA-256',
  'MONGODB-X509' = 'MONGODB-X509'
}

export type AuthMechanisms = keyof typeof AuthMechanism;

export const AUTH_PROVIDERS = {
  [AuthMechanism['MONGODB-AWS']]: new MongoDBAWS(),
  [AuthMechanism['MONGODB-CR']]: new MongoCR(),
  [AuthMechanism['GSSAPI']]: new GSSAPI(),
  [AuthMechanism['PLAIN']]: new Plain(),
  [AuthMechanism['SCRAM-SHA-1']]: new ScramSHA1(),
  [AuthMechanism['SCRAM-SHA-256']]: new ScramSHA256(),
  [AuthMechanism['MONGODB-X509']]: new X509()
};

// TODO: We can make auth mechanism more functional since we pass around a context object
// and we improve the the typing here to use the enum, the current issue is that the mechanism is
// 'default' until resolved maybe we can do that resolution here and make the this strictly
// AuthMechanism -> AuthProviders
export function defaultAuthProviders(): Record<string, AuthProvider> {
  return AUTH_PROVIDERS;
}
