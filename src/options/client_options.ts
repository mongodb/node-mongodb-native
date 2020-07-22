const url = require('url');
const qs = require('querystring');
import { UriOptions, ClientOptions } from './types';
import { CoerceCustom } from './coerce_custom';

export class MongoClientOptions {
  static parseConnectionString(connectionString: string) {
    const HOSTS_RX = /(mongodb(?:\+srv|)):\/\/(?: (?:[^:]*) (?: : ([^@]*) )? @ )?([^/?]*)(?:\/|)(.*)/;
    const matches = connectionString.match(HOSTS_RX);
    const protocol = matches && matches[1];
    const dbAndQuery = (matches && matches[4].split('?')) || [];
    const db = dbAndQuery.length > 0 ? dbAndQuery[0] : null;
    const queryString: string | null = dbAndQuery.length > 1 ? dbAndQuery[1] : null;
    const query: UriOptions = qs.parse(queryString);
    const main = (matches && matches[3].split('@')) || [];
    let hosts: string[] = [];
    let authParts: (string | null)[] = [null, null];
    if (main.length === 1) {
      hosts = main[0].split(',').map((h: string) => url.parse(`mongodb://${h}`));
    } else if (main.length >= 2) {
      const mainFirstShift = main.shift();
      if (typeof mainFirstShift !== 'undefined') authParts = mainFirstShift.split(':');
      const mainSecondShift = main.shift();
      if (typeof mainSecondShift !== 'undefined') {
        hosts = mainSecondShift.split(',').map((h: string) => url.parse(`mongodb://${h}`));
      }
    }
    const username = authParts[0];
    const password = authParts[1];
    return { protocol, db, queryString, query, username, password, hosts };
  }
  static parse(connectionString: string, options: ClientOptions) {
    const { query, ...rest } = MongoClientOptions.parseConnectionString(connectionString)
    return {
      connectionString,
      ...CoerceCustom.mongoClientOptions(query, options),
      ...rest
    }
  }
}
