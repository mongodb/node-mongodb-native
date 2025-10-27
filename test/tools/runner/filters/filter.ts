import { type MongoClient } from '../../../../src';

export abstract class Filter {
  async initializeFilter(_client: MongoClient, _context: Record<string, any>): Promise<void> {
    return;
  }

  abstract filter(test: { metadata?: MongoDBMetadataUI }): string | boolean;
}
