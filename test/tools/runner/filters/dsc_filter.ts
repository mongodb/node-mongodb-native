import * as process from 'process';

import { type MongoClient } from '../../../mongodb';
import { Filter } from './filter';

/**
 * Whether the test deployment uses disaggregated storage (DSC).
 *
 * This cannot be detected from the server, so the test environment sets `DSC=on`.
 * See "Disaggregated storage (DSC)" in test/readme.md.
 */
export function isDSC(): boolean {
  return process.env.DSC === 'on';
}

/**
 * Filter for tests that only run, or never run, against a disaggregated storage deployment (DSC)
 *
 * @example
 * ```js
 * metadata: {
 *    requires: {
 *      dsc: 'enabled' | 'disabled'
 *    }
 * }
 * ```
 */
export class DSCFilter extends Filter {
  dsc: 'enabled' | 'disabled';
  constructor() {
    super();
    this.dsc = isDSC() ? 'enabled' : 'disabled';
  }

  override async initializeFilter(
    _client: MongoClient,
    context: Record<string, any>
  ): Promise<void> {
    context.dsc = this.dsc;
  }

  filter(test: { metadata?: MongoDBMetadataUI }) {
    const dsc = test.metadata?.requires?.dsc;
    if (!dsc) return true;

    return dsc === this.dsc;
  }
}
