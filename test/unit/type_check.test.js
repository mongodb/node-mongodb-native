'use strict';

const tsd = require('tsd').default;
const { expect } = require('chai');

const REPO_ROOT = __dirname.replace('test/unit', '');

describe('Typescript definitions', () => {
  it('should pass assertions defined in test/types', async () => {
    const diagnostics = await tsd();
    if (diagnostics.length !== 0) {
      const messages = diagnostics
        .map(
          d =>
            `${d.fileName.replace(REPO_ROOT, '')}:${d.line}:${d.column} - [${d.severity}]: ${
              d.message
            }`
        )
        .join('\n');
      expect.fail(`\n\n${messages}\n\n${diagnostics.length} errors found.`);
    }
  });
});
