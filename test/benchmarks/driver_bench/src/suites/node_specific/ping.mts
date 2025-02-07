import { driver, type mongodb } from '../../driver.mjs';

// { ping: 1 } is 15 bytes of BSON x 10,000 iterations
export const taskSize = 0.15;

let db: mongodb.Db;

export async function before() {
  await driver.drop();
  await driver.create();

  db = driver.client.db(driver.DB_NAME);
}

export async function run() {
  for (let i = 0; i < 10000; ++i) {
    await db.command({ ping: 1 });
  }
}

export async function after() {
  await driver.drop();
  await driver.close();
}
