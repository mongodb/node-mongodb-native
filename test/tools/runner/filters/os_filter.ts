import { Filter } from './filter';

/**
 * Filter for the OS required for the test
 *
 * @example
 * ```js
 * metadata: {
 *    requires: {
 *      os: 'osName'
 *    }
 * }
 * ```
 */
export class OSFilter extends Filter {
  platform: string;
  constructor() {
    super();
    // Get environmental variables that are known
    this.platform = process.platform;
  }

  filter(test: { metadata?: MongoDBMetadataUI }) {
    if (!test.metadata) return true;
    if (!test.metadata.requires) return true;
    if (!test.metadata.requires.os) return true;

    // Get the os
    const os = test.metadata.requires.os;
    if (os === this.platform) return true;
    // If !platform only allow running if the platform match
    if (os[0] === '!' && os !== '!' + this.platform) return true;
    return false;
  }
}
