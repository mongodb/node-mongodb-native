import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { driver, type mongodb } from '../../driver.mjs';

export const taskSize = 52.43;

let bucket: mongodb.GridFSBucket;
let bin: Uint8Array;
let _id: mongodb.ObjectId;
const devNull = () => new Writable({ write: (_, __, callback) => callback() });

export async function before() {
  bin = await driver.load('single_and_multi_document/gridfs_large.bin', 'buffer');

  await driver.drop();
  await driver.create();

  bucket = driver.bucket(driver.client.db(driver.DB_NAME));

  await bucket.drop().catch(() => null);

  // Create the bucket.
  const stream = bucket.openUploadStream('gridfstest');
  const largeBin = Readable.from(bin);
  await pipeline(largeBin, stream);

  _id = stream.id;
}

export async function run() {
  const downloadStream = bucket.openDownloadStream(_id);
  await pipeline(downloadStream, devNull());
}

export async function after() {
  await driver.drop();
  await driver.close();
}
