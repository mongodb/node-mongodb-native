import type { UriOptions, ClientOptions } from './types';
import { CoerceCustom } from './coerce_custom';
import { parseConnectionString } from './connection_string';

export class MongoClientOptions {
  static parse(connectionString: string, options: ClientOptions = {}) {
    const { query, ...rest } = parseConnectionString(connectionString);
    return {
      connectionString,
      ...CoerceCustom.mongoClientOptions(query as UriOptions, options),
      ...rest
    };
  }
}
