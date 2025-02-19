import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import stream from 'node:stream/promises';

import { driver, EJSON, type mongodb, PARALLEL_DIRECTORY, TAG, TEMP_DIRECTORY } from '../../driver.mjs';

export const taskSize = 565;
export const tags = [TAG.spec, TAG.alert, TAG.write];

let collection: mongodb.Collection;

export async function before() {
  await driver.drop();
  await driver.create();
  await driver.resetTmpDir();

  collection = driver.client.db(driver.DB_NAME).collection(driver.COLLECTION_NAME);

  const ldjson_multi = path.resolve(PARALLEL_DIRECTORY, 'ldjson_multi');

  const files = (await fs.readdir(ldjson_multi)).map(fileName =>
    path.resolve(ldjson_multi, fileName)
  );

  const uploads = files.map(async fileName => {
    const fileStream = createReadStream(fileName);
    const lineReader = readline.createInterface({
      input: fileStream
    });

    const operations = [];

    for await (const line of lineReader) {
      operations.push({
        insertOne: {
          document: JSON.parse(line)
        }
      });
    }

    fileStream.close();
    lineReader.close();

    return await collection.bulkWrite(operations);
  });

  await Promise.all(uploads);
}

export async function beforeEach() {
  await driver.resetTmpDir();
}

export async function run() {
  const skips = Array.from({ length: 100 }, (_, index) => index * 5000);

  const promises = skips.map(async skip => {
    const documentCursor = collection.find({}, { skip, limit: 5000 });
    documentCursor.map(doc => EJSON.stringify(doc));
    const outputStream = createWriteStream(path.resolve(TEMP_DIRECTORY, `tmp-${skip}.txt`));
    return await stream.pipeline(documentCursor.stream(), outputStream);
  });

  await Promise.all(promises);
}

export async function afterEach() {
  await driver.resetTmpDir();
}

export async function after() {
  await driver.drop();
  await driver.close();
}
