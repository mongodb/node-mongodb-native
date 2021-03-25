'use strict';

const tsd = require('tsd');
const { expect } = require('chai');

describe('Exported Types', () => {
  it('should be as expected', async () => {
    const diagnostics = await tsd();
    if (diagnostics.length !== 0) {
      const messages = diagnostics
        .map(d => `${d.fileName}:${d.line}:${d.column} - [${d.severity}]: ${d.message}`)
        .join('\n');
      expect.fail('\n' + messages);
    }
  });
});
