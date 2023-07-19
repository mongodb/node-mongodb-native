/**
 * @class
 * An error indicating that something went wrong specifically with MongoDB Client Encryption
 */
export class MongoCryptError extends Error {
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
export class MongoCryptCreateDataKeyError extends MongoCryptError {
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
export class MongoCryptCreateEncryptedCollectionError extends MongoCryptError {
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
export class MongoCryptAzureKMSRequestError extends MongoCryptError {
  /**
   * @param {string} message
   * @param {object | undefined} body
   */
  constructor(message, body) {
    super(message);
    this.body = body;
  }
}

export class MongoCryptKMSRequestNetworkTimeoutError extends MongoCryptError {}
