import type { AuthContext } from '../auth/auth_provider';
import type { HandshakeDecorator } from './handshake_decorator';
import type { HandshakeDocument } from './handshake_document';

/**
 * Generates the initial handshake.
 * @internal
 */
export class HandshakeGenerator {
  decorators: HandshakeDecorator[];

  /**
   * Instantiate the generator. Inject the decorator array to be able to
   * unit test in isolation.
   */
  constructor(decorators: HandshakeDecorator[]) {
    this.decorators = decorators;
  }

  /**
   * Generate the initial handshake.
   */
  async generate(context?: AuthContext): Promise<HandshakeDocument> {
    const handshake = {};

    // Generating a handshake loops over the provided decorators and
    // adds the relevant information.
    for (const decorator of this.decorators) {
      await decorator.decorate(handshake, context);
    }

    return handshake;
  }
}
