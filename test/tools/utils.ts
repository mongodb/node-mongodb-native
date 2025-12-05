import * as child_process from 'node:child_process';
import { on, once } from 'node:events';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { EJSON } from 'bson';
import * as BSON from 'bson';
import { expect } from 'chai';
import { Readable } from 'stream';
import { setTimeout } from 'timers';
import { inspect, promisify } from 'util';

import {
  type AnyClientBulkWriteModel,
  type Document,
  type HostAddress,
  MongoClient,
  type MongoClientOptions,
  type TopologyOptions
} from '../../src';
import { OP_MSG } from '../../src/cmap/wire_protocol/constants';
import { Topology } from '../../src/sdam/topology';
import { processTimeMS } from '../../src/utils';
import { type TestConfiguration } from './runner/config';

export function ensureCalledWith(stub: any, args: any[]) {
  args.forEach((m: any) => expect(stub).to.have.been.calledWith(m));
}

export class EventCollector {
  private _events: Record<string, any[]>;
  private _timeout: number;
  constructor(
    obj: { on: (arg0: any, arg1: (event: any) => number) => void },
    events: any[],
    options?: { timeout: number }
  ) {
    this._events = Object.create(null);
    this._timeout = options ? options.timeout : 5000;

    events.forEach((eventName: string | number) => {
      this._events[eventName] = [];
      obj.on(eventName, (event: any) => this._events[eventName].push(event));
    });
  }

  waitForEvent(eventName: string, callback: (error?: Error, events?: any[]) => void): void;
  waitForEvent(
    eventName: string,
    count: number,
    callback: (error?: Error, events?: any[]) => void
  ): void;
  waitForEvent(
    eventName: string,
    count: number | ((error?: Error, events?: any[]) => void),
    callback?: (error?: Error, events?: any[]) => void
  ): void {
    if (typeof count === 'function') {
      callback = count;
      count = 1;
    }

    this.waitForEventImpl(this, Date.now(), eventName, count, callback);
  }

  reset(eventName: string) {
    if (eventName == null) {
      Object.keys(this._events).forEach(eventName => {
        this._events[eventName] = [];
      });

      return;
    }

    if (this._events[eventName] == null) {
      throw new TypeError(`invalid event name "${eventName}" specified for reset`);
    }

    this._events[eventName] = [];
  }

  waitForEventImpl(
    collector: this,
    start: number,
    eventName: string | number,
    count: number,
    callback: (error?: Error, events?: any[]) => void
  ) {
    const events = collector._events[eventName];
    if (events.length >= count) {
      return callback(undefined, events);
    }

    if (Date.now() - start >= collector._timeout) {
      return callback(new Error(`timed out waiting for event "${eventName}"`));
    }

    setTimeout(() => this.waitForEventImpl(collector, start, eventName, count, callback), 10);
  }
}

export function getEncryptExtraOptions(): MongoClientOptions['autoEncryption']['extraOptions'] {
  if (
    typeof process.env.CRYPT_SHARED_LIB_PATH === 'string' &&
    process.env.CRYPT_SHARED_LIB_PATH.length > 0
  ) {
    return { cryptSharedLibPath: process.env.CRYPT_SHARED_LIB_PATH };
  }
  return {};
}

export function getEnvironmentalOptions() {
  const options = {};
  if (process.env.MONGODB_API_VERSION) {
    Object.assign(options, {
      serverApi: { version: process.env.MONGODB_API_VERSION }
    });
  }
  return options;
}

/**
 * Use as a template string tag to stringify objects in the template string
 * Attempts to use EJSON (to make type information obvious)
 * falls back to util.inspect if there's an error (circular reference)
 */
export function ejson(strings: TemplateStringsArray, ...values: any[]) {
  const stringParts = [strings[0]];
  for (const [idx, value] of values.entries()) {
    if (typeof value === 'object') {
      let stringifiedObject: string;
      try {
        stringifiedObject = EJSON.stringify(value, { relaxed: false });
      } catch {
        stringifiedObject = inspect(value, {
          depth: Infinity,
          showHidden: true,
          compact: true
        });
      }
      stringParts.push(stringifiedObject);
    } else {
      stringParts.push(String(value));
    }
    stringParts.push(strings[idx + 1]);
  }

  return stringParts.join('');
}

