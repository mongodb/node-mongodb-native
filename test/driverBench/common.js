'use strict';

const fs = require('fs');
const path = require('path');
const MongoClient = require('../../lib/mongo_client');
const GridFsBucket = require('../../lib/gridfs-stream');

const DB_NAME = 'perftest';
const COLLECTION_NAME = 'corpus';

const SPEC_DIRECTORY = path.resolve(__dirname, 'spec');

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';

function loadSpecFile(filePath, encoding) {
  const fp = [SPEC_DIRECTORY].concat(filePath);
  return fs.readFileSync(path.join.apply(path, fp), encoding);
}

function loadSpecString(filePath) {
  return loadSpecFile(filePath, 'utf8');
}

function makeClient() {
  this.client = new MongoClient(MONGODB_URL);
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
  return this.collection.drop();
}

function initBucket() {
  this.bucket = new GridFsBucket(this.db);
}

function dropBucket() {
  return this.bucket && this.bucket.drop();
}

function makeLoadJSON(name) {
  return function() {
    this.doc = JSON.parse(loadSpecString(['single_and_multi_document', name]));
  };
}

module.exports = {
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
  dropBucket
};
