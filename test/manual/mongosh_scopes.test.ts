import { expect } from 'chai';
import * as process from 'process';

const expectedMongoshScopes = [
  '@mongosh/arg-parser',
  '@mongosh/async-rewriter2',
  '@mongosh/autocomplete',
  '@mongosh/browser-repl',
  '@mongosh/browser-runtime-core',
  '@mongosh/browser-runtime-electron',
  '@mongosh/build',
  '@mongosh/cli-repl',
  'connectivity-tests',
  '@mongosh/editor',
  '@mongosh/errors',
  '@mongosh/history',
  '@mongosh/i18n',
  '@mongosh/java-shell',
  '@mongosh/js-multiline-to-singleline',
  '@mongosh/logging',
  'mongosh',
  '@mongosh/node-runtime-worker-thread',
  '@mongosh/service-provider-core',
  '@mongosh/service-provider-server',
  '@mongosh/shell-api',
  '@mongosh/shell-evaluator',
  '@mongosh/snippet-manager',
  '@mongosh/types',
  '@mongosh/docker-build-scripts'
];

describe('mongosh scopes', function () {
  let scopes: Array<string>;

  before(async function () {
    if (typeof process.env.SCOPES !== 'string') {
      throw new Error('mongosh scopes must be set in the SCOPES environment variable');
    }
    scopes = JSON.parse(process.env.SCOPES).map(({ name }) => name);
  });

  it('there are no new mongosh scopes', function () {
    expect(expectedMongoshScopes).to.deep.equal(scopes);
  });
});
