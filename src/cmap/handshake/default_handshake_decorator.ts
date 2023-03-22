import { LEGACY_HELLO_COMMAND } from '../../constants';
import type { AuthContext } from '../auth/auth_provider';
import { makeClientMetadata } from './client_metadata';
import type { HandshakeDecorator } from './handshake_decorator';
import type { HandshakeDocument } from './handshake_document';

/**
 * Decorates the handshake with the initial connection handshake
 * values.
 * @internal
 */
export class DefaultHandshakeDecorator implements HandshakeDecorator {
  /**
   * Decorate the handshake with the initial connection handshake.
   */
  async decorate(handshake: HandshakeDocument, context?: AuthContext): Promise<HandshakeDocument> {
    if (context) {
      const { connection, options } = context;
      const { serverApi } = connection;

      // Determine if we send hello or legacy hello.
      handshake[serverApi?.version ? 'hello' : LEGACY_HELLO_COMMAND] = 1;

      // Get compressor info.
      const compressors = options.compressors ? options.compressors : [];

      // Set metadata and compressor information.
      handshake.client = options.metadata || makeClientMetadata(options);
      handshake.compression = compressors;

      // Set load balanced if in that mode.
      if (options.loadBalanced === true) {
        handshake.loadBalanced = true;
      }
    } else {
      handshake[LEGACY_HELLO_COMMAND] = 1;
    }
    // Always send helloOk in the handhsake.
    handshake.helloOk = true;
    return handshake;
  }
}
