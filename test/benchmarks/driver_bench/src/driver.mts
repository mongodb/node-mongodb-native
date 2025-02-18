import child_process from 'node:child_process';
import fs from 'node:fs/promises';
import module from 'node:module';
import path from 'node:path';
import process from 'node:process';

const __dirname = import.meta.dirname;
const require = module.createRequire(__dirname);

export const SPEC_TAG = 'spec-benchmark';
export const ALERT_TAG = 'alerting-benchmark';
export const CURSOR_TAG = 'cursor-benchmark';
export const READ_TAG = 'read-benchmark';
export const WRITE_TAG = 'write-benchmark';

export const NORMALIZED_PING_SCALING_CONST = 1000;

/**
 * The path to the MongoDB Node.js driver.
 * This MUST be set to the directory the driver is installed in
 * NOT the file "lib/index.js" that is the driver's export.
 */
export const MONGODB_DRIVER_PATH = (() => {
  let driverPath = process.env.MONGODB_DRIVER_PATH;
  if (!driverPath?.length) {
    driverPath = path.resolve(__dirname, '../../../..');
  }
  return driverPath;
})();

/** Grab the version from the package.json */
export const { version: MONGODB_DRIVER_VERSION } = require(
  path.join(MONGODB_DRIVER_PATH, 'package.json')
);

/**
 * Use git to optionally determine the git revision,
 * but the benchmarks could be run against an npm installed version so this should be allowed to fail
 */
export const MONGODB_DRIVER_REVISION = (() => {
  try {
    return child_process
      .execSync('git rev-parse --short HEAD', {
        cwd: MONGODB_DRIVER_PATH,
        encoding: 'utf8'
      })
      .trim();
  } catch {
    return 'unknown revision';
  }
})();

/**
 * Find the BSON dependency inside the driver PATH given and grab the version from the package.json.
 */
export const MONGODB_BSON_PATH = path.join(MONGODB_DRIVER_PATH, 'node_modules', 'bson');
export const { version: MONGODB_BSON_VERSION } = require(
  path.join(MONGODB_BSON_PATH, 'package.json')
);

/**
 * If you need to test BSON changes, you should clone, checkout and build BSON.
 * run: `npm link` with no arguments to register the link.
 * Then in the driver you are testing run `npm link bson` to use your local build.
 *
 * This will symlink the BSON into the driver's node_modules directory. So here
 * we can find the revision of the BSON we are testing against if .git exists.
 */
export const MONGODB_BSON_REVISION = await (async () => {
  const bsonGitExists = await fs.access(path.join(MONGODB_BSON_PATH, '.git')).then(
    () => true,
    () => false
  );
  if (!bsonGitExists) {
    return 'installed from npm';
  }
  try {
    return child_process
      .execSync('git rev-parse --short HEAD', {
        cwd: path.join(MONGODB_BSON_PATH),
        encoding: 'utf8'
      })
      .trim();
  } catch {
    return 'unknown revision';
  }
})();

export const MONGODB_CLIENT_OPTIONS = (() => {
  const optionsString = process.env.MONGODB_CLIENT_OPTIONS;
  let options = undefined;
  if (optionsString?.length) {
    options = JSON.parse(optionsString);
  }
  return { ...options };
})();

export const MONGODB_URI = (() => {
  const connectionString = process.env.MONGODB_URI;
  if (connectionString?.length) {
    return connectionString;
  }
  return 'mongodb://localhost:27017';
})();

export function snakeToCamel(name: string) {
  return name
    .split('_')
    .map((s, i) => (i !== 0 ? s[0].toUpperCase() + s.slice(1) : s))
    .join('');
}

import type mongodb from '../../../../mongodb.js';
export type { mongodb };

const { MongoClient, GridFSBucket, BSON } = require(path.join(MONGODB_DRIVER_PATH));

export { BSON };
export const EJSON = BSON.EJSON;

const DB_NAME = 'perftest';
const COLLECTION_NAME = 'corpus';

export const SPEC_DIRECTORY = path.resolve(__dirname, '..', 'spec');
export const PARALLEL_DIRECTORY = path.resolve(SPEC_DIRECTORY, 'parallel');
export const TEMP_DIRECTORY = path.resolve(SPEC_DIRECTORY, 'tmp');

export type Metric = {
  name: 'megabytes_per_second' | 'normalized_throughput';
  value: number;
};

export type MetricInfo = {
  info: {
    test_name: string;
    args: Record<string, number>;
    tags?: string[]
  };
  metrics: Metric[];
};

export function metrics(test_name: string, result: number, tags?: string[]): MetricInfo {
  return {
    info: {
      test_name,
      // Args can only be a map of string -> int32. So if its a number leave it be,
      // if it is anything else test for truthiness and set to 1 or 0.
      args: Object.fromEntries(
        Object.entries(MONGODB_CLIENT_OPTIONS).map(([key, value]) => [
          key,
          typeof value === 'number' ? value : value ? 1 : 0
        ])
      ),
      tags
    },
    metrics: [{ name: 'megabytes_per_second', value: result }]
  } as const;
}

/**
 * This class exists to abstract some of the driver API so we can gloss over version differences.
 * For use in setup/teardown mostly.
 */
export class DriverTester {
  readonly DB_NAME = DB_NAME;
  readonly COLLECTION_NAME = COLLECTION_NAME;

  public client: mongodb.MongoClient;
  constructor() {
    this.client = new MongoClient(MONGODB_URI, MONGODB_CLIENT_OPTIONS);
  }

  bucket(db: mongodb.Db) {
    return new GridFSBucket(db);
  }

  async drop() {
    const utilClient = new MongoClient(MONGODB_URI, MONGODB_CLIENT_OPTIONS);
    const db = utilClient.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);
    await collection.drop().catch(() => null);
    await db.dropDatabase().catch(() => null);
    await utilClient.close();
  }

  async create() {
    const utilClient = new MongoClient(MONGODB_URI, MONGODB_CLIENT_OPTIONS);
    try {
      await utilClient.db(DB_NAME).createCollection(COLLECTION_NAME);
    } finally {
      await utilClient.close();
    }
  }

  async load(filePath: string, type: 'json' | 'string' | 'buffer'): Promise<any> {
    const content = await fs.readFile(path.join(SPEC_DIRECTORY, filePath));
    if (type === 'buffer') return content;
    const string = content.toString('utf8');
    if (type === 'string') return string;
    if (type === 'json') return JSON.parse(string);
    throw new Error('unknown type: ' + type);
  }

  async resetTmpDir() {
    await fs.rm(TEMP_DIRECTORY, { recursive: true, force: true });
    await fs.mkdir(TEMP_DIRECTORY);
  }

  async insertManyOf(document: Record<string, any>, length: number, addId = false) {
    const utilClient = new MongoClient(MONGODB_URI, MONGODB_CLIENT_OPTIONS);
    const db = utilClient.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);
    try {
      await collection.insertMany(
        Array.from({ length }, (_, _id) => ({ ...(addId ? { _id } : {}), ...document })) as any[]
      );
    } finally {
      await utilClient.close();
    }
  }

  async close() {
    await this.client.close();
  }
}

export const driver = new DriverTester();
