import { MongoCR } from './mongocr';
import { X509 } from './x509';
import { Plain } from './plain';
import { GSSAPI } from './gssapi';
import { ScramSHA1, ScramSHA256 } from './scram';
import { MongoDBAWS } from './mongodb_aws';
import type { AuthProvider } from './auth_provider';

const AUTH_PROVIDERS = new Map<string, typeof AuthProvider>([
  ['mongodb-aws', MongoDBAWS],
  ['mongocr', MongoCR],
  ['x509', X509],
  ['plain', Plain],
  ['gssapi', GSSAPI],
  ['scram-sha-1', ScramSHA1],
  ['scram-sha-256', ScramSHA256]
]);

export { AUTH_PROVIDERS };
