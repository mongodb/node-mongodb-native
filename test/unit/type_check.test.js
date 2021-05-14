'use strict';

const tsd = require('tsd').default;
const { expect } = require('chai');

describe('Typescript definitions', () => {
  it('should pass assertions defined in test/types', async () => {
    const diagnostics = await tsd();
    if (diagnostics.length !== 0) {
      const messages = diagnostics
        .map(d => `${d.fileName}:${d.line}:${d.column} - [${d.severity}]: ${d.message}`)
        .join('\n');
      expect.fail('\n' + messages);
    }
  });
});
