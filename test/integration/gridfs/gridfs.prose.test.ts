import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

import { expect } from 'chai';

import {
  type Db,
  GridFSBucket,
  MinKey,
  type MongoClient,
  MongoRuntimeError,
  type ObjectId
} from '../../mongodb';

describe('GridFS Prose Tests', function () {
  let client: MongoClient;
  let db: Db;

  beforeEach(async function () {
    client = this.configuration.newClient();
    db = client.db('gridfs_prose_tests');
  });

  afterEach(async function () {
    await db.dropDatabase().catch(() => null);
    await client.close();
  });

  describe("1. Aborting an upload with an injected file ID does not delete other files' chunks", function () {
    // This test asserts that the delete command executed when a GridFS upload stream is aborted does not delete chunks
    // associated with other files.
    //
    // This test MUST be skipped on server versions older than 5.0. (These versions do not support document values with
    // "$"-prefixed keys.)

    it(
      'does not delete chunks of other files',
      { requires: { mongodb: '>=5.0' } },
      async function () {
        // 1. Create a GridFS bucket (referred to as `bucket`).
        const bucket = new GridFSBucket(db);
        //    Drop `bucket` to clear its contents.
        await bucket.drop();

        // 2. Construct a small, non-empty vector of bytes to upload to a GridFS file (referred to as `file1Bytes`).
        const file1Bytes = Buffer.from([0x11, 0x22, 0x33, 0x44]);
        //    Upload `file1Bytes` to `bucket` with the filename of "file1".
        await pipeline(Readable.from([file1Bytes]), bucket.openUploadStream('file1'));

        // 3. Open an upload stream from `bucket` with a filename of "file2", a file ID of `{ "$gt": MinKey }`, and
        //    `chunkSizeBytes` set to 2 (referred to as `uploadStream`).
        const injectedId = { $gt: new MinKey() } as unknown as ObjectId;
        const uploadStream = bucket.openUploadStreamWithId(injectedId, 'file2', {
          chunkSizeBytes: 2
        });

        // 4. Write a vector containing 4 bytes to `uploadStream`.
        const write = promisify(uploadStream.write.bind(uploadStream));
        await write(Buffer.from([0x55, 0x66, 0x77, 0x88]));
        //    Then, abort `uploadStream`.
        await uploadStream.abort();

        // 5. Download the contents of "file1" from `bucket`.
        const file1Chunks = await bucket.openDownloadStreamByName('file1').toArray();
        //    Assert that the downloaded contents match `file1Bytes`.
        expect(Buffer.concat(file1Chunks)).to.deep.equal(file1Bytes);

        // 6. Attempt to download the contents of "file2" from `bucket`.
        const error = await bucket
          .openDownloadStreamByName('file2')
          .toArray()
          .catch(error => error);
        //    Assert that the download fails with a "FileNotFound" error.
        expect(error).to.be.instanceOf(MongoRuntimeError);
        expect(error.message).to.include('FileNotFound');
      }
    );
  });
});
