/* eslint-disable @typescript-eslint/no-unused-vars */
import { driver, type mongodb } from '../../driver.mjs';

export const taskSize = 16.22;

let collection: mongodb.Collection;

export async function before() {
  await driver.drop();
  await driver.create();

  const tweet = await driver.load('single_and_multi_document/tweet.json', 'json');
  await driver.insertManyOf(tweet, 10000);

  collection = driver.client.db(driver.DB_NAME).collection(driver.COLLECTION_NAME);
}

export async function run() {
  for await (const doc of collection.find({})) {
    // empty
  }
}

export async function after() {
  await driver.drop();
  await driver.close();
}
