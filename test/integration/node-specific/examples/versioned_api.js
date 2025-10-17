'use strict';
const { MongoClient } = require('mongodb');

describe('examples.versionedApi:', function () {
  let uri;
  // eslint-disable-next-line no-unused-vars
  let client;

  before(function () {
    uri = this.configuration.url();
  });

  it('declare an API version on a client', function () {
    // Start Versioned API Example 1

    client = new MongoClient(uri, { serverApi: { version: '1' } });

    // End Versioned API Example 1
  });

  it('declare an API version on a client with strict enabled', function () {
    // Start Versioned API Example 2

    client = new MongoClient(uri, { serverApi: { version: '1', strict: true } });

    // End Versioned API Example 2
  });

  it('declare an API version on a client with strict disabled', function () {
    // Start Versioned API Example 3

    client = new MongoClient(uri, { serverApi: { version: '1', strict: false } });

    // End Versioned API Example 3
  });

  it('declare an API version on a client with deprecation errors enabled', function () {
    // Start Versioned API Example 4

    client = new MongoClient(uri, { serverApi: { version: '1', deprecationErrors: true } });

    // End Versioned API Example 4
  });
});
