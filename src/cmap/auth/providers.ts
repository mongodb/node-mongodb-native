/** @public */
export const AuthMechanism = Object.freeze({
  MONGODB_AWS: 'MONGODB-AWS',
  MONGODB_CR: 'MONGODB-CR',
  MONGODB_DEFAULT: 'DEFAULT',
  MONGODB_GSSAPI: 'GSSAPI',
  MONGODB_PLAIN: 'PLAIN',
  MONGODB_SCRAM_SHA1: 'SCRAM-SHA-1',
  MONGODB_SCRAM_SHA256: 'SCRAM-SHA-256',
  MONGODB_X509: 'MONGODB-X509'
} as const);

/** @public */
export const $EXTERNAL_AUTH_SOURCE_MECHANISMS = new Set<AuthMechanism | undefined>([
  AuthMechanism.MONGODB_GSSAPI,
  AuthMechanism.MONGODB_AWS,
  AuthMechanism.MONGODB_X509
]);

/** @public */
export type AuthMechanism = typeof AuthMechanism[keyof typeof AuthMechanism];
