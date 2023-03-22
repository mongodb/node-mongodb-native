import { expect } from 'chai';

import { HandshakeDecorator, HandshakeDocument, HandshakeGenerator } from '../../../mongodb';

class TestDecorator implements HandshakeDecorator {
  async decorate(handshake: HandshakeDocument): Promise<HandshakeDocument> {
    handshake.foo = 'bar';
    return handshake;
  }
}

describe('HandshakeGenerator', function () {
  describe('#generate', function () {
    context('when decorators are provided', function () {
      const decorator = new TestDecorator();
      const generator = new HandshakeGenerator([decorator]);

      it('decorates the handshake', async function () {
        const handshake = await generator.generate();
        expect(handshake).to.deep.equal({ foo: 'bar' });
      });
    });

    context('when decorators are not provided', function () {
      const generator = new HandshakeGenerator([]);

      it('returns an empty handshake', async function () {
        const handshake = await generator.generate();
        expect(handshake).to.be.empty;
      });
    });
  });
});
