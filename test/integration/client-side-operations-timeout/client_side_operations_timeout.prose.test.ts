/* Specification prose tests */

import { expect } from 'chai';

import {
  MongoClient,
  MongoOperationTimeoutError,
  MongoServerSelectionError,
  now
} from '../../mongodb';

// TODO(NODE-5824): Implement CSOT prose tests
describe('CSOT spec prose tests', function () {
  let internalClient: MongoClient;
  let client: MongoClient;

  beforeEach(async function () {
    internalClient = this.configuration.newClient();
  });

  afterEach(async function () {
    await internalClient?.close();
    await client?.close();
  });

  context.skip('1. Multi-batch writes', () => {
    /**
     * This test MUST only run against standalones on server versions 4.4 and higher.
     * The `insertMany` call takes an exceedingly long time on replicasets and sharded
     * clusters. Drivers MAY adjust the timeouts used in this test to allow for differing
     * bulk encoding performance.
     *
     * 1. Using `internalClient`, drop the `db.coll` collection.
     * 1. Using `internalClient`, set the following fail point:
     * ```js
     *       {
     *           configureFailPoint: "failCommand",
     *           mode: {
     *               times: 2
     *           },
     *           data: {
     *               failCommands: ["insert"],
     *               blockConnection: true,
     *               blockTimeMS: 1010
     *           }
     *       }
     * ```
     * 1. Create a new MongoClient (referred to as `client`) with `timeoutMS=2000`.
     * 1. Using `client`, insert 50 1-megabyte documents in a single `insertMany` call.
     *   - Expect this to fail with a timeout error.
     * 1. Verify that two `insert` commands were executed against `db.coll` as part of the `insertMany` call.
     */
  });

  context.skip('2. maxTimeMS is not set for commands sent to mongocryptd', () => {
    /**
     * This test MUST only be run against enterprise server versions 4.2 and higher.
     *
     * 1. Launch a mongocryptd process on 23000.
     * 1. Create a MongoClient (referred to as `client`) using the URI `mongodb://localhost:23000/?timeoutMS=1000`.
     * 1. Using `client`, execute the `{ ping: 1 }` command against the `admin` database.
     * 1. Verify via command monitoring that the `ping` command sent did not contain a `maxTimeMS` field.
     */
  });

  context.skip('3. ClientEncryption', () => {
    /**
     * Each test under this category MUST only be run against server versions 4.4 and higher. In these tests,
     * `LOCAL_MASTERKEY` refers to the following base64:
     * ```txt
     * Mng0NCt4ZHVUYUJCa1kxNkVyNUR1QURhZ2h2UzR2d2RrZzh0cFBwM3R6NmdWMDFBMUN3YkQ5aXRRMkhGRGdQV09wOGVNYUMxT2k3NjZKelhaQmRCZGJkTXVyZG9uSjFk
     * ```
     * For each test, perform the following setup:
     *
     * 1. Using `internalClient`, drop and create the `keyvault.datakeys` collection.
     * 1. Create a MongoClient (referred to as `keyVaultClient`) with `timeoutMS=10`.
     * 1. Create a `ClientEncryption` object that wraps `keyVaultClient` (referred to as `clientEncryption`). Configure this object with `keyVaultNamespace` set to `keyvault.datakeys` and the following KMS providers map:
     * ```js
     * { local: { key: <base64 decoding of LOCAL_MASTERKEY> } }
     * ```
     */
    context('createDataKey', () => {
      /**
       * 1. Using `internalClient`, set the following fail point:
       * ```js
       *       {
       *           configureFailPoint: "failCommand",
       *           mode: {
       *               times: 1
       *           },
       *           data: {
       *               failCommands: ["insert"],
       *               blockConnection: true,
       *               blockTimeMS: 15
       *           }
       *       }
       * ```
       * 1. Call `clientEncryption.createDataKey()` with the `local` KMS provider.
       *   - Expect this to fail with a timeout error.
       * 1. Verify that an `insert` command was executed against to `keyvault.datakeys` as part of the `createDataKey` call.
       */
    });

    context('encrypt', () => {
      /**
       * 1. Call `client_encryption.createDataKey()` with the `local` KMS provider.
       *    - Expect a BSON binary with subtype 4 to be returned, referred to as `datakeyId`.
       * 1. Using `internalClient`, set the following fail point:
       * ```js
       *        {
       *            configureFailPoint: "failCommand",
       *            mode: {
       *                times: 1
       *            },
       *            data: {
       *                failCommands: ["find"],
       *                blockConnection: true,
       *                blockTimeMS: 15
       *            }
       *        }
       * ```
       * 1. Call `clientEncryption.encrypt()` with the value `hello`, the algorithm `AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic`, and the keyId `datakeyId`.
       *   - Expect this to fail with a timeout error.
       * 1. Verify that a `find` command was executed against the `keyvault.datakeys` collection as part of the `encrypt` call.
       */
    });

    context('decrypt', () => {
      /**
       * 1. Call `clientEncryption.createDataKey()` with the `local` KMS provider.
       *    - Expect this to return a BSON binary with subtype 4, referred to as `dataKeyId`.
       * 1. Call `clientEncryption.encrypt()` with the value `hello`, the algorithm `AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic`, and the keyId `dataKeyId`.
       *    - Expect this to return a BSON binary with subtype 6, referred to as `encrypted`.
       * 1. Close and re-create the `keyVaultClient` and `clientEncryption` objects.
       * 1. Using `internalClient`, set the following fail point:
       * ```js
       *        {
       *            configureFailPoint: "failCommand",
       *            mode: {
       *                times: 1
       *            },
       *            data: {
       *                failCommands: ["find"],
       *                blockConnection: true,
       *                blockTimeMS: 15
       *            }
       *        }
       * ```
       * 1. Call `clientEncryption.decrypt()` with the value `encrypted`.
       *   - Expect this to fail with a timeout error.
       * 1. Verify that a `find` command was executed against the `keyvault.datakeys` collection as part of the `decrypt` call.
       */
    });
  });

  context.skip('4. Background Connection Pooling', () => {
    /**
     * The tests in this section MUST only be run if the server version is 4.4 or higher and the URI has authentication
     * fields (i.e. a username and password). Each test in this section requires drivers to create a MongoClient and then wait
     * for some CMAP events to be published. Drivers MUST wait for up to 10 seconds and fail the test if the specified events
     * are not published within that time.
     */

    context('timeoutMS used for handshake commands', () => {
      /**
       * 1. Using `internalClient`, set the following fail point:
       * ```js
       *       {
       *           configureFailPoint: "failCommand",
       *           mode: {
       *               times: 1
       *           },
       *           data: {
       *               failCommands: ["saslContinue"],
       *               blockConnection: true,
       *               blockTimeMS: 15,
       *               appName: "timeoutBackgroundPoolTest"
       *           }
       *       }
       * ```
       * 1. Create a MongoClient (referred to as `client`) configured with the following:
       *   - `minPoolSize` of 1
       *   - `timeoutMS` of 10
       *   - `appName` of `timeoutBackgroundPoolTest`
       *   - CMAP monitor configured to listen for `ConnectionCreatedEvent` and `ConnectionClosedEvent` events.
       * 1. Wait for a `ConnectionCreatedEvent` and a `ConnectionClosedEvent` to be published.

       */
    });

    context('timeoutMS is refreshed for each handshake command', () => {
      /**
       * 1. Using `internalClient`, set the following fail point:
       * ```js
       *        {
       *            configureFailPoint: "failCommand",
       *            mode: "alwaysOn",
       *            data: {
       *                failCommands: ["hello", "isMaster", "saslContinue"],
       *                blockConnection: true,
       *                blockTimeMS: 15,
       *                appName: "refreshTimeoutBackgroundPoolTest"
       *            }
       *        }
       * ```
       * 1. Create a MongoClient (referred to as `client`) configured with the following:
       *   - `minPoolSize` of 1
       *   - `timeoutMS` of 20
       *   - `appName` of `refreshTimeoutBackgroundPoolTest`
       *   - CMAP monitor configured to listen for `ConnectionCreatedEvent` and `ConnectionReady` events.
       * 1. Wait for a `ConnectionCreatedEvent` and a `ConnectionReady` to be published.
       */
    });
  });

  context.skip('5. Blocking Iteration Methods', () => {
    /**
     * Tests in this section MUST only be run against server versions 4.4 and higher and only apply to drivers that have a
     * blocking method for cursor iteration that executes `getMore` commands in a loop until a document is available or an
     * error occurs.
     */

    context('Tailable cursors', () => {
      /**
       * 1. Using `internalClient`, drop the `db.coll` collection.
       * 1. Using `internalClient`, insert the document `{ x: 1 }` into `db.coll`.
       * 1. Using `internalClient`, set the following fail point:
       * ```js
       *        {
       *            configureFailPoint: "failCommand",
       *            mode: "alwaysOn",
       *            data: {
       *                failCommands: ["getMore"],
       *                blockConnection: true,
       *                blockTimeMS: 15
       *            }
       *        }
       * ```
       * 1. Create a new MongoClient (referred to as `client`) with `timeoutMS=20`.
       * 1. Using `client`, create a tailable cursor on `db.coll` with `cursorType=tailable`.
       *    - Expect this to succeed and return a cursor with a non-zero ID.
       * 1. Call either a blocking or non-blocking iteration method on the cursor.
       *    - Expect this to succeed and return the document `{ x: 1 }` without sending a `getMore` command.
       * 1. Call the blocking iteration method on the resulting cursor.
       *    - Expect this to fail with a timeout error.
       * 1. Verify that a `find` command and two `getMore` commands were executed against the `db.coll` collection during the test.
       */
    });

    context('Change Streams', () => {
      /**
       * 1. Using `internalClient`, drop the `db.coll` collection.
       * 1. Using `internalClient`, set the following fail point:
       * ```js
       *        {
       *            configureFailPoint: "failCommand",
       *            mode: "alwaysOn",
       *            data: {
       *                failCommands: ["getMore"],
       *                blockConnection: true,
       *                blockTimeMS: 15
       *            }
       *        }
       * ```
       * 1. Create a new MongoClient (referred to as `client`) with `timeoutMS=20`.
       * 1. Using `client`, use the `watch` helper to create a change stream against `db.coll`.
       *    - Expect this to succeed and return a change stream with a non-zero ID.
       * 1. Call the blocking iteration method on the resulting change stream.
       *    - Expect this to fail with a timeout error.
       * 1. Verify that an `aggregate` command and two `getMore` commands were executed against the `db.coll` collection during the test.
       */
    });
  });

  context.skip('6. GridFS - Upload', () => {
    /** Tests in this section MUST only be run against server versions 4.4 and higher. */

    context('uploads via openUploadStream can be timed out', () => {
      /**
       * 1. Using `internalClient`, drop and re-create the `db.fs.files` and `db.fs.chunks` collections.
       * 1. Using `internalClient`, set the following fail point:
       * ```js
       *        {
       *            configureFailPoint: "failCommand",
       *            mode: { times: 1 },
       *            data: {
       *                failCommands: ["insert"],
       *                blockConnection: true,
       *                blockTimeMS: 15
       *            }
       *        }
       * ```
       * 1. Create a new MongoClient (referred to as `client`) with `timeoutMS=10`.
       * 1. Using `client`, create a GridFS bucket (referred to as `bucket`) that wraps the `db` database.
       * 1. Call `bucket.open_upload_stream()` with the filename `filename` to create an upload stream (referred to as `uploadStream`).
       *    - Expect this to succeed and return a non-null stream.
       * 1. Using `uploadStream`, upload a single `0x12` byte.
       * 1. Call `uploadStream.close()` to flush the stream and insert chunks.
       *    - Expect this to fail with a timeout error.
       */
    });

    context('Aborting an upload stream can be timed out', () => {
      /**
       * This test only applies to drivers that provide an API to abort a GridFS upload stream.
       * 1. Using `internalClient`, drop and re-create the `db.fs.files` and `db.fs.chunks` collections.
       * 1. Using `internalClient`, set the following fail point:
       * ```js
       *        {
       *            configureFailPoint: "failCommand",
       *            mode: { times: 1 },
       *            data: {
       *                failCommands: ["delete"],
       *                blockConnection: true,
       *                blockTimeMS: 15
       *            }
       *        }
       * ```
       * 1. Create a new MongoClient (referred to as `client`) with `timeoutMS=10`.
       * 1. Using `client`, create a GridFS bucket (referred to as `bucket`) that wraps the `db` database with `chunkSizeBytes=2`.
       * 1. Call `bucket.open_upload_stream()` with the filename `filename` to create an upload stream (referred to as `uploadStream`).
       *   - Expect this to succeed and return a non-null stream.
       * 1. Using `uploadStream`, upload the bytes `[0x01, 0x02, 0x03, 0x04]`.
       * 1. Call `uploadStream.abort()`.
       *   - Expect this to fail with a timeout error.
       */
    });
  });

  context.skip('7. GridFS - Download', () => {
    /**
     * This test MUST only be run against server versions 4.4 and higher.
     * 1. Using `internalClient`, drop and re-create the `db.fs.files` and `db.fs.chunks` collections.
     * 1. Using `internalClient`, insert the following document into the `db.fs.files` collection:
     * ```js
     *        {
     *           "_id": {
     *             "$oid": "000000000000000000000005"
     *           },
     *           "length": 10,
     *           "chunkSize": 4,
     *           "uploadDate": {
     *             "$date": "1970-01-01T00:00:00.000Z"
     *           },
     *           "md5": "57d83cd477bfb1ccd975ab33d827a92b",
     *           "filename": "length-10",
     *           "contentType": "application/octet-stream",
     *           "aliases": [],
     *           "metadata": {}
     *        }
     * ```
     * 1. Create a new MongoClient (referred to as `client`) with `timeoutMS=10`.
     * 1. Using `client`, create a GridFS bucket (referred to as `bucket`) that wraps the `db` database.
     * 1. Call `bucket.open_download_stream` with the id `{ "$oid": "000000000000000000000005" }` to create a download stream (referred to as `downloadStream`).
     *   - Expect this to succeed and return a non-null stream.
     * 1. Using `internalClient`, set the following fail point:
     * ```js
     *        {
     *            configureFailPoint: "failCommand",
     *            mode: { times: 1 },
     *            data: {
     *                failCommands: ["find"],
     *                blockConnection: true,
     *                blockTimeMS: 15
     *            }
     *        }
     * ```
     * 1. Read from the `downloadStream`.
     *   - Expect this to fail with a timeout error.
     * 1. Verify that two `find` commands were executed during the read: one against `db.fs.files` and another against `db.fs.chunks`.
     */
  });

  context('8. Server Selection', () => {
    it('serverSelectionTimeoutMS honored if timeoutMS is not set', async function () {
      /**
       * 1. Create a MongoClient (referred to as `client`) with URI `mongodb://invalid/?serverSelectionTimeoutMS=10`.
       * 1. Using `client`, execute the command `{ ping: 1 }` against the `admin` database.
       *   - Expect this to fail with a server selection timeout error after no more than 15ms.
       */
      client = new MongoClient('mongodb://invalid/?serverSelectionTimeoutMS=10');
      const admin = client.db('test').admin();
      const start = performance.now();
      const maybeError = await admin.ping().then(
        () => null,
        e => e
      );
      const end = performance.now();

      expect(maybeError).to.be.instanceof(MongoServerSelectionError);
      expect(end - start).to.be.lte(15);
    });

    it("timeoutMS honored for server selection if it's lower than serverSelectionTimeoutMS", async function () {
      /**
       * 1. Create a MongoClient (referred to as `client`) with URI `mongodb://invalid/?timeoutMS=10&serverSelectionTimeoutMS=20`.
       * 1. Using `client`, run the command `{ ping: 1 }` against the `admin` database.
       *   - Expect this to fail with a server selection timeout error after no more than 15ms.
       */
      client = new MongoClient('mongodb://invalid/?timeoutMS=10&serverSelectionTimeoutMS=20');
      const start = now();

      const maybeError = await client
        .db('test')
        .admin()
        .ping()
        .then(
          () => null,
          e => e
        );
      const end = now();

      expect(maybeError).to.be.instanceof(MongoOperationTimeoutError);
      expect(end - start).to.be.lte(15);
    });

    it("serverSelectionTimeoutMS honored for server selection if it's lower than timeoutMS", async function () {
      /**
       * 1. Create a MongoClient (referred to as `client`) with URI `mongodb://invalid/?timeoutMS=20&serverSelectionTimeoutMS=10`.
       * 1. Using `client`, run the command `{ ping: 1 }` against the `admin` database.
       *   - Expect this to fail with a server selection timeout error after no more than 15ms.
       */
      client = new MongoClient('mongodb://invalid/?timeoutMS=20&serverSelectionTimeoutMS=10');
      const start = now();
      const maybeError = await client
        .db('test')
        .admin()
        .ping()
        .then(
          () => null,
          e => e
        );
      const end = now();

      expect(maybeError).to.be.instanceof(MongoOperationTimeoutError);
      expect(end - start).to.be.lte(15);
    });

    it('serverSelectionTimeoutMS honored for server selection if timeoutMS=0', async function () {
      /**
       * 1. Create a MongoClient (referred to as `client`) with URI `mongodb://invalid/?timeoutMS=0&serverSelectionTimeoutMS=10`.
       * 1. Using `client`, run the command `{ ping: 1 }` against the `admin` database.
       *   - Expect this to fail with a server selection timeout error after no more than 15ms.
       */
      client = new MongoClient('mongodb://invalid/?timeoutMS=0&serverSelectionTimeoutMS=10');
      const start = now();
      const maybeError = await client
        .db('test')
        .admin()
        .ping()
        .then(
          () => null,
          e => e
        );
      const end = now();

      expect(maybeError).to.be.instanceof(MongoOperationTimeoutError);
      expect(end - start).to.be.lte(15);
    });

    it("timeoutMS honored for connection handshake commands if it's lower than serverSelectionTimeoutMS", async function () {
      /**
       * This test MUST only be run if the server version is 4.4 or higher and the URI has authentication fields (i.e. a
       * username and password).
       * 1. Using `internalClient`, set the following fail point:
       * ```js
       *        {
       *            configureFailPoint: failCommand,
       *            mode: { times: 1 },
       *            data: {
       *                failCommands: ["saslContinue"],
       *                blockConnection: true,
       *                blockTimeMS: 15
       *            }
       *        }
       * ```
       * 1. Create a new MongoClient (referred to as `client`) with `timeoutMS=10` and `serverSelectionTimeoutMS=20`.
       * 1. Using `client`, insert the document `{ x: 1 }` into collection `db.coll`.
       *   - Expect this to fail with a timeout error after no more than 15ms.
       */
      await internalClient
        .db('db')
        .admin()
        .command({
          configureFailPoint: 'failCommand',
          mode: { times: 1 },
          data: {
            failCommands: ['saslContinue'],
            blockConnection: true,
            blockTimeMS: 15
          }
        });

      client = this.configuration.newClient({
        serverSelectionTimeoutMS: 20,
        timeoutMS: 10
      });
      const start = now();
      const maybeError = await client
        .db('db')
        .collection('coll')
        .insertOne({ x: 1 })
        .then(
          () => null,
          e => e
        );
      const end = now();
      expect(maybeError).to.be.instanceof(MongoOperationTimeoutError);
      expect(end - start).to.be.lte(15);
    });

    it("serverSelectionTimeoutMS honored for connection handshake commands if it's lower than timeoutMS", async function () {
      /**
       * This test MUST only be run if the server version is 4.4 or higher and the URI has authentication fields (i.e. a
       * username and password).
       * 1. Using `internalClient`, set the following fail point:
       * ```js
       *        {
       *            configureFailPoint: failCommand,
       *            mode: { times: 1 },
       *            data: {
       *                failCommands: ["saslContinue"],
       *                blockConnection: true,
       *                blockTimeMS: 15
       *            }
       *        }
       * ```
       * 1. Create a new MongoClient (referred to as `client`) with `timeoutMS=20` and `serverSelectionTimeoutMS=10`.
       * 1. Using `client`, insert the document `{ x: 1 }` into collection `db.coll`.
       *   - Expect this to fail with a timeout error after no more than 15ms.
       */
      await internalClient
        .db('db')
        .admin()
        .command({
          configureFailPoint: 'failCommand',
          mode: { times: 1 },
          data: {
            failCommands: ['saslContinue'],
            blockConnection: true,
            blockTimeMS: 15
          }
        });

      client = this.configuration.newClient({
        serverSelectionTimeoutMS: 10,
        timeoutMS: 20
      });
      const start = now();
      const maybeError = await client
        .db('db')
        .collection('coll')
        .insertOne({ x: 1 })
        .then(
          () => null,
          e => e
        );
      const end = now();
      expect(maybeError).to.be.instanceof(MongoOperationTimeoutError);
      expect(end - start).to.be.lte(15);
    });
  });

  context.skip('9. endSession', () => {
    /**
     * This test MUST only be run against replica sets and sharded clusters with server version 4.4 or higher. It MUST be
     * run three times: once with the timeout specified via the MongoClient `timeoutMS` option, once with the timeout
     * specified via the ClientSession `defaultTimeoutMS` option, and once more with the timeout specified via the
     * `timeoutMS` option for the `endSession` operation. In all cases, the timeout MUST be set to 10 milliseconds.
     *
     * 1. Using `internalClient`, drop the `db.coll` collection.
     * 1. Using `internalClient`, set the following fail point:
     * ```js
     * {
     *     configureFailPoint: failCommand,
     *     mode: { times: 1 },
     *     data: {
     *         failCommands: ["abortTransaction"],
     *         blockConnection: true,
     *         blockTimeMS: 15
     *     }
     * }
     * ```
     * 1. Create a new MongoClient (referred to as `client`) and an explicit ClientSession derived from that MongoClient (referred to as `session`).
     * 1. Execute the following code:
     * ```ts
     *   coll = client.database("db").collection("coll")
     *   session.start_transaction()
     *   coll.insert_one({x: 1}, session=session)
     * ```
     * 1. Using `session`, execute `session.end_session`
     *    - Expect this to fail with a timeout error after no more than 15ms.
     */
  });

  context.skip('10. Convenient Transactions', () => {
    /** Tests in this section MUST only run against replica sets and sharded clusters with server versions 4.4 or higher. */

    context('timeoutMS is refreshed for abortTransaction if the callback fails', () => {
      /**
       * 1. Using `internalClient`, drop the `db.coll` collection.
       * 1. Using `internalClient`, set the following fail point:
       * ```js
       * {
       *     configureFailPoint: failCommand,
       *     mode: { times: 2 },
       *     data: {
       *         failCommands: ["insert", "abortTransaction"],
       *         blockConnection: true,
       *         blockTimeMS: 15
       *     }
       * }
       * ```
       * 1. Create a new MongoClient (referred to as `client`) configured with `timeoutMS=10` and an explicit ClientSession derived from that MongoClient (referred to as `session`).
       * 1. Using `session`, execute a `withTransaction` operation with the following callback:
       * ```js
       * function callback() {
       *   coll = client.database("db").collection("coll")
       *   coll.insert_one({ _id: 1 }, session=session)
       * }
       * ```
       * 1. Expect the previous `withTransaction` call to fail with a timeout error.
       * 1. Verify that the following events were published during the `withTransaction` call:
       *   1. `command_started` and `command_failed` events for an `insert` command.
       *   1. `command_started` and `command_failed` events for an `abortTransaction` command.
       */
    });
  });
});
