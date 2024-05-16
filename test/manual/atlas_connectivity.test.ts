import { LEGACY_HELLO_COMMAND, MongoClient } from '../mongodb';
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
  const { ATLAS_CONNECTIVITY = '' } = process.env;
  if (ATLAS_CONNECTIVITY === '') throw new Error('ATLAS_CONNECTIVITY not defined in env');
  const CONFIGS: Record<string, [normalUri: string, srvUri: string]> =
    JSON.parse(ATLAS_CONNECTIVITY);
  let client: MongoClient;

  afterEach(async function () {
    await client.close();
  });
  for (const configName of Object.keys(CONFIGS)) {
    describe(configName, function () {
      for (const connectionString of CONFIGS[configName]) {
        const name = connectionString.includes('mongodb+srv') ? 'mongodb+srv' : 'normal';
        beforeEach(function () {
          if (configName === 'replica_set_4_4_free') {
            const today = new Date();
            // Making this April 1st so it is a monday
            const april1st2024 = new Date('2024-04-01');
            if (today < april1st2024) {
              if (this.currentTest)
                this.currentTest.skipReason =
                  'TODO(NODE-6027): Un-skip replica_set_4_4_free after March 29th 2024';
              this.skip();
            }
          }
        });
        it(name, async function () {
          this.timeout(40000);
          client = new MongoClient(connectionString);
          await client.connect();
          await client.db('admin').command({ [LEGACY_HELLO_COMMAND]: 1 });
          await client.db('test').collection('test').findOne({});
        });
      }
    });
  }
});
