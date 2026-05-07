import { expect } from 'chai';
import { env } from 'process';

import { runNodelessTests } from '../mongodb';
import { sandbox } from '../tools/runner/vm_context_helper';

describe('Nodeless tests', function () {
  it('runNodelessTests variable should match env vars', function () {
    const nodelessEnv = env.MONGODB_BUNDLED;
    const expectedNodeless = nodelessEnv === 'true';
    const actualNodeless = runNodelessTests;
    expect(actualNodeless).to.equal(
      expectedNodeless,
      `runNodelessTests (${actualNodeless}) does not match MONGODB_BUNDLED env var (${nodelessEnv})` +
        " run 'npm run build:runtime-barrel' to update the barrel file"
    );
  });

  it('sandbox should not have node-specific properties', function () {
    if (!runNodelessTests) this.skip();
    expect(typeof (sandbox as any).process).to.equal('undefined');
    expect(typeof (sandbox as any).Buffer).to.equal('undefined');
  });
});
