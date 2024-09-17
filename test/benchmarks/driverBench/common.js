'use strict';

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { MongoClient } = require('../../..');
const { GridFSBucket } = require('../../..');
// eslint-disable-next-line no-restricted-modules
const { MONGODB_ERROR_CODES } = require('../../../lib/error');

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

function makeClient() {
  this.client = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017');
}

function makeCSOTClient() {
  this.client = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017', {
    timeoutMS: 0
  });
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
    if (e.code !== MONGODB_ERROR_CODES.NamespaceNotFound) {
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
  makeClient,
  makeCSOTClient,
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
