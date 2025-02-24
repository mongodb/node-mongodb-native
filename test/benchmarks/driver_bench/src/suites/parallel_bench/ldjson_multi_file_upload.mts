import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';

import { driver, type mongodb, PARALLEL_DIRECTORY, TAG } from '../../driver.mjs';

export const taskSize = 565;
export const tags = [TAG.spec, TAG.alert, TAG.write];

const directory = path.resolve(PARALLEL_DIRECTORY, 'ldjson_multi');
let collection: mongodb.Collection;

export async function beforeEach() {
  await driver.drop();
  await driver.create();

  collection = driver.client.db(driver.DB_NAME).collection(driver.COLLECTION_NAME);
}

export async function run() {
  const files = await fs.readdir(directory);
  const uploads = files.map(async file => {
    const fileStream = createReadStream(path.resolve(directory, file));
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

export async function after() {
  await driver.drop();
  await driver.close();
}
