'use strict';

// Resolves the default auth mechanism according to
// https://github.com/mongodb/specifications/blob/master/source/auth/auth.rst
function getDefaultAuthMechanism(ismaster) {
  if (ismaster) {
    // If ismaster contains saslSupportedMechs, use scram-sha-256
    // if it is available, else scram-sha-1
    if (Array.isArray(ismaster.saslSupportedMechs)) {
      return ismaster.saslSupportedMechs.indexOf('SCRAM-SHA-256') >= 0
        ? 'scram-sha-256'
        : 'scram-sha-1';
    }

    // Fallback to legacy selection method. If wire version >= 3, use scram-sha-1
    if (ismaster.maxWireVersion >= 3) {
      return 'scram-sha-1';
    }
  }

  // Default for wireprotocol < 3
  return 'mongocr';
}

/**
 * A representation of the credentials used by MongoDB
 * @class
 * @property {string} mechanism The method used to authenticate
 * @property {string} [username] The username used for authentication
 * @property {string} [password] The password used for authentication
 * @property {string} [source] The database that the user should authenticate against
 * @property {object} [mechanismProperties] Special properties used by some types of auth mechanisms
 */
class MongoCredentials {
  /**
   * Creates a new MongoCredentials object
   * @param {object} [options]
   * @param {string} [options.username] The username used for authentication
   * @param {string} [options.password] The password used for authentication
   * @param {string} [options.source] The database that the user should authenticate against
   * @param {string} [options.mechanism] The method used to authenticate
   * @param {object} [options.mechanismProperties] Special properties used by some types of auth mechanisms
   */
  constructor(options) {
    options = options || {};
    this.username = options.username;
    this.password = options.password;
    this.source = options.source || options.db;
    this.mechanism = options.mechanism || 'default';
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

  /**
   * Determines if two MongoCredentials objects are equivalent
   * @param {MongoCredentials} other another MongoCredentials object
   * @returns {boolean} true if the two objects are equal.
   */
  equals(other) {
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
   * @param {Object} [ismaster] An ismaster response from the server
   * @returns {MongoCredentials}
   */
  resolveAuthMechanism(ismaster) {
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

module.exports = { MongoCredentials };
