import { expect } from 'chai';

const expectedMongoshScopes = [
  'service-provider-server',
  'browser-runtime-electron',
  'cli-repl',
  'node-runtime-worker-thread',
  'mongosh',
  'browser-repl'
];

describe('mongosh scopes', function () {
  let scopes: Array<string>;

  before(async function () {
    scopes = process.env.SCOPES.trim()
      .split('\n')
      .map(scope => scope.replace(/@mongosh\//, ''));
  });

  it('there are no new mongosh scopes', function () {
    expect(expectedMongoshScopes).to.deep.equal(scopes);
  });
});
