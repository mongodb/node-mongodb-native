import { driver, TAG, type mongodb } from '../../driver.mjs';

export const taskSize = 16.22;
export const tags = [TAG.spec, TAG.alert, TAG.cursor, TAG.read];

let collection: mongodb.Collection<{ _id: number }>;

export async function before() {
  await driver.drop();
  await driver.create();

  const tweet = await driver.load('single_and_multi_document/tweet.json', 'json');
  await driver.insertManyOf(tweet, 10000, true);

  collection = driver.client.db(driver.DB_NAME).collection(driver.COLLECTION_NAME);
}

export async function run() {
  for (let _id = 0; _id < 10000; ++_id) {
    await collection.findOne({ _id });
  }
}

export async function after() {
  await driver.drop();
  await driver.close();
}
