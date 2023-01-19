'use strict';
const { MongoClient } = require('../mongodb');
const { LEGACY_HELLO_COMMAND } = require('../mongodb');

/**
 * ATLAS_CONNECTIVITY env variable is JSON
 * Here's some typescript describing the shape:
 *
 * ```typescript
 * interface AtlasConnectivity {
 *  [atlasDeployment: string]: [normalUri: string, srvUri: string]
 * }
 * ```
 *
 * It should be an object with descriptive strings about the deployment type and version (i.e. sharded_cluster_3_4)
 * that map to a two string tuple that are the normal URI and SRV URI, order doesn't matter, but it should be that order.
 */

describe('Atlas Connectivity', function () {
  if (process.env.ATLAS_CONNECTIVITY == null) {
    console.error(
      'skipping atlas connectivity tests, ATLAS_CONNECTIVITY environment variable is not defined'
    );

    return;
  }

  const CONFIGS = JSON.parse(process.env.ATLAS_CONNECTIVITY);
  Object.keys(CONFIGS).forEach(configName => {
    context(configName, function () {
      CONFIGS[configName].forEach(connectionString => {
        const name = connectionString.indexOf('mongodb+srv') >= 0 ? 'mongodb+srv' : 'normal';
        it(`${name}`, makeConnectionTest(connectionString));
      });
    });
  });
});

function makeConnectionTest(connectionString, clientOptions) {
  return function () {
    this.timeout(40000);
    const client = new MongoClient(connectionString, clientOptions);

    return client
      .connect()
      .then(() => client.db('admin').command({ [LEGACY_HELLO_COMMAND]: 1 }))
      .then(() => client.db('test').collection('test').findOne({}))
      .then(() => client.close());
  };
}
