import { driver, type mongodb } from '../../driver.mjs';

// { hello: true } is 13 bytes of BSON x 10,000 iterations
export const taskSize = 0.13;

let db: mongodb.Db;

export async function before() {
  await driver.drop();
  await driver.create();

  db = driver.client.db(driver.DB_NAME);
}

export async function run() {
  for (let i = 0; i < 10000; ++i) {
    await db.command({ hello: true });
  }
}

export async function after() {
  await driver.drop();
  await driver.close();
}
