import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

const BSON = require('bson');
const utr = require('./utr/test/tools/unified-spec-runner/runner');
const { TestConfiguration } = require('./utr/test/tools/runner/config');
const { MongoClient } = require('./utr/src/index');

function load(specPath: string) {
  console.log('specPath', specPath);
  const suites = fs
    .readdirSync(specPath)
    .filter(x => x.includes('.json'))
    .map(x => ({
      ...BSON.EJSON.parse(fs.readFileSync(path.join(specPath, x)), { relaxed: true }),
      name: path.basename(x, '.json')
    }));

  return suites;
}
const specTests = [
  ...load(path.join('test', 'spec', 'crud', 'unified')),
  ...load(path.join('test', 'spec', 'transactions', 'unified')),
  ...load(path.join('test', 'spec', 'retryable-reads', 'unified')),
  ...load(path.join('test', 'spec', 'retryable-writes', 'unified')),
  ...load(path.join('test', 'spec', 'change-streams', 'unified'))
];

const context: Record<string, any> = {};

const client = new MongoClient(Deno.env.get('MONGODB_URI'));

context.parameters = await client
  .db()
  .admin()
  .command({ getParameter: '*' })
  .catch((error: any) => ({ noReply: error }));

const result = await client.db('admin').command({ buildInfo: true });
context.version = result.versionArray.slice(0, 3).join('.');
context.buildInfo = result;

context.topologyType = client.topology.description.type;

for (const unifiedSuite of specTests) {
  for (const [index, test] of unifiedSuite.tests.entries()) {
    Deno.test(
      String(test.description === '' ? `Test ${index}` : test.description),
      async function () {
        await utr
          .runUnifiedTest(
            {
              configuration: new TestConfiguration(Deno.env.get('MONGODB_URI'), context),
              test: {},
              currentTest: undefined,
              skip: () => {
                throw new (class Skip extends Error {
                  skip = true;
                })('skipped');
              }
            },
            unifiedSuite,
            test
          )
          .catch((error: any) => {
            if (error.skip) return;
            throw error;
          });
      }
    );
  }
}
