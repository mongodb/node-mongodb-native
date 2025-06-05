/* eslint-disable simple-import-sort/imports */

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('source-map-support').install({
  hookRequire: true
});

import { MongoClient } from '../../../mongodb';
import { AlpineTestConfiguration, AstrolabeTestConfiguration, TestConfiguration } from '../config';
import { getEnvironmentalOptions } from '../../utils';
import * as mock from '../../mongodb-mock/index';
import { inspect } from 'util';

import { ApiVersionFilter } from '../filters/api_version_filter';
import { AuthFilter } from '../filters/auth_filter';
import { ClientSideEncryptionFilter } from '../filters/client_encryption_filter';
import { GenericPredicateFilter } from '../filters/generic_predicate_filter';
import { IDMSMockServerFilter } from '../filters/idms_mock_server_filter';
import { MongoDBTopologyFilter } from '../filters/mongodb_topology_filter';
import { MongoDBVersionFilter } from '../filters/mongodb_version_filter';
import { NodeVersionFilter } from '../filters/node_version_filter';
import { OSFilter } from '../filters/os_filter';
import { type Filter } from '../filters/filter';
import { type Context } from 'mocha';
import { flakyTests } from '../flaky';

// Default our tests to have auth enabled
// A better solution will be tackled in NODE-3714
process.env.AUTH = process.env.AUTH === 'noauth' ? 'noauth' : 'auth';

process.env.MONGODB_URI =
  process.env.MONGODB_URI ||
  (process.env.AUTH === 'auth'
    ? 'mongodb://bob:pwd123@localhost:27017'
    : 'mongodb://localhost:27017');

// If the URI exists as an environment variable, use it.  Otherwise
//  determine the connection string based on the value of process.env.AUTH
const MONGODB_URI = process.env.MONGODB_URI;

const MONGODB_API_VERSION = process.env.MONGODB_API_VERSION;
// Load balancer fronting 1 mongos.
const SINGLE_MONGOS_LB_URI = process.env.SINGLE_MONGOS_LB_URI;
// Load balancer fronting 2 mongoses.
const MULTI_MONGOS_LB_URI = process.env.MULTI_MONGOS_LB_URI;
const loadBalanced = SINGLE_MONGOS_LB_URI && MULTI_MONGOS_LB_URI;
const filters: Filter[] = [];

let initializedFilters = false;
async function initializeFilters(client): Promise<Record<string, any>> {
  if (initializedFilters) {
    return {};
  }
  initializedFilters = true;
  const context = {
    filters: [
      new ApiVersionFilter(),
      new AuthFilter(),
      new ClientSideEncryptionFilter(),
      new GenericPredicateFilter(),
      new IDMSMockServerFilter(),
      new MongoDBTopologyFilter(),
      new MongoDBVersionFilter(),
      new NodeVersionFilter(),
      new OSFilter()
    ]
  };

  for (const filter of context.filters) {
    filters.push(filter);
    await filter.initializeFilter(client, context);
  }

  return context;
}

const testSkipBeforeEachHook = async function () {
  const metadata = this.currentTest.metadata;

  if (metadata && metadata.requires && Object.keys(metadata.requires).length > 0) {
    const failedFilter = filters.find(filter => filter.filter(this.currentTest) !== true);
    if (failedFilter) {
      const maybeSkipReason = failedFilter.filter(this.currentTest);
      if (typeof maybeSkipReason === 'string') {
        this.currentTest.skipReason = maybeSkipReason;
        this.skip();
        return;
      }
      const filterName = failedFilter.constructor.name;
      if (filterName === 'GenericPredicateFilter') {
        this.currentTest.skipReason = `filtered by ${filterName}: ${failedFilter.filter(
          this.currentTest
        )}`;
      } else {
        const metadataString = inspect(metadata.requires, {
          colors: true,
          compact: true,
          depth: 10,
          breakLength: Infinity
        });

        this.currentTest.skipReason = `filtered by ${filterName} requires ${metadataString}`;
      }

      this.skip();
    }
  }
};

/**
 * TODO: NODE-3891 - fix tests that are broken with auth enabled and remove this hook
 * @param skippedTests - define list of tests to skip
 * @returns
 */
export const skipBrokenAuthTestBeforeEachHook = function (
  { skippedTests }: { skippedTests: string[] } = { skippedTests: [] }
) {
  return function () {
    if (process.env.AUTH === 'auth' && skippedTests.includes(this.currentTest.title)) {
      this.currentTest.skipReason = 'TODO: NODE-3891 - fix tests broken when AUTH enabled';
      this.skip();
    }
  };
};

