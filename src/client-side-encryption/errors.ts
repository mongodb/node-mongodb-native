import { type Document } from '../bson';

/**
 * @public
 * An error indicating that something went wrong specifically with MongoDB Client Encryption
 */
export class MongoCryptError extends Error {
  /** @internal */
  constructor(message: string, options: { cause?: Error } = {}) {
    super(message, options);
  }

  override get name() {
    return 'MongoCryptError';
  }
}

/**
 * @public
 *
 * An error indicating an invalid argument was provided to an encryption API.
 */
export class MongoCryptInvalidArgumentError extends MongoCryptError {
  /** @internal */
  constructor(message: string) {
    super(message);
  }

  override get name() {
    return 'MongoCryptInvalidArgumentError';
  }
}
/**
 * @public
 * An error indicating that `ClientEncryption.createEncryptedCollection()` failed to create data keys
 */
export class MongoCryptCreateDataKeyError extends MongoCryptError {
  encryptedFields: Document;
  /** @internal */
  constructor(encryptedFields: Document, { cause }: { cause: Error }) {
    super(`Unable to complete creating data keys: ${cause.message}`, { cause });
    this.encryptedFields = encryptedFields;
  }

  override get name() {
    return 'MongoCryptCreateDataKeyError';
  }
}

/**
 * @public
 * An error indicating that `ClientEncryption.createEncryptedCollection()` failed to create a collection
 */
export class MongoCryptCreateEncryptedCollectionError extends MongoCryptError {
  encryptedFields: Document;
  /** @internal */
  constructor(encryptedFields: Document, { cause }: { cause: Error }) {
    super(`Unable to create collection: ${cause.message}`, { cause });
    this.encryptedFields = encryptedFields;
  }

  override get name() {
    return 'MongoCryptCreateEncryptedCollectionError';
  }
}

/**
 * @public
 * An error indicating that mongodb-client-encryption failed to auto-refresh Azure KMS credentials.
 */
export class MongoCryptAzureKMSRequestError extends MongoCryptError {
  /** The body of the http response that failed, if present. */
  body?: Document;
  /** @internal */
  constructor(message: string, body?: Document) {
    super(message);
    this.body = body;
  }

  override get name(): string {
    return 'MongoCryptAzureKMSRequestError';
  }
}

/** @public */
export class MongoCryptKMSRequestNetworkTimeoutError extends MongoCryptError {
  override get name(): string {
    return 'MongoCryptKMSRequestNetworkTimeoutError';
  }
}
