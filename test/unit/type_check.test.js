'use strict';

const tsd = require('tsd').default;
const { expect } = require('chai');

/**
 * @param {string} path
 */
function trimPath(path) {
  const trimmings = path.split('test/types');
  return 'test/types' + trimmings[1];
}

describe('Typescript definitions', () => {
  it('should pass assertions defined in test/types', async () => {
    const diagnostics = await tsd();
    if (diagnostics.length !== 0) {
      const messages = diagnostics
        .map(d => `${trimPath(d.fileName)}:${d.line}:${d.column} - [${d.severity}]: ${d.message}`)
        .join('\n');
      expect.fail(`\n\n${messages}\n\n${diagnostics.length} errors found.`);
    }
  });
});
