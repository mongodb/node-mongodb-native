import type { AuthContext } from '../auth/auth_provider';
import type { HandshakeDocument } from './handshake_generator';

/**
 * Decorates the initial handshake.
 */
export interface HandshakeDecorator {
  /**
   * Decorate the handshake document.
   */
  decorate(handshake: HandshakeDocument, authContext: AuthContext): Promise<HandshakeDocument>;
}
