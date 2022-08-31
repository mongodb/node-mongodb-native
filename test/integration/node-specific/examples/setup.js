const path = require('path');
const Module = require('module');

const loader = Module._load;

// This little hack is to make require('mongodb') in our own project
// during this specific test run to resolve to /lib so we can do
// const { MongoClient } = require('mongodb');
Module._load = function (request) {
  if (request === 'mongodb') {
    arguments[0] = path.join(__dirname, '..', '..', '..', '..', 'lib');
  }
  return loader.apply(this, arguments);
};