/**
 * Run an async function after some set timeout
 * @param fn - function to run
 * @param ms - timeout in MS
 */
export const runLater = (fn: () => Promise<void>, ms: number) => {
  return new Promise<void>((resolve, reject) => {
    setTimeout(() => fn().then(resolve).catch(reject), ms);
  });
};

export const sleep = promisify(setTimeout);

/**
 * If you are using sinon fake timers, it can end up blocking queued IO from running
 * awaiting a setTimeout call will allow the event loop to process Networking/FS callbacks
 */
export const processTick = () => new Promise(resolve => setTimeout(resolve, 0));

export function getIndicesOfAuthInUrl(connectionString: string | string[]) {
  const doubleSlashIndex = connectionString.indexOf('//');
  const atIndex = connectionString.indexOf('@');

  if (doubleSlashIndex === -1 || atIndex === -1) {
    return null;
  }

  return {
    start: doubleSlashIndex + 2,
    end: atIndex
  };
}

export function removeAuthFromConnectionString(connectionString: string) {
  const indices = getIndicesOfAuthInUrl(connectionString);
  if (!indices) {
    return connectionString;
  }

  const { start, end } = indices;

  if (start === -1 || end === -1) {
    return connectionString;
  }

  return connectionString.slice(0, start) + connectionString.slice(end + 1);
}

export function extractAuthFromConnectionString(connectionString: string | any[]) {
  const indices = getIndicesOfAuthInUrl(connectionString);
  if (!indices) {
    return null;
  }

  return connectionString.slice(indices.start, indices.end);
}

export interface FailPoint {
  configureFailPoint: 'failCommand' | 'failGetMoreAfterCursorCheckout' | 'maxTimeNeverTimeOut';
  mode: { activationProbability: number } | { times: number } | 'alwaysOn' | 'off';
}

export interface FailCommandFailPoint extends FailPoint {
  configureFailPoint: 'failCommand';
  data: {
    failCommands: string[];
    errorCode?: number;
    closeConnection?: boolean;
    blockConnection?: boolean;
    blockTimeMS?: number;
    writeConcernError?: { code: number; errmsg?: string; errorLabels?: string[] };
    threadName?: string;
    failInternalCommands?: boolean;
    errorLabels?: string[];
    appName?: string;
    namespace?: string;
  };
}

export function bufferToStream(buffer) {
  const stream = new Readable();
  if (Array.isArray(buffer)) {
    buffer.forEach(b => stream.push(b));
  } else {
    stream.push(buffer);
  }

  stream.push(null);
  return stream;
}

export function generateOpMsgBuffer(document: Document): Buffer {
  const header = Buffer.alloc(4 * 4 + 4);

  const typeBuffer = Buffer.alloc(1);
  typeBuffer[0] = 0;

  const docBuffer = BSON.serialize(document);

  const totalLength = header.length + typeBuffer.length + docBuffer.length;

  header.writeInt32LE(totalLength, 0);
  header.writeInt32LE(0, 4);
  header.writeInt32LE(0, 8);
  header.writeInt32LE(OP_MSG, 12);
  header.writeUInt32LE(0, 16);
  return Buffer.concat([header, typeBuffer, docBuffer]);
}

export const alphabetically = (a: any, b: any) => {
  const res = `${a}`.localeCompare(`${b}`, 'en-US', {
    usage: 'sort',
    numeric: true,
    ignorePunctuation: false
  });
  return res < 0 ? -1 : res > 0 ? 1 : 0;
};

export const sorted = <T>(iterable: Iterable<T>, how: (a: T, b: T) => 0 | 1 | -1) => {
  if (typeof how !== 'function') {
    throw new TypeError('must provide a "how" function to sorted');
  }
  const items = Array.from(iterable);
  items.sort(how);
  return items;
};

/**
 * This helper method is necessary as the changes in NODE-4720 required the Topology constructor to
 * accept a client with access to a logger. This helper serves to keep old tests working with minimal
 * changes*/
