import { expect } from 'chai';
import { env } from 'process';

import { runNodelessTests } from '../mongodb_runtime-testing';

describe('Nodeless tests', function () {
  it('runNodelessTests variable should match env vars', function () {
    const nodelessEnv = env.NODELESS;
    const expectedNodeless = nodelessEnv === 'true';
    const actualNodeless = runNodelessTests;
    expect(actualNodeless).to.equal(
      expectedNodeless,
      "runNodelessTests variable does not match NODELESS env var, run 'npm run build:runtime-barrel' to update the barrel file"
    );
  });
});
