import { driver, type mongodb } from '../../driver.mjs';

export const taskSize = 16.22;

let collection: mongodb.Collection;

export async function before() {
  await driver.drop();
  await driver.create();

  const tweet = await driver.load('single_and_multi_document/tweet.json', 'json');
  await driver.insertManyOf(tweet, 10000);

  collection = driver.collection;
}

export async function run() {
  await collection.find({}).toArray();
}

export async function after() {
  await driver.drop();
  await driver.close();
}