export function topologyWithPlaceholderClient(
  seeds: string | string[] | HostAddress | HostAddress[],
  options: Partial<TopologyOptions>
): Topology {
  return new Topology(
    new MongoClient('mongodb://iLoveJavaScript'),
    seeds,
    options as TopologyOptions
  );
}

export async function itInNodeProcess(
  title: string,
  fn: (d: { expect: typeof import('chai').expect }) => void
) {
  it(title, async () => {
    const script = `
      import { expect } from 'chai';
      const run = ${fn};
      run({ expect }).then(
        () => {
          process.exitCode = 0;
        },
        error => {
          console.error(error)
          process.exitCode = 1;
        }
      );\n`;

    const scriptName = `./testing_${title.split(/\s/).join('_')}_script.cts`;
    const cwd = path.resolve(__dirname, '..', '..');
    const tsNode = path.resolve(__dirname, '..', '..', 'node_modules', '.bin', 'ts-node');
    try {
      await fs.writeFile(scriptName, script, { encoding: 'utf8' });
      const scriptInstance = child_process.fork(scriptName, {
        signal: AbortSignal.timeout(50_000),
        cwd,
        stdio: 'pipe',
        execArgv: [tsNode]
      });

      scriptInstance.stdout?.setEncoding('utf8');
      scriptInstance.stderr?.setEncoding('utf8');

      let stdout = '';
      scriptInstance.stdout?.addListener('data', data => {
        stdout += data;
      });

      let stderr = '';
      scriptInstance.stderr?.addListener('data', (data: string) => {
        stderr += data;
      });

      // do not fail the test if the debugger is running
      stderr = stderr
        .split('\n')
        .filter(line => !line.startsWith('Debugger') && !line.startsWith('For help'))
        .join('\n');

      const [exitCode] = await once(scriptInstance, 'close');

      if (stderr.length) console.log(stderr);
      expect({ exitCode, stdout, stderr }).to.deep.equal({ exitCode: 0, stdout: '', stderr: '' });
    } finally {
      await fs.unlink(scriptName);
    }
  });
}

/**
 * Connects the client and waits until `client` has emitted `count` connectionCreated events.
 *
 * **This will hang if the client does not have a maxPoolSizeSet!**
 *
 * This is useful when you want to ensure that the client has pools that are full of connections.
 *
 * This does not guarantee that all pools that the client has are completely full unless
 * count = number of servers to which the client is connected * maxPoolSize.  But it can
 * serve as a way to ensure that some connections have been established and are in the pools.
 */
export async function waitUntilPoolsFilled(
  client: MongoClient,
  signal: AbortSignal,
  count: number = client.s.options.maxPoolSize
): Promise<void> {
  let connectionCount = 0;

  async function wait$() {
    for await (const _event of on(client, 'connectionCreated', { signal })) {
      connectionCount++;
      if (connectionCount >= count) {
        break;
      }
    }
  }

  await Promise.all([wait$(), client.connect()]);
}

export async function configureFailPoint(
  configuration: TestConfiguration,
  failPoint: FailPoint,
  uri?: string | undefined
);
export async function configureFailPoint(
  configuration: TestConfiguration,
  failPoint: FailCommandFailPoint,
  uri?: string | undefined
);
export async function configureFailPoint<T extends FailPoint>(
  configuration: TestConfiguration,
  failPoint: T,
  uri = configuration.url()
) {
  const utilClient = configuration.newClient(uri);
  await utilClient.connect();

  try {
    await utilClient.db('admin').command(failPoint);
  } finally {
    await utilClient.close();
  }
}

export async function clearFailPoint(
  configuration: TestConfiguration,
  failPoint: FailPoint['configureFailPoint'] = 'failCommand',
  url = configuration.url()
) {
  const utilClient = configuration.newClient(url);
  await utilClient.connect();

  try {
    await utilClient.db('admin').command(<FailPoint>{
      configureFailPoint: failPoint,
      mode: 'off'
    });
  } finally {
    await utilClient.close();
  }
}

