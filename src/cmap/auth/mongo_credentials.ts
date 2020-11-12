// Resolves the default auth mechanism according to

import type { Document } from '../../bson';
import { AuthMechanism, AuthMechanismEnum } from './defaultAuthProviders';

// https://github.com/mongodb/specifications/blob/master/source/auth/auth.rst
function getDefaultAuthMechanism(ismaster?: Document): AuthMechanism {
  if (ismaster) {
    // If ismaster contains saslSupportedMechs, use scram-sha-256
    // if it is available, else scram-sha-1
    if (Array.isArray(ismaster.saslSupportedMechs)) {
      return ismaster.saslSupportedMechs.indexOf('SCRAM-SHA-256') >= 0
        ? AuthMechanismEnum.MONGODB_SCRAM_SHA256
        : AuthMechanismEnum.MONGODB_SCRAM_SHA1;
    }

    // Fallback to legacy selection method. If wire version >= 3, use scram-sha-1
    if (ismaster.maxWireVersion >= 3) {
      return AuthMechanismEnum.MONGODB_SCRAM_SHA1;
    }
  }

  // Default for wireprotocol < 3
  return AuthMechanismEnum.MONGODB_CR;
}

/** @public */
export interface MongoCredentialsOptions {
  username: string;
  password: string;
  source: string;
  db?: string;
  mechanism?: AuthMechanism;
  mechanismProperties: Document;
}

/**
 * A representation of the credentials used by MongoDB
 * @public
 */
export class MongoCredentials {
  /** The username used for authentication */
  readonly username: string;
  /** The password used for authentication */
  readonly password: string;
  /** The database that the user should authenticate against */
  readonly source: string;
  /** The method used to authenticate */
  readonly mechanism: AuthMechanism;
  /** Special properties used by some types of auth mechanisms */
  readonly mechanismProperties: Document;

  constructor(options: MongoCredentialsOptions) {
    this.username = options.username;
    this.password = options.password;
    this.source = options.source;
    if (!this.source && options.db) {
      this.source = options.db;
    }
    this.mechanism = options.mechanism || AuthMechanismEnum.MONGODB_DEFAULT;
    this.mechanismProperties = options.mechanismProperties || {};

    if (this.mechanism.match(/MONGODB-AWS/i)) {
      if (this.username == null && process.env.AWS_ACCESS_KEY_ID) {
        this.username = process.env.AWS_ACCESS_KEY_ID;
      }

      if (this.password == null && process.env.AWS_SECRET_ACCESS_KEY) {
        this.password = process.env.AWS_SECRET_ACCESS_KEY;
      }

      if (this.mechanismProperties.AWS_SESSION_TOKEN == null && process.env.AWS_SESSION_TOKEN) {
        this.mechanismProperties.AWS_SESSION_TOKEN = process.env.AWS_SESSION_TOKEN;
      }
    }

    Object.freeze(this.mechanismProperties);
    Object.freeze(this);
  }

  /** Determines if two MongoCredentials objects are equivalent */
  equals(other: MongoCredentials): boolean {
    return (
      this.mechanism === other.mechanism &&
      this.username === other.username &&
      this.password === other.password &&
      this.source === other.source
    );
  }

  /**
   * If the authentication mechanism is set to "default", resolves the authMechanism
   * based on the server version and server supported sasl mechanisms.
   *
   * @param ismaster - An ismaster response from the server
   */
  resolveAuthMechanism(ismaster?: Document): MongoCredentials {
    // If the mechanism is not "default", then it does not need to be resolved
    if (this.mechanism.match(/DEFAULT/i)) {
      return new MongoCredentials({
        username: this.username,
        password: this.password,
        source: this.source,
        mechanism: getDefaultAuthMechanism(ismaster),
        mechanismProperties: this.mechanismProperties
      });
    }

    return this;
  }
}
