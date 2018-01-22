'use strict';
const URL = require('url');
const qs = require('querystring');
const punycode = require('punycode');

const HOSTS_RX = /(mongodb(?:\+srv|)):\/\/(?: (?:[^:]*) (?: : ([^@]*) )? @ )?([^/?]*)(?:\/|)(.*)/;
/*
  This regular expression has the following cpature groups: [
    protocol, username, password, hosts
  ]
*/

/**
 *
 * @param {*} value
 */
function parseQueryStringItemValue(value) {
  if (Array.isArray(value)) {
    // deduplicate and simplify arrays
    value = value.filter((value, idx) => value.indexOf(value) === idx);
    if (value.length === 1) value = value[0];
  } else if (value.indexOf(':') > 0) {
    value = value.split(',').reduce((result, pair) => {
      const parts = pair.split(':');
      result[parts[0]] = parseQueryStringItemValue(parts[1]);
      return result;
    }, {});
  } else if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') {
    value = value.toLowerCase() === 'true';
  } else if (!Number.isNaN(value)) {
    const numericValue = parseFloat(value);
    if (!Number.isNaN(numericValue)) {
      value = parseFloat(value);
    }
  }

  return value;
}

/**
 *
 * @param {*} query
 */
function parseQueryString(query) {
  const result = {};
  let parsedQueryString = qs.parse(query);
  for (const key in parsedQueryString) {
    const value = parsedQueryString[key];
    if (value === '' || value == null) {
      return new Error('Incomplete key value pair for option');
    }

    result[key.toLowerCase()] = parseQueryStringItemValue(value);
  }

  // special cases for known deprecated options
  if (result.wtimeout && result.wtimeoutms) {
    delete result.wtimeout;
    // TODO: emit a warning
  }

  return Object.keys(result).length ? result : null;
}

const SUPPORTED_PROTOCOLS = ['mongodb', 'mongodb+srv'];

/**
 * Parses a MongoDB Connection string
 *
 * @param {*} uri the MongoDB connection string to parse
 * @param {parseCallback} callback
 */
function parseConnectionString(uri, callback) {
  const cap = uri.match(HOSTS_RX);
  if (!cap) {
    return callback(new Error('Invalid connection string'));
  }

  const protocol = cap[1];
  if (SUPPORTED_PROTOCOLS.indexOf(protocol) === -1) {
    return callback(new Error('Invalid protocol provided'));
  }

  const dbAndQuery = cap[4].split('?');
  const db = dbAndQuery.length > 0 ? dbAndQuery[0] : null;
  const query = dbAndQuery.length > 1 ? dbAndQuery[1] : null;
  const options = parseQueryString(query);
  if (options instanceof Error) {
    return callback(options);
  }

  const auth = { username: null, password: null, db: db && db !== '' ? qs.unescape(db) : null };
  if (cap[4].split('?')[0].indexOf('@') !== -1) {
    return callback(new Error('Unescaped slash in userinfo section'));
  }

  const authorityParts = cap[3].split('@');
  if (authorityParts.length > 2) {
    return callback(new Error('Unescaped at-sign in authority section'));
  }

  if (authorityParts.length > 1) {
    const authParts = authorityParts.shift().split(':');
    if (authParts.length > 2) {
      return callback(new Error('Unescaped colon in authority section'));
    }

    auth.username = qs.unescape(authParts[0]);
    auth.password = authParts[1] ? qs.unescape(authParts[1]) : null;
  }

  let hostParsingError = null;
  const hosts = authorityParts
    .shift()
    .split(',')
    .map(host => {
      let parsedHost = URL.parse(`mongodb://${host}`);
      if (parsedHost.path === '/:') {
        hostParsingError = new Error('Double colon in host identifier');
        return null;
      }

      // heuristically determine if we're working with a domain socket
      if (host.match(/\.sock/)) {
        parsedHost.hostname = qs.unescape(host);
        parsedHost.port = null;
      }

      if (Number.isNaN(parsedHost.port)) {
        hostParsingError = new Error('Invalid port (non-numeric string)');
        return;
      }

      const result = {
        host: punycode.toUnicode(parsedHost.hostname),
        port: parsedHost.port ? parseInt(parsedHost.port) : null
      };

      if (result.port === 0) {
        hostParsingError = new Error('Invalid port (zero) with hostname');
        return;
      }

      if (result.port > 65535) {
        hostParsingError = new Error('Invalid port (larger than 65535) with hostname');
        return;
      }

      if (result.port < 0) {
        hostParsingError = new Error('Invalid port (negative number)');
        return;
      }

      return result;
    })
    .filter(host => !!host);

  if (hostParsingError) {
    return callback(hostParsingError);
  }

  if (hosts.length === 0 || hosts[0].host === '' || hosts[0].host === null) {
    return callback(new Error('No hostname or hostnames provided in connection string'));
  }

  callback(null, { hosts: hosts, auth: auth.db || auth.username ? auth : null, options: options });
}

module.exports = parseConnectionString;
