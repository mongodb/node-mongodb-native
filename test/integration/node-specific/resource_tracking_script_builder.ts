import { fork } from 'node:child_process';
import { on, once } from 'node:events';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import { expect } from 'chai';
import { parseSnapshot } from 'v8-heapsnapshot';

import { type MongoClient } from '../../mongodb';
import { type TestConfiguration } from '../../tools/runner/config';

export type ResourceTestFunction = (options: {
  MongoClient: typeof MongoClient;
  uri: string;
  iteration: number;
}) => Promise<void>;

const RESOURCE_SCRIPT_PATH = path.resolve(__dirname, '../../tools/fixtures/resource_script.in.js');
const DRIVER_SRC_PATH = JSON.stringify(path.resolve(__dirname, '../../../lib'));

export async function testScriptFactory(
  name: string,
  uri: string,
  iterations: number,
  func: ResourceTestFunction
) {
  let resourceScript = await readFile(RESOURCE_SCRIPT_PATH, { encoding: 'utf8' });

  resourceScript = resourceScript.replace('DRIVER_SOURCE_PATH', DRIVER_SRC_PATH);
  resourceScript = resourceScript.replace('FUNCTION_STRING', `(${func.toString()})`);
  resourceScript = resourceScript.replace('NAME_STRING', JSON.stringify(name));
  resourceScript = resourceScript.replace('URI_STRING', JSON.stringify(uri));
  resourceScript = resourceScript.replace('ITERATIONS_STRING', `${iterations}`);

  return resourceScript;
}

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

  const scriptContent = await testScriptFactory(name, config.url(), iterations, func);
  await writeFile(scriptName, scriptContent, { encoding: 'utf8' });

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
  expect(exitCode, 'process should have exited with zero').to.equal(0);

  const heap = await readFile(heapsnapshotFile, { encoding: 'utf8' }).then(c =>
    parseSnapshot(JSON.parse(c))
  );

  // If any of the above throws we won't reach these unlinks that clean up the created files.
  // This is intentional so that when debugging the file will still be present to check it for errors
  await unlink(scriptName);
  await unlink(heapsnapshotFile);

  return {
    startingMemoryUsed,
    endingMemoryUsed,
    heap
  };
}
