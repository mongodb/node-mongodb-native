import { driver, type mongodb } from '../../driver.mjs';

export const taskSize = 2.75;

let collection: mongodb.Collection;
let documents: any[];

export async function before() {
  const smallDoc = await driver.load('single_and_multi_document/small_doc.json', 'json');
  documents = Array.from({ length: 10000 }, () => ({ ...smallDoc })) as any[];
}

export async function beforeEach() {
  await driver.drop();
  collection = await driver.create();
}

export async function run() {
  await collection.insertMany(documents, { ordered: true });
}

export async function after() {
  await driver.drop();
  await driver.close();
}
