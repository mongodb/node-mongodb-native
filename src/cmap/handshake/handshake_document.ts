import type { Document } from 'bson';

import type { ClientMetadata } from './client_metadata';

/** @internal */
export interface HandshakeDocument extends Document {
  /**
   * @deprecated Use hello instead
   */
  ismaster?: boolean | 0 | 1;
  hello?: boolean | 0 | 1;
  helloOk?: boolean;
  client?: ClientMetadata;
  compression?: string[];
  saslSupportedMechs?: string;
  loadBalanced?: boolean;
  speculativeAuthenticate?: Document;
}
