'use strict';
const URL = require('url');
const qs = require('querystring');
const dns = require('dns');
const MongoParseError = require('./error').MongoParseError;

/**
 * The following regular expression validates a connection string and breaks the
 * provide string into the following capture groups: [protocol, username, password, hosts]
 */
const HOSTS_RX = /(mongodb(?:\+srv|)):\/\/(?: (?:[^:]*) (?: : ([^@]*) )? @ )?([^/?]*)(?:\/|)(.*)/;

/**
 * Determines whether a provided address matches the provided parent domain in order
 * to avoid certain attack vectors.
 *
 * @param {String} srvAddress The address to check against a domain
 * @param {String} parentDomain The domain to check the provided address against
 * @return {Boolean} Whether the provided address matches the parent domain
 */
function matchesParentDomain(srvAddress, parentDomain) {
  const regex = /^.*?\./;
  const srv = `.${srvAddress.replace(regex, '')}`;
  const parent = `.${parentDomain.replace(regex, '')}`;
  return srv.endsWith(parent);
}

/**
 * Lookup an `mongodb+srv` connection string, combine the parts and reparse it as a normal
 * connection string.
 *
 * @param {string} uri The connection string to parse
 * @param {object} options Optional user provided connection string options
 * @param {function} callback
 */
function parseSrvConnectionString(uri, options, callback) {
  const result = URL.parse(uri, true);

  if (result.hostname.split('.').length < 3) {
    return callback(new MongoParseError('URI does not have hostname, domain name and tld'));
  }

  result.domainLength = result.hostname.split('.').length;
  if (result.pathname && result.pathname.match(',')) {
    return callback(new MongoParseError('Invalid URI, cannot contain multiple hostnames'));
  }

  if (result.port) {
    return callback(new MongoParseError(`Ports not accepted with '${PROTOCOL_MONGODB_SRV}' URIs`));
  }

  let srvAddress = `_mongodb._tcp.${result.host}`;
  dns.resolveSrv(srvAddress, (err, addresses) => {
    if (err) return callback(err);

    if (addresses.length === 0) {
      return callback(new MongoParseError('No addresses found at host'));
    }

    for (let i = 0; i < addresses.length; i++) {
      if (!matchesParentDomain(addresses[i].name, result.hostname, result.domainLength)) {
        return callback(
          new MongoParseError('Server record does not share hostname with parent URI')
        );
      }
    }

    let base = result.auth ? `mongodb://${result.auth}@` : `mongodb://`;
    let connectionStrings = addresses.map(
      (address, i) =>
        i === 0 ? `${base}${address.name}:${address.port}` : `${address.name}:${address.port}`
    );

    let connectionString = connectionStrings.join(',') + '/';
    let connectionStringOptions = [];

    // Default to SSL true
    if (!options.ssl && (!result.search || result.query['ssl'] == null)) {
      connectionStringOptions.push('ssl=true');
    }

    // Keep original uri options
    if (result.search) {
      connectionStringOptions.push(result.search.replace('?', ''));
    }

    dns.resolveTxt(result.host, (err, record) => {
      if (err) {
        if (err.code !== 'ENODATA') {
          return callback(err);
        }
        record = null;
      }

      if (record) {
        if (record.length > 1) {
          return callback(new MongoParseError('Multiple text records not allowed'));
        }

        record = record[0];
        record = record.length > 1 ? record.join('') : record[0];
        if (!record.includes('authSource') && !record.includes('replicaSet')) {
          return callback(
            new MongoParseError('Text record must only set `authSource` or `replicaSet`')
          );
        }

        connectionStringOptions.push(record);
      }

      // Add any options to the connection string
      if (connectionStringOptions.length) {
        connectionString += `?${connectionStringOptions.join('&')}`;
      }

      parseConnectionString(connectionString, callback);
    });
  });
}

/**
 * Parses a query string item according to the connection string spec
 *
 * @param {Array|String} value The value to parse
 * @return {Array|Object|String} The parsed value
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
 * Parses a query string according the connection string spec.
 *
 * @param {String} query The query string to parse
 * @return {Object|Error} The parsed query string as an object, or an error if one was encountered
 */
function parseQueryString(query) {
  const result = {};
  let parsedQueryString = qs.parse(query);

  for (const key in parsedQueryString) {
    const value = parsedQueryString[key];
    if (value === '' || value == null) {
      return new MongoParseError('Incomplete key value pair for option');
    }

    result[key.toLowerCase()] = parseQueryStringItemValue(value);
  }

  // special cases for known deprecated options
  if (result.wtimeout && result.wtimeoutms) {
    delete result.wtimeout;
    console.warn('Unsupported option `wtimeout` specified');
  }

  return Object.keys(result).length ? result : null;
}

const PROTOCOL_MONGODB = 'mongodb';
const PROTOCOL_MONGODB_SRV = 'mongodb+srv';
const SUPPORTED_PROTOCOLS = [PROTOCOL_MONGODB, PROTOCOL_MONGODB_SRV];

/**
 * Parses a MongoDB connection string
 *
 * @param {*} uri the MongoDB connection string to parse
 * @param {object} [options] Optional settings.
 * @param {parseCallback} callback
 */
function parseConnectionString(uri, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  // Check for bad uris before we parse
  try {
    URL.parse(uri);
  } catch (e) {
    return callback(new MongoParseError('URI malformed, cannot be parsed'));
  }

  const cap = uri.match(HOSTS_RX);
  if (!cap) {
    return callback(new MongoParseError('Invalid connection string'));
  }

  const protocol = cap[1];
  if (SUPPORTED_PROTOCOLS.indexOf(protocol) === -1) {
    return callback(new MongoParseError('Invalid protocol provided'));
  }

  if (protocol === PROTOCOL_MONGODB_SRV) {
    return parseSrvConnectionString(uri, options, callback);
  }

  const dbAndQuery = cap[4].split('?');
  const db = dbAndQuery.length > 0 ? dbAndQuery[0] : null;
  const query = dbAndQuery.length > 1 ? dbAndQuery[1] : null;
  let parsedOptions = parseQueryString(query);
  if (parsedOptions instanceof MongoParseError) {
    return callback(parsedOptions);
  }

  parsedOptions = Object.assign({}, parsedOptions, options);
  const auth = { username: null, password: null, db: db && db !== '' ? qs.unescape(db) : null };
  if (cap[4].split('?')[0].indexOf('@') !== -1) {
    return callback(new MongoParseError('Unescaped slash in userinfo section'));
  }

  const authorityParts = cap[3].split('@');
  if (authorityParts.length > 2) {
    return callback(new MongoParseError('Unescaped at-sign in authority section'));
  }

  if (authorityParts.length > 1) {
    const authParts = authorityParts.shift().split(':');
    if (authParts.length > 2) {
      return callback(new MongoParseError('Unescaped colon in authority section'));
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
        port: parsedHost.port ? parseInt(parsedHost.port) : null
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
    .filter(host => !!host);

  if (hostParsingError) {
    return callback(hostParsingError);
  }

  if (hosts.length === 0 || hosts[0].host === '' || hosts[0].host === null) {
    return callback(new MongoParseError('No hostname or hostnames provided in connection string'));
  }

  callback(null, {
    hosts: hosts,
    auth: auth.db || auth.username ? auth : null,
    options: Object.keys(parsedOptions).length ? parsedOptions : null
  });
}

module.exports = parseConnectionString;
