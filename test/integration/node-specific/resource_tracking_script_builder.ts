import { fork } from 'node:child_process';
import { on, once } from 'node:events';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import { expect } from 'chai';
import { parseSnapshot } from 'v8-heapsnapshot';

import { MongoClient } from '../../mongodb';
import { TestConfiguration } from '../../tools/runner/config';

export type ResourceTestFunction = (options: {
  MongoClient: typeof MongoClient;
  uri: string;
  iteration: number;
}) => Promise<void>;

export const testScriptFactory = (
  name: string,
  uri: string,
  iterations: number,
  func: ResourceTestFunction
) => `'use strict';

const { MongoClient } = require(${JSON.stringify(path.resolve(__dirname, '../../../lib'))});
const process = require('node:process');
const v8 = require('node:v8');
const util = require('node:util');
const timers = require('node:timers');
const sleep = util.promisify(timers.setTimeout)

const run = (${func.toString()});

const MB = (2 ** 10) ** 2;
async function main() {
  const startingMemoryUsed = process.memoryUsage().heapUsed / MB;
  process.send({ startingMemoryUsed });

  for (let iteration = 0; iteration < ${iterations}; iteration++) {
    await run({ MongoClient, uri: ${JSON.stringify(uri)}, iteration });
    global.gc();
  }

  global.gc();
  // Sleep b/c maybe gc will run
  await sleep(100);
  global.gc();

  const endingMemoryUsed = process.memoryUsage().heapUsed / MB;
  process.send({ endingMemoryUsed });
  v8.writeHeapSnapshot(${JSON.stringify(`${name}.heapsnapshot.json`)});
}

main()
  .then(result => {
    process.exit(0);
  })
  .catch(error => {
    process.exit(1);
  });
`;

/**
 * A helper for running arbitrary MongoDB Driver scripting code in a resource information collecting script
 *
 * **The provided function is run in an isolated Node.js process**
 *
 * A user of this function will likely need to familiarize themselves with the surrounding scripting, but briefly:
 * - Every MongoClient you construct should have an asyncResource attached to it like so:
 * ```js
 * mongoClient.asyncResource = new this.async_hooks.AsyncResource('MongoClient');
 * ```
 * - You can perform any number of operations and connects/closes of MongoClients
 * - The result of this function will be:
 *   - the startup and teardown memory usage
 *   - the number of AsyncResources with type === 'MongoClient' that did not get cleaned up by a destroy hook
 *   - the heap snapshot parsed by 'v8-heapsnapshot'
 *
 * @param name - the name of the script, this defines the name of the file, it will be cleaned up if the function returns successfully
 * @param config - `this.configuration` from your mocha config
 * @param func - your javascript function, you can write it inline! this will stringify the function, use the references on the `this` context to get typechecking
 * @param options - settings for the script
 * @throws Error - if the process exits with failure
 */
export async function runScript(
  name: string,
  config: TestConfiguration,
  func: ResourceTestFunction,
  { iterations = 100 } = {}
) {
  const scriptName = `${name}.cjs`;
  const heapsnapshotFile = `${name}.heapsnapshot.json`;

  await writeFile(scriptName, testScriptFactory(name, config.url(), iterations, func), {
    encoding: 'utf8'
  });

  const processDiedController = new AbortController();
  const script = fork(scriptName, { execArgv: ['--expose-gc'] });
  // Interrupt our awaiting of messages if the process crashed
  script.once('close', exitCode => {
    if (exitCode !== 0) {
      processDiedController.abort(new Error(`process exited with: ${exitCode}`));
    }
  });

  const messages = on(script, 'message', { signal: processDiedController.signal });
  const willClose = once(script, 'close');

  const starting = await messages.next();
  const ending = await messages.next();

  const startingMemoryUsed = starting.value[0].startingMemoryUsed;
  const endingMemoryUsed = ending.value[0].endingMemoryUsed;

  // make sure the process ended
  const [exitCode] = await willClose;
  expect(exitCode).to.equal(0);

  const heap = await readFile(heapsnapshotFile, { encoding: 'utf8' }).then(c =>
    parseSnapshot(JSON.parse(c))
  );

  await unlink(scriptName);
  await unlink(heapsnapshotFile);

  return {
    startingMemoryUsed,
    endingMemoryUsed,
    heap
  };
}
