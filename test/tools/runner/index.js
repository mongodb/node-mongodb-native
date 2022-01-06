'use strict';

require('source-map-support').install({
  hookRequire: true
});

const path = require('path');
const fs = require('fs');
const { MongoClient } = require('../../../src');
const { TestConfiguration } = require('./config');
const { getEnvironmentalOptions } = require('../utils');
const mock = require('../mongodb-mock/index');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const MONGODB_API_VERSION = process.env.MONGODB_API_VERSION;
// Load balancer fronting 1 mongos.
const SINGLE_MONGOS_LB_URI = process.env.SINGLE_MONGOS_LB_URI;
// Load balancer fronting 2 mongoses.
const MULTI_MONGOS_LB_URI = process.env.MULTI_MONGOS_LB_URI;
const loadBalanced = SINGLE_MONGOS_LB_URI && MULTI_MONGOS_LB_URI;
const filters = [];

const LOG_FILTER_REASON = false;

let initializedFilters = false;
async function initializeFilters(client) {
  if (initializedFilters) {
    return;
  }
  initializedFilters = true;
  const context = {};

  const filterFiles = fs
    .readdirSync(path.join(__dirname, 'filters'))
    .filter(x => x.indexOf('js') !== -1);

  for (const filterName of filterFiles) {
    const FilterModule = require(path.join(__dirname, 'filters', filterName));
    const filter = new FilterModule();

    console.assert(typeof filter === 'object');
    console.assert(filter.filter && typeof filter.filter === 'function');

    filters.push(filter);

    if (typeof filter.initializeFilter === 'function') {
      await new Promise((resolve, reject) =>
        filter.initializeFilter(client, context, e => (e ? reject(e) : resolve()))
      );
    }
  }

  return context;
}

beforeEach(async function () {
  if (Object.keys(this.currentTest.metadata).length > 0) {
    let ok = true;
    for (const filter of filters) {
      ok = ok && filter.filter(this.currentTest);
      if (!ok) {
        if (LOG_FILTER_REASON) {
          this.currentTest.title += ` ## filtered by ${filter.constructor.name} - ${JSON.stringify(
            this.currentTest.metadata
          )}`;
        }
        break;
      }
    }

    if (!ok) {
      this.skip();
    }
  }
});

before(async function () {
  const client = new MongoClient(
    loadBalanced ? SINGLE_MONGOS_LB_URI : MONGODB_URI,
    getEnvironmentalOptions()
  );

  await client.connect();

  const context = await initializeFilters(client);

  if (MONGODB_API_VERSION) {
    context.serverApi = MONGODB_API_VERSION;
  }

  if (SINGLE_MONGOS_LB_URI && MULTI_MONGOS_LB_URI) {
    context.singleMongosLoadBalancerUri = SINGLE_MONGOS_LB_URI;
    context.multiMongosLoadBalancerUri = MULTI_MONGOS_LB_URI;
  }

  this.configuration = new TestConfiguration(MONGODB_URI, context);
  await client.close();
});

// ensure all mock connections are closed after the suite is run
after(() => mock.cleanup());

// optionally enable test runner-wide plugins
require('./plugins/deferred');
require('./plugins/session_leak_checker');
require('./plugins/client_leak_checker');

// configure mocha
require('mocha-sinon');