export async function makeMultiBatchWrite(
  configuration: TestConfiguration
): Promise<AnyClientBulkWriteModel<any>[]> {
  const { maxBsonObjectSize, maxMessageSizeBytes } = await configuration.hello();

  const length = maxMessageSizeBytes / maxBsonObjectSize + 1;
  const models = Array.from({ length }, () => ({
    namespace: 'db.coll',
    name: 'insertOne' as const,
    document: { a: 'b'.repeat(maxBsonObjectSize - 500) }
  }));

  return models;
}

export async function makeMultiResponseBatchModelArray(
  configuration: TestConfiguration
): Promise<AnyClientBulkWriteModel<any>[]> {
  const { maxBsonObjectSize } = await configuration.hello();
  const namespace = `foo.${new BSON.ObjectId().toHexString()}`;
  const models: AnyClientBulkWriteModel<any>[] = [
    {
      name: 'updateOne',
      namespace,
      update: { $set: { age: 1 } },
      upsert: true,
      filter: { _id: 'a'.repeat(maxBsonObjectSize / 2) }
    },
    {
      name: 'updateOne',
      namespace,
      update: { $set: { age: 1 } },
      upsert: true,
      filter: { _id: 'b'.repeat(maxBsonObjectSize / 2) }
    }
  ];

  return models;
}

export function fakeServer() {
  return {
    s: { state: 'connected' },
    removeListener: () => true,
    pool: {
      checkOut: async () => ({}),
      checkIn: () => undefined
    }
  };
}

/**
 * A utility to measure the duration of an async function.  This is intended to be used for CSOT
 * testing, where we expect to timeout within a certain threshold and want to measure the duration
 * of that operation.
 */
export async function measureDuration<T>(f: () => Promise<T>): Promise<{
  duration: number;
  result: T | Error;
}> {
  const start = processTimeMS();
  const result = await f().catch(e => e);
  const end = processTimeMS();
  return {
    duration: end - start,
    result
  };
}

export function mergeTestMetadata(
  metadata: MongoDBMetadataUI,
  newMetadata: MongoDBMetadataUI
): MongoDBMetadataUI {
  return {
    requires: {
      ...metadata.requires,
      ...newMetadata.requires
    },
    sessions: {
      ...metadata.sessions,
      ...newMetadata.sessions
    }
  };
}

export function findLast<T, S extends T>(
  array: T[],
  predicate: (value: T, index: number, array: T[]) => value is S,
  thisArg?: any
): S | undefined;
export function findLast<T>(
  array: T[],
  predicate: (value: T, index: number, array: T[]) => boolean,
  thisArg?: any
): T | undefined;
export function findLast(
  array: unknown[],
  predicate: (value: unknown, index: number, array: unknown[]) => boolean,
  thisArg?: any
): unknown | undefined {
  if (typeof array.findLast === 'function') return array.findLast(predicate, thisArg);
  return array.slice().reverse().find(predicate, thisArg);
}

// Node.js 16 doesn't make this global, but it can still be obtained.
export const DOMException: {
  new: (
    message?: string,
    nameOrOptions?: string | { name?: string; cause?: unknown }
  ) => DOMException;
} = (() => {
  if (globalThis.DOMException != null) return globalThis.DOMException;
  const ac = new AbortController();
  ac.abort();
  return ac.signal.reason.constructor;
})();

export function configureMongocryptdSpawnHooks(
  options: { port?: string; pidfilepath?: string } = {}
): { port: string } {
  const port = options.port ?? '27022';
  const pidfilepath = options.pidfilepath ?? path.join(tmpdir(), new BSON.ObjectId().toHexString());

  let childProcess: child_process.ChildProcess;

  beforeEach(async function () {
    childProcess = child_process.spawn(
      'mongocryptd',
      ['--port', port, '--ipv6', '--pidfilepath', pidfilepath],
      {
        stdio: 'ignore',
        detached: false
      }
    );

    childProcess.on('error', error => console.warn(this.currentTest?.fullTitle(), error));
  });

  afterEach(function () {
    childProcess.kill('SIGKILL');
  });

  return {
    port
  };
}
