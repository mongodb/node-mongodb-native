import { type MongoClient } from '../../../../src';
import { Filter } from './filter';

/**
 * Filter for the MongoDB API Version required for the test
 *
 * @example
 * ```js
 * metadata: {
 *    requires: {
 *      apiVersion: '1'
 *    }
 * }
 * ```
 */
export class ApiVersionFilter extends Filter {
  apiVersion: string | undefined;
  constructor() {
    super();
    // Get environmental variables that are known
    this.apiVersion =
      typeof process.env.MONGODB_API_VERSION === 'string' &&
      process.env.MONGODB_API_VERSION.length > 0
        ? process.env.MONGODB_API_VERSION
        : undefined;
  }

  override async initializeFilter(
    _client: MongoClient,
    context: Record<string, any>
  ): Promise<void> {
    context.serverApi = this.apiVersion;
  }

  filter(test: { metadata?: MongoDBMetadataUI }) {
    if (!test.metadata) return true;
    if (!test.metadata.requires) return true;
    const apiVersion = test.metadata.requires.apiVersion;

    // setting to false skips this test when an apiVersion is required
    if (apiVersion === false) return !this.apiVersion;
    // setting to true requires some apiVersion be specified
    if (apiVersion === true) return !!this.apiVersion;

    // if there's no metadata requirement, always run
    if (apiVersion == null) return true;

    // otherwise attempt a direct match
    return apiVersion === this.apiVersion;
  }
}
