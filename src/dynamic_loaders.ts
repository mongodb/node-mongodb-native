let collection: any;
let cursor: any;
let db: any;
let client: any;
let admin: any;

function loadCollection() {
  if (!collection) {
    collection = require('./collection');
  }
  return collection;
}

function loadCursor() {
  if (!cursor) {
    cursor = require('./cursor');
  }
  return cursor;
}

function loadDb() {
  if (!db) {
    db = require('./db');
  }
  return db;
}

function loadMongoClient() {
  if (!client) {
    client = require('./mongo_client');
  }
  return client;
}

function loadAdmin() {
  if (!admin) {
    admin = require('./admin');
  }
  return admin;
}

export { loadCollection, loadCursor, loadDb, loadMongoClient, loadAdmin };
