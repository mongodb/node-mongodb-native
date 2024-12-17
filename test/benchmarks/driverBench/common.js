'use strict';

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const child_process = require('child_process');

/**
 * The path to the MongoDB Node.js driver.
 * This MUST be set to the directory the driver is installed in
 * NOT the file "lib/index.js" that is the driver's export.
 */
const MONGODB_DRIVER_PATH = (() => {
  let driverPath = process.env.MONGODB_DRIVER_PATH;
  if (!driverPath?.length) {
    driverPath = path.resolve(__dirname, '../../..');
  }
  return driverPath;
})();

const { MongoClient, GridFSBucket } = require(MONGODB_DRIVER_PATH);

/** Grab the version from the package.json */
const { version: MONGODB_DRIVER_VERSION } = require(path.join(MONGODB_DRIVER_PATH, 'package.json'));

/**
 * Use git to optionally determine the git revision,
 * but the benchmarks could be run against an npm installed version so this should be allowed to fail
 */
const MONGODB_DRIVER_REVISION = (() => {
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
const MONGODB_BSON_PATH = path.join(MONGODB_DRIVER_PATH, 'node_modules', 'bson');
const { version: MONGODB_BSON_VERSION } = require(path.join(MONGODB_BSON_PATH, 'package.json'));

/**
 * If you need to test BSON changes, you should clone, checkout and build BSON.
 * run: `npm link` with no arguments to register the link.
 * Then in the driver you are testing run `npm link bson` to use your local build.
 *
 * This will symlink the BSON into the driver's node_modules directory. So here
 * we can find the revision of the BSON we are testing against if .git exists.
 */
const MONGODB_BSON_REVISION = (() => {
  if (!fs.existsSync(path.join(MONGODB_BSON_PATH, '.git'))) {
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

const DB_NAME = 'perftest';
const COLLECTION_NAME = 'corpus';

const SPEC_DIRECTORY = path.resolve(__dirname, 'spec');

function loadSpecFile(filePath, encoding) {
  const fp = [SPEC_DIRECTORY].concat(filePath);
  return fs.readFileSync(path.join.apply(path, fp), encoding);
}

function loadSpecString(filePath) {
  return loadSpecFile(filePath, 'utf8');
}

const MONGODB_CLIENT_OPTIONS = (() => {
  const optionsString = process.env.MONGODB_CLIENT_OPTIONS;
  let options = undefined;
  if (optionsString?.length) {
    options = JSON.parse(optionsString);
  }
  return { ...options };
})();

const MONGODB_URI = (() => {
  if (process.env.MONGODB_URI?.length) return process.env.MONGODB_URI;
  return 'mongodb://127.0.0.1:27017';
})();

function makeClient() {
  this.client = new MongoClient(MONGODB_URI, MONGODB_CLIENT_OPTIONS);
}

function connectClient() {
  return this.client.connect();
}

function disconnectClient() {
  this.client.close();
}

function initDb() {
  this.db = this.client.db(DB_NAME);
}

function dropDb() {
  return this.db.dropDatabase();
}

function createCollection() {
  return this.db.createCollection(COLLECTION_NAME);
}

function initCollection() {
  this.collection = this.db.collection(COLLECTION_NAME);
}

function dropCollection() {
  return this.collection.drop().catch(e => {
    if (e.code !== 26 /* NamespaceNotFound */) {
      throw e;
    }
  });
}

function initBucket() {
  this.bucket = new GridFSBucket(this.db);
}

function dropBucket() {
  return this.bucket && this.bucket.drop();
}

function makeLoadJSON(name) {
  return function () {
    this.doc = JSON.parse(loadSpecString(['single_and_multi_document', name]));
  };
}

function makeLoadTweets(makeId) {
  return function () {
    const doc = this.doc;
    const tweets = [];
    for (let _id = 1; _id <= 10000; _id += 1) {
      tweets.push(Object.assign({}, doc, makeId ? { _id } : {}));
    }

    return this.collection.insertMany(tweets);
  };
}

function makeLoadInsertDocs(numberOfOperations) {
  return function () {
    this.docs = [];
    for (let i = 0; i < numberOfOperations; i += 1) {
      this.docs.push(Object.assign({}, this.doc));
    }
  };
}

async function writeSingleByteFileToBucket() {
  const stream = this.bucket.openUploadStream('setup-file.txt');
  const oneByteFile = Readable.from('a');
  return pipeline(oneByteFile, stream);
}

module.exports = {
  MONGODB_URI,
  MONGODB_CLIENT_OPTIONS,
  MONGODB_DRIVER_PATH,
  MONGODB_DRIVER_VERSION,
  MONGODB_DRIVER_REVISION,
  MONGODB_BSON_PATH,
  MONGODB_BSON_VERSION,
  MONGODB_BSON_REVISION,
  makeClient,
  connectClient,
  disconnectClient,
  initDb,
  dropDb,
  createCollection,
  initCollection,
  dropCollection,
  makeLoadJSON,
  loadSpecFile,
  loadSpecString,
  initBucket,
  dropBucket,
  makeLoadTweets,
  makeLoadInsertDocs,
  writeSingleByteFileToBucket
};
