import type { AuthContext } from '../auth/auth_provider';
import type { HandshakeDocument } from './handshake_document';

/**
 * Decorates the initial handshake.
 * @internal
 */
export interface HandshakeDecorator {
  /**
   * Decorate the handshake document.
   */
  decorate(handshake: HandshakeDocument, context?: AuthContext): Promise<HandshakeDocument>;
}
