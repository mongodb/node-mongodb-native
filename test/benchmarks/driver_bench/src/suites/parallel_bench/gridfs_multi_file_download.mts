import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import { driver, type mongodb, PARALLEL_DIRECTORY, TEMP_DIRECTORY } from '../../driver.mjs';

export const taskSize = 262.144;

let bucket: mongodb.GridFSBucket;

export async function before() {
  await driver.drop();
  await driver.create();
  await driver.resetTmpDir();

  bucket = driver.bucket(driver.client.db(driver.DB_NAME));
  await bucket.drop().catch(() => null);

  const gridfs_multi = path.resolve(PARALLEL_DIRECTORY, 'gridfs_multi');

  const files = (await fs.readdir(gridfs_multi)).map(filename =>
    path.resolve(gridfs_multi, filename)
  );

  const uploadPromises = files.map(async filename => {
    const fileStream = createReadStream(filename);
    const uploadStream = bucket.openUploadStream(filename);
    return await pipeline(fileStream, uploadStream);
  });

  await Promise.all(uploadPromises);
}

export async function beforeEach() {
  await driver.resetTmpDir();
}

export async function run() {
  const files = await bucket
    .find()
    .map(({ _id }) => ({
      path: path.resolve(TEMP_DIRECTORY, `${_id}.txt`),
      _id
    }))
    .toArray();

  const downloads = files.map(async ({ _id, path }) => {
    const fileStream = createWriteStream(path);
    const downloadStream = bucket.openDownloadStream(_id);
    return await pipeline(downloadStream, fileStream);
  });

  await Promise.all(downloads);
}

export async function afterEach() {
  await driver.resetTmpDir();
}

export async function after() {
  await driver.drop();
  await driver.close();
}
