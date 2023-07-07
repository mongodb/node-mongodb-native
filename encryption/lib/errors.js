'use strict';

/**
 * @class
 * An error indicating that something went wrong specifically with MongoDB Client Encryption
 */
class MongoCryptError extends Error {
  constructor(message, options = {}) {
    super(message);
    if (options.cause != null) {
      this.cause = options.cause;
    }
  }

  get name() {
    return 'MongoCryptError';
  }
}

/**
 * @class
 * An error indicating that `ClientEncryption.createEncryptedCollection()` failed to create data keys
 */
class MongoCryptCreateDataKeyError extends MongoCryptError {
  constructor({ encryptedFields, cause }) {
    super(`Unable to complete creating data keys: ${cause.message}`, { cause });
    this.encryptedFields = encryptedFields;
  }

  get name() {
    return 'MongoCryptCreateDataKeyError';
  }
}

/**
 * @class
 * An error indicating that `ClientEncryption.createEncryptedCollection()` failed to create a collection
 */
class MongoCryptCreateEncryptedCollectionError extends MongoCryptError {
  constructor({ encryptedFields, cause }) {
    super(`Unable to create collection: ${cause.message}`, { cause });
    this.encryptedFields = encryptedFields;
  }

  get name() {
    return 'MongoCryptCreateEncryptedCollectionError';
  }
}

/**
 * @class
 * An error indicating that mongodb-client-encryption failed to auto-refresh Azure KMS credentials.
 */
class MongoCryptAzureKMSRequestError extends MongoCryptError {
  /**
   * @param {string} message
   * @param {object | undefined} body
   */
  constructor(message, body) {
    super(message);
    this.body = body;
  }
}

class MongoCryptKMSRequestNetworkTimeoutError extends MongoCryptError {}

module.exports = {
  MongoCryptError,
  MongoCryptKMSRequestNetworkTimeoutError,
  MongoCryptAzureKMSRequestError,
  MongoCryptCreateDataKeyError,
  MongoCryptCreateEncryptedCollectionError
};
