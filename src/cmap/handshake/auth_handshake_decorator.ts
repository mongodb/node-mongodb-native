import { MongoInvalidArgumentError } from '../../error';
import type { AuthContext, AuthProvider } from '../auth/auth_provider';
import { AuthMechanism } from '../auth/providers';
import { AUTH_PROVIDERS } from '../connect';
import type { HandshakeDecorator } from './handshake_decorator';
import type { HandshakeDocument } from './handshake_document';

/**
 * Handles decoration of the handshake doc with speculative auth.
 */
export class AuthHandshakeDecorator implements HandshakeDecorator {
  /**
   * Decorate the handshake doc with speculative authentication.
   */
  async decorate(handshake: HandshakeDocument, context: AuthContext): Promise<HandshakeDocument> {
    const { credentials } = context;
    if (credentials) {
      if (credentials.mechanism === AuthMechanism.MONGODB_DEFAULT && credentials.username) {
        handshake.saslSupportedMechs = `${credentials.source}.${credentials.username}`;
        const provider = getProvider(AuthMechanism.MONGODB_SCRAM_SHA256);
        await provider.prepare(handshake, context);
      } else {
        const provider = getProvider(credentials.mechanism);
        await provider.prepare(handshake, context);
      }
    }
    return handshake;
  }
}

/**
 * Get a provider for the mechanism
 */
function getProvider(mechanism: string): AuthProvider {
  const provider = AUTH_PROVIDERS.get(mechanism);
  if (!provider) {
    throw new MongoInvalidArgumentError(`No AuthProvider for ${mechanism} defined.`);
  }
  return provider;
}
