import * as process from 'process';

import { MongoClient } from '../../src';
import { LEGACY_HELLO_COMMAND } from '../../src/constants';

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
  let client: MongoClient;

  afterEach(async function () {
    await client?.close();
  });

  const environments = [
    'ATLAS_FREE',
    'ATLAS_SRV_FREE',
    'ATLAS_REPL',
    'ATLAS_SRV_REPL',
    'ATLAS_SHRD',
    'ATLAS_SRV_SHRD',
    'ATLAS_TLS11',
    'ATLAS_SRV_TLS11',
    'ATLAS_TLS12',
    'ATLAS_SRV_TLS12'
  ];

  for (const environment of environments) {
    it(`${environment} connects successfully`, async function () {
      this.timeout(40000);

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      client = new MongoClient(process.env[environment]!);

      await client.connect();
      await client.db('admin').command({ [LEGACY_HELLO_COMMAND]: 1 });
      await client.db('test').collection('test').findOne({});
    });
  }
});
