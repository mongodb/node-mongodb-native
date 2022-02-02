'use strict';

require('source-map-support').install({
  hookRequire: true
});

const path = require('path');
const fs = require('fs');
const { MongoClient } = require('../../../../src');
const { TestConfiguration } = require('../config');
const { getEnvironmentalOptions } = require('../../utils');
const mock = require('../../mongodb-mock/index');
const { inspect } = require('util');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const MONGODB_API_VERSION = process.env.MONGODB_API_VERSION;
// Load balancer fronting 1 mongos.
const SINGLE_MONGOS_LB_URI = process.env.SINGLE_MONGOS_LB_URI;
// Load balancer fronting 2 mongoses.
const MULTI_MONGOS_LB_URI = process.env.MULTI_MONGOS_LB_URI;
const loadBalanced = SINGLE_MONGOS_LB_URI && MULTI_MONGOS_LB_URI;
const filters = [];

let initializedFilters = false;
async function initializeFilters(client) {
  if (initializedFilters) {
    return;
  }
  initializedFilters = true;
  const context = {};

  const filterFiles = fs
    .readdirSync(path.join(__dirname, '../filters'))
    .filter(x => x.indexOf('js') !== -1);

  for (const filterName of filterFiles) {
    const FilterModule = require(path.join(__dirname, '../filters', filterName));
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

const testSkipBeforeEachHook = async function () {
  // `metadata` always exists, `requires` is optional
  const requires = this.currentTest.metadata.requires;
  if (requires && Object.keys(requires).length > 0) {
    const failedFilter = filters.find(filter => !filter.filter(this.currentTest));

    if (failedFilter) {
      const filterName = failedFilter.constructor.name;
      const metadataString = inspect(requires, {
        colors: true,
        compact: true,
        depth: 10,
        breakLength: Infinity
      });

      this.currentTest.skipReason = `filtered by ${filterName} requires ${metadataString}`;

      this.skip();
    }
  }
};

const testConfigBeforeHook = async function () {
  const client = new MongoClient(loadBalanced ? SINGLE_MONGOS_LB_URI : MONGODB_URI, {
    ...getEnvironmentalOptions()
  });

  await client.connect();

  const context = await initializeFilters(client);

  if (MONGODB_API_VERSION) {
    context.serverApi = MONGODB_API_VERSION;
  }

  if (SINGLE_MONGOS_LB_URI && MULTI_MONGOS_LB_URI) {
    context.singleMongosLoadBalancerUri = SINGLE_MONGOS_LB_URI;
    context.multiMongosLoadBalancerUri = MULTI_MONGOS_LB_URI;
  }

  this.configuration = new TestConfiguration(
    loadBalanced ? SINGLE_MONGOS_LB_URI : MONGODB_URI,
    context
  );
  await client.close();

  const currentEnv = {
    // TODO(NODE-3714): Improve environment detection
    topology: this.configuration.topologyType,
    version: this.configuration.buildInfo.version,
    node: process.version,
    os: process.platform,
    serverless: process.env.SERVERLESS === '1',
    auth: process.env.AUTH === 'auth',
    tls: process.env.SSL === 'ssl',
    csfle: this.configuration.clientSideEncryption.enabled,
    serverApi: MONGODB_API_VERSION,
    atlas: process.env.ATLAS_CONNECTIVITY != null,
    aws: MONGODB_URI.includes('authMechanism=MONGODB-AWS'),
    adl: this.configuration.buildInfo.dataLake
      ? this.configuration.buildInfo.dataLake.version
      : false,
    kerberos: process.env.KRB5_PRINCIPAL != null,
    ldap: MONGODB_URI.includes('authMechanism=PLAIN'),
    ocsp: process.env.OCSP_TLS_SHOULD_SUCCEED != null && process.env.CA_FILE != null,
    socks5: MONGODB_URI.includes('proxyHost=')
  };

  console.error(inspect(currentEnv, { colors: true }));
};

// ensure all mock connections are closed after the suite is run
const cleanUpMocksAfterHook = () => mock.cleanup();

const beforeAllPluginImports = () => {
  // optionally enable test runner-wide plugins
  require('../plugins/deferred');
  // configure mocha
  require('mocha-sinon');
};

module.exports = {
  mochaHooks: {
    beforeAll: [beforeAllPluginImports, testConfigBeforeHook],
    beforeEach: [testSkipBeforeEachHook],
    afterAll: [cleanUpMocksAfterHook]
  }
};
