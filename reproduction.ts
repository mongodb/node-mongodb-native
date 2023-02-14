import { setTimeout } from 'timers/promises';

import { MongoClient } from './src';

// a simple script that shows the difference in event ordering.
// comment / uncomment the event listener removal in the Connection
// class and observe that there is no `close` event emitted for
// non-monitoring connections
async function main() {
  const client = new MongoClient(process.env.MONGODB_URI!);

  await client.connect();

  await client.db().command({ ping: 1 });

  await client.close();

  await setTimeout(1);

  // with the changes, there's always a socket leak. Without them, there is no socket leak.
  console.error(process.getActiveResourcesInfo());
}

process.on('unhandledRejection', rejection => console.log(rejection));
process.on('uncaughtException', rejection => console.log(rejection));

main();
