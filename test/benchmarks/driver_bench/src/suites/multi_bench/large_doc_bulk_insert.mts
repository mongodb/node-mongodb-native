import { driver, type mongodb, TAG } from '../../driver.mjs';

export const taskSize = 27.31;
export const tags = [TAG.alert, TAG.spec, TAG.write];

let collection: mongodb.Collection;
let documents: any[];
let largeDoc: any;

export async function before() {
  largeDoc = await driver.load('single_and_multi_document/large_doc.json', 'json');
}

export async function beforeEach() {
  await driver.drop();
  await driver.create();

  // Make new "documents" so the _id field is not carried over from the last run
  documents = Array.from({ length: 10 }, () => ({ ...largeDoc })) as any[];

  collection = driver.client.db(driver.DB_NAME).collection(driver.COLLECTION_NAME);
}

export async function run() {
  await collection.insertMany(documents, { ordered: true });
}

export async function after() {
  await driver.drop();
  await driver.close();
}
