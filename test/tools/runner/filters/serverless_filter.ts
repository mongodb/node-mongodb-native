import { type MongoClient } from '../../../mongodb';
import { shouldRunServerlessTest } from '../../utils';
import { Filter } from './filter';

/**
 * Filter to allow to tests to run on serverless
 *
 * @example
 * ```js
 * metadata: {
 *    requires: {
 *      serverless: 'forbid'
 *    }
 * }
 * ```
 */
export class ServerlessFilter extends Filter {
  serverless: boolean;
  constructor() {
    super();
    // Get environmental variables that are known
    this.serverless = !!process.env.SERVERLESS;
  }

  async initializeFilter(client: MongoClient, context: Record<string, any>) {
    if (this.serverless) {
      context.serverlessCredentials = {
        username: process.env.SERVERLESS_ATLAS_USER,
        password: process.env.SERVERLESS_ATLAS_PASSWORD
      };
    }
  }

  filter(test: { metadata?: MongoDBMetadataUI }) {
    if (!test.metadata) return true;
    if (!test.metadata.requires) return true;
    return shouldRunServerlessTest(test.metadata.requires.serverless, this.serverless);
  }
}
