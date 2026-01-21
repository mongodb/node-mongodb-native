import { type MongoClient } from '../../../../src';
import { Filter } from './filter';

export const isTLSEnabled = process.env.SSL === 'ssl';

/**
 * Filter for the MongoDB API Version required for the test
 *
 * @example
 * ```js
 * metadata: {
 *    requires: {
 *      tls: 'enabled' | 'disabled'
 *    }
 * }
 * ```
 */
export class TLSFilter extends Filter {
  tls: 'enabled' | 'disabled';
  constructor() {
    super();
    // Get environmental variables that are known
    this.tls = isTLSEnabled ? 'enabled' : 'disabled';
  }

  override async initializeFilter(
    _client: MongoClient,
    context: Record<string, any>
  ): Promise<void> {
    context.tls = this.tls;
  }

  filter(test: { metadata?: MongoDBMetadataUI }) {
    const tls = test.metadata?.requires?.tls;
    if (!tls) return true;

    return tls === this.tls;
  }
}
