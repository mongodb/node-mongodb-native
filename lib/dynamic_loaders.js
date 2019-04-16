'use strict';

let collection;
let cursor;
let db;

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

module.exports = {
  loadCollection,
  loadCursor,
  loadDb
};
