import { expect } from 'chai';
import { env } from 'process';

import { runNodelessTests } from '../mongodb';

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
});
