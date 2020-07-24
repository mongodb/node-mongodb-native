import URL = require('url');
import qs = require('querystring');
import { MongoParseError } from '../error';

const HOSTS_RX = /(mongodb(?:\+srv|)):\/\/(?: (?:[^:]*) (?: : ([^@]*) )? @ )?([^/?]*)(?:\/|)(.*)/;
const PROTOCOL_MONGODB = 'mongodb';
const PROTOCOL_MONGODB_SRV = 'mongodb+srv';
const SUPPORTED_PROTOCOLS = [PROTOCOL_MONGODB, PROTOCOL_MONGODB_SRV];

export function parseConnectionString(uri: string) {
  const cap = uri.match(HOSTS_RX);
  if (!cap) {
    throw new MongoParseError('Invalid connection string');
  }

  const protocol = cap[1];
  if (SUPPORTED_PROTOCOLS.indexOf(protocol) === -1) {
    throw new MongoParseError('Invalid protocol provided');
  }

  const dbAndQuery = cap[4].split('?');
  const db = dbAndQuery.length > 0 ? dbAndQuery[0] : undefined;
  const query = dbAndQuery.length > 1 ? dbAndQuery[1] : undefined;

  const auth: { username?: string; password?: string; db?: string } = {
    db: db && db !== '' ? qs.unescape(db) : undefined
  };

  if (cap[4].split('?')[0].indexOf('@') !== -1) {
    throw new MongoParseError('Unescaped slash in userinfo section');
  }

  const authorityParts: any = cap[3].split('@');
  if (authorityParts.length > 2) {
    throw new MongoParseError('Unescaped at-sign in authority section');
  }

  if (authorityParts[0] == null || authorityParts[0] === '') {
    throw new MongoParseError('No username provided in authority section');
  }

  if (authorityParts.length > 1) {
    const authParts = authorityParts.shift().split(':');
    if (authParts.length > 2) {
      throw new MongoParseError('Unescaped colon in authority section');
    }

    if (authParts[0] === '') {
      throw new MongoParseError('Invalid empty username provided');
    }

    if (!auth.username) auth.username = qs.unescape(authParts[0]);
    if (!auth.password) auth.password = authParts[1] ? qs.unescape(authParts[1]) : undefined;
  }

  let hostParsingError = null;
  const hosts = authorityParts
    .shift()
    .split(',')
    .map((host: any) => {
      let parsedHost: any = URL.parse(`mongodb://${host}`);
      if (parsedHost.path === '/:') {
        hostParsingError = new MongoParseError('Double colon in host identifier');
        return null;
      }

      // heuristically determine if we're working with a domain socket
      if (host.match(/\.sock/)) {
        parsedHost.hostname = qs.unescape(host);
        parsedHost.port = null;
      }

      if (Number.isNaN(parsedHost.port)) {
        hostParsingError = new MongoParseError('Invalid port (non-numeric string)');
        return;
      }

      const result = {
        host: parsedHost.hostname,
        port: parsedHost.port ? parseInt(parsedHost.port) : 27017
      };

      if (result.port === 0) {
        hostParsingError = new MongoParseError('Invalid port (zero) with hostname');
        return;
      }

      if (result.port > 65535) {
        hostParsingError = new MongoParseError('Invalid port (larger than 65535) with hostname');
        return;
      }

      if (result.port < 0) {
        hostParsingError = new MongoParseError('Invalid port (negative number)');
        return;
      }

      return result;
    })
    .filter((host: any) => !!host) as { host: string; port: number }[];

  if (hostParsingError) {
    throw hostParsingError;
  }

  if (hosts.length === 0 || hosts[0].host === '' || hosts[0].host === null) {
    throw new MongoParseError('No hostname or hostnames provided in connection string');
  }

  return {
    protocol,
    hosts: hosts,
    auth: auth.db || auth.username ? auth : undefined,
    defaultDatabase: auth.db ? auth.db : 'test',
    query: query ? qs.parse(query) : undefined
  };
}
