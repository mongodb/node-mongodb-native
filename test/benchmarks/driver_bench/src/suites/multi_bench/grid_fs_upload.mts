import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { driver, type mongodb } from '../../driver.mjs';

export const taskSize = 52.43;

let bucket: mongodb.GridFSBucket;
let uploadStream: mongodb.GridFSBucketWriteStream;
let bin: Uint8Array;

export async function before() {
  bin = await driver.load('single_and_multi_document/gridfs_large.bin', 'buffer');

  await driver.drop();
  await driver.create();

  bucket = driver.bucket;

  await bucket.drop().catch(() => null);
}

export async function beforeEach() {
  uploadStream = bucket.openUploadStream('gridfstest');

  // Create the bucket.
  const stream = bucket.openUploadStream('setup-file.txt');
  const oneByteFile = Readable.from('a');
  await pipeline(oneByteFile, stream);
}

export async function run() {
  const uploadData = Readable.from(bin);
  await pipeline(uploadData, uploadStream);
}

export async function after() {
  await driver.drop();
  await driver.close();
}
