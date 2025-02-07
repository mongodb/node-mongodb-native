import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { driver, type mongodb, PARALLEL_DIRECTORY } from '../../driver.mjs';

export const taskSize = 262.144;

let bucket: mongodb.GridFSBucket;

const directory = path.resolve(PARALLEL_DIRECTORY, 'gridfs_multi');

export async function before() {
  await driver.drop();
  await driver.create();

  bucket = driver.bucket(driver.client.db(driver.DB_NAME));

  await bucket.drop().catch(() => null);
}

export async function beforeEach() {
  // Create the bucket.
  const stream = bucket.openUploadStream('setup-file.txt');
  const oneByteFile = Readable.from('a');
  await pipeline(oneByteFile, stream);
}

export async function run() {
  const files = await fs.readdir(directory);

  const uploadPromises = files.map(async filename => {
    const file = path.resolve(directory, filename);
    const fileStream = createReadStream(file);
    const uploadStream = bucket.openUploadStream(file);
    return await pipeline(fileStream, uploadStream);
  });

  await Promise.all(uploadPromises);
}

export async function after() {
  await driver.drop();
  await driver.close();
}
