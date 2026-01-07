import { expect } from 'chai';
import * as process from 'process';

describe('compression configuration tests', function () {
  describe('process.env.COMPRESSOR is set', function () {
    it(
      'enables compression when set in the environment',
      {
        requires: {
          predicate: () => !!process.env.COMPRESSOR || 'compression must be enabled.'
        }
      },
      function () {
        const client = this.configuration.newClient();
        expect(client.s.options.compressors).to.deep.equal([process.env.COMPRESSOR]);
      }
    );

    it(
      'enables compression when set in the environment',
      {
        requires: {
          predicate: () => !!process.env.COMPRESSOR || 'compression must be enabled.'
        }
      },
      function () {
        const url = this.configuration.url();
        expect(url).to.include(`compressors=${process.env.COMPRESSOR}`);
      }
    );
  });

  describe('process.env.COMPRESSOR is unset', function () {
    it(
      'enables compression when set in the environment',
      {
        requires: {
          predicate: () => !process.env.COMPRESSOR || 'compression cannot be enabled.'
        }
      },
      function () {
        const client = this.configuration.newClient();

        expect(client.s.options.compressors).to.deep.equal(['none']);
      }
    );

    it(
      'enables compression when set in the environment',
      {
        requires: {
          predicate: () => !process.env.COMPRESSOR || 'compression cannot be enabled.'
        }
      },
      function () {
        const url = this.configuration.url();
        expect(url).to.not.include(`compressors=none`);
      }
    );
  });
});
