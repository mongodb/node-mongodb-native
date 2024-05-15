import * as semver from 'semver';

import { type MongoClient } from '../../../mongodb';
import { Filter } from './filter';

/**
 * Filter for the MongoDB version required for the test
 *
 * @example
 * ```js
 * metadata: {
 *    requires: {
 *      mongodb: 'mongodbSemverVersion'
 *    }
 * }
 * ```
 */
export class MongoDBVersionFilter extends Filter {
  version: string | null;

  constructor() {
    super();
    this.version = null;
  }

  override async initializeFilter(client: MongoClient, context: Record<string, any>) {
    const result = await client.db('admin').command({ buildInfo: true });
    context.version = this.version = result.versionArray.slice(0, 3).join('.');
    context.buildInfo = result;
  }

  filter(test: { metadata?: MongoDBMetadataUI }) {
    if (!test.metadata) return true;
    if (!test.metadata.requires) return true;
    if (!test.metadata.requires.mongodb) return true;
    if (typeof this.version !== 'string') throw new Error('expected version string!');
    return semver.satisfies(this.version, test.metadata.requires.mongodb);
  }
}
