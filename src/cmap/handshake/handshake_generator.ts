import type { Document } from 'bson';

import { LEGACY_HELLO_COMMAND } from '../../constants';
import { ClientMetadata, makeClientMetadata } from '../../utils';
import type { AuthContext } from '../auth/auth_provider';
import { AuthDecorator } from './auth_decorator';
import { FaasEnvDecorator, FaasMetadata } from './faas_env_decorator';
import type { HandshakeDecorator } from './handshake_decorator';

export interface HandshakeDocument extends Document {
  /**
   * @deprecated Use hello instead
   */
  ismaster?: boolean;
  hello?: boolean;
  helloOk?: boolean;
  client: ClientMetadata;
  compression: string[];
  saslSupportedMechs?: string;
  loadBalanced?: boolean;
  speculativeAuthenticate?: Document;
  env?: FaasMetadata;
}

/**
 * Handshake doc decorators.
 * @internal
 */
export const HANDSHAKE_DECORATORS: HandshakeDecorator[] = [
  new AuthDecorator(),
  new FaasEnvDecorator()
];

/**
 * Generates the initial handshake.
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
  async generate(authContext: AuthContext): Promise<HandshakeDocument> {
    const options = authContext.options;
    const compressors = options.compressors ? options.compressors : [];
    const { serverApi } = authContext.connection;

    const handshakeDoc: HandshakeDocument = {
      [serverApi?.version ? 'hello' : LEGACY_HELLO_COMMAND]: 1,
      helloOk: true,
      client: options.metadata || makeClientMetadata(options),
      compression: compressors
    };

    if (options.loadBalanced === true) {
      handshakeDoc.loadBalanced = true;
    }

    for (const decorator of this.decorators) {
      await decorator.decorate(handshakeDoc, authContext);
    }

    return handshakeDoc;
  }
}