const testConfigBeforeHook = async function () {
  if (process.env.DRIVERS_ATLAS_TESTING_URI) {
    this.configuration = new AstrolabeTestConfiguration(process.env.DRIVERS_ATLAS_TESTING_URI, {});
    return;
  }

  const client = new MongoClient(loadBalanced ? SINGLE_MONGOS_LB_URI : MONGODB_URI, {
    ...getEnvironmentalOptions(),
    // TODO(NODE-4884): once happy eyeballs support is added, we no longer need to set
    // the default dns resolution order for CI
    family: 4
  });

  await client.db('test').command({ ping: 1 });

  const context = await initializeFilters(client);

  if (MONGODB_API_VERSION) {
    context.serverApi = MONGODB_API_VERSION;
  }

  if (SINGLE_MONGOS_LB_URI && MULTI_MONGOS_LB_URI) {
    context.singleMongosLoadBalancerUri = SINGLE_MONGOS_LB_URI;
    context.multiMongosLoadBalancerUri = MULTI_MONGOS_LB_URI;
  }

  context.parameters = await client
    .db()
    .admin()
    .command({ getParameter: '*' })
    .catch(error => ({ noReply: error }));

  const Config: typeof TestConfiguration = process.env.ALPINE
    ? AlpineTestConfiguration
    : TestConfiguration;
  this.configuration = new Config(loadBalanced ? SINGLE_MONGOS_LB_URI : MONGODB_URI, context);

  await client.close();

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const zstdVersion = require('@mongodb-js/zstd/package.json').version;

  const currentEnv = {
    // TODO(NODE-3714): Improve environment detection
    topology: this.configuration.topologyType,
    version: this.configuration.buildInfo.version,
    node: process.version,
    os: process.platform,
    alpineLinux: Boolean(process.env.ALPINE),
    cryptdUri: process.env.MONGOCRYPTD_URI,
    pid: process.pid,
    auth: process.env.AUTH === 'auth',
    tls: process.env.SSL === 'ssl',
    csfle: {
      ...this.configuration.clientSideEncryption
    },
    serverApi: MONGODB_API_VERSION,
    atlas: process.env.ATLAS_CONNECTIVITY != null,
    aws: MONGODB_URI.includes('authMechanism=MONGODB-AWS'),
    awsSdk: process.env.MONGODB_AWS_SDK,
    azure: MONGODB_URI.includes('ENVIRONMENT:azure'),
    adl: this.configuration.buildInfo.dataLake
      ? this.configuration.buildInfo.dataLake.version
      : false,
    kerberos: process.env.PRINCIPAL != null,
    ldap: MONGODB_URI.includes('authMechanism=PLAIN'),
    socks5: MONGODB_URI.includes('proxyHost='),
    compressor: process.env.COMPRESSOR,
    cryptSharedLibPath: process.env.CRYPT_SHARED_LIB_PATH,
    zstdVersion
  };

  console.error(inspect(currentEnv, { colors: true }));
};

// ensure all mock connections are closed after the suite is run
const cleanUpMocksAfterHook = () => mock.cleanup();

const beforeAllPluginImports = () => {
  // optionally enable test runner-wide plugins
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../plugins/deferred');
  // configure mocha
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('mocha-sinon');
};

async function beforeEachLogging(this: Context) {
  if (this.currentTest == null) return;
  this.configuration.beforeEachLogging(this);
}

async function afterEachLogging(this: Context) {
  if (this.currentTest == null) return;
  this.configuration.afterEachLogging(this);
}

function checkFlakyTestList(this: Context) {
  const allTests: string[] = [];

  const stack = [this.test.parent];
  while (stack.length) {
    const suite = stack.pop();
    allTests.push(...suite.tests.map(test => test.fullTitle()));
    stack.push(...suite.suites);
  }
  allTests.reverse(); // Doesn't matter but when debugging easier to see this in the expected order.

  const flakyTestDoesNotExist = flakyTests.find(testName => !allTests.includes(testName));
  if (flakyTestDoesNotExist != null) {
    console.error(
      '\n' + '='.repeat(100) + '\n',
      'Flaky test:',
      JSON.stringify(flakyTestDoesNotExist),
      'is not run at all',
      '\n' + '='.repeat(100) + '\n'
    );
  }
}

export const mochaHooks = {
  beforeAll: [beforeAllPluginImports, testConfigBeforeHook, checkFlakyTestList],
  beforeEach: [testSkipBeforeEachHook, beforeEachLogging],
  afterEach: [afterEachLogging],
  afterAll: [cleanUpMocksAfterHook]
};
