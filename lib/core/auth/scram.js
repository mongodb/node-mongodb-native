'use strict';

const crypto = require('crypto');
const Buffer = require('safe-buffer').Buffer;
const retrieveBSON = require('../connection/utils').retrieveBSON;
const MongoError = require('../error').MongoError;
const AuthProvider = require('./auth_provider').AuthProvider;

const BSON = retrieveBSON();
const Binary = BSON.Binary;

let saslprep;
try {
  saslprep = require('saslprep');
} catch (e) {
  // don't do anything;
}

var parsePayload = function(payload) {
  var dict = {};
  var parts = payload.split(',');
  for (var i = 0; i < parts.length; i++) {
    var valueParts = parts[i].split('=');
    dict[valueParts[0]] = valueParts[1];
  }

  return dict;
};

var passwordDigest = function(username, password) {
  if (typeof username !== 'string') throw new MongoError('username must be a string');
  if (typeof password !== 'string') throw new MongoError('password must be a string');
  if (password.length === 0) throw new MongoError('password cannot be empty');
  // Use node md5 generator
  var md5 = crypto.createHash('md5');
  // Generate keys used for authentication
  md5.update(username + ':mongo:' + password, 'utf8');
  return md5.digest('hex');
};

// XOR two buffers
function xor(a, b) {
  if (!Buffer.isBuffer(a)) a = Buffer.from(a);
  if (!Buffer.isBuffer(b)) b = Buffer.from(b);
  const length = Math.max(a.length, b.length);
  const res = [];

  for (let i = 0; i < length; i += 1) {
    res.push(a[i] ^ b[i]);
  }

  return Buffer.from(res).toString('base64');
}

function H(method, text) {
  return crypto
    .createHash(method)
    .update(text)
    .digest();
}

function HMAC(method, key, text) {
  return crypto
    .createHmac(method, key)
    .update(text)
    .digest();
}

var _hiCache = {};
var _hiCacheCount = 0;
var _hiCachePurge = function() {
  _hiCache = {};
  _hiCacheCount = 0;
};

const hiLengthMap = {
  sha256: 32,
  sha1: 20
};

function HI(data, salt, iterations, cryptoMethod) {
  // omit the work if already generated
  const key = [data, salt.toString('base64'), iterations].join('_');
  if (_hiCache[key] !== undefined) {
    return _hiCache[key];
  }

  // generate the salt
  const saltedData = crypto.pbkdf2Sync(
    data,
    salt,
    iterations,
    hiLengthMap[cryptoMethod],
    cryptoMethod
  );

  // cache a copy to speed up the next lookup, but prevent unbounded cache growth
  if (_hiCacheCount >= 200) {
    _hiCachePurge();
  }

  _hiCache[key] = saltedData;
  _hiCacheCount += 1;
  return saltedData;
}

function compareDigest(lhs, rhs) {
  if (lhs.length !== rhs.length) {
    return false;
  }

  if (typeof crypto.timingSafeEqual === 'function') {
    return crypto.timingSafeEqual(lhs, rhs);
  }

  let result = 0;
  for (let i = 0; i < lhs.length; i++) {
    result |= lhs[i] ^ rhs[i];
  }

  return result === 0;
}

/**
 * Creates a new ScramSHA authentication mechanism
 * @class
 * @extends AuthProvider
 */
class ScramSHA extends AuthProvider {
  constructor(bson, cryptoMethod) {
    super(bson);
    this.cryptoMethod = cryptoMethod || 'sha1';
  }

  static _getError(err, r) {
    if (err) {
      return err;
    }

    if (r.$err || r.errmsg) {
      return new MongoError(r);
    }
  }

  /**
   * @ignore
   */
  _executeScram(sendAuthCommand, connection, credentials, nonce, callback) {
    let username = credentials.username;
    const password = credentials.password;
    const db = credentials.source;

    const cryptoMethod = this.cryptoMethod;
    let mechanism = 'SCRAM-SHA-1';
    let processedPassword;

    if (cryptoMethod === 'sha256') {
      mechanism = 'SCRAM-SHA-256';

      processedPassword = saslprep ? saslprep(password) : password;
    } else {
      try {
        processedPassword = passwordDigest(username, password);
      } catch (e) {
        return callback(e);
      }
    }

    // Clean up the user
    username = username.replace('=', '=3D').replace(',', '=2C');

    // NOTE: This is done b/c Javascript uses UTF-16, but the server is hashing in UTF-8.
    // Since the username is not sasl-prep-d, we need to do this here.
    const firstBare = Buffer.concat([
      Buffer.from('n=', 'utf8'),
      Buffer.from(username, 'utf8'),
      Buffer.from(',r=', 'utf8'),
      Buffer.from(nonce, 'utf8')
    ]);

    // Build command structure
    const saslStartCmd = {
      saslStart: 1,
      mechanism,
      payload: new Binary(Buffer.concat([Buffer.from('n,,', 'utf8'), firstBare])),
      autoAuthorize: 1
    };

    // Write the commmand on the connection
    sendAuthCommand(connection, `${db}.$cmd`, saslStartCmd, (err, r) => {
      let tmpError = ScramSHA._getError(err, r);
      if (tmpError) {
        return callback(tmpError, null);
      }

      const payload = Buffer.isBuffer(r.payload) ? new Binary(r.payload) : r.payload;
      const dict = parsePayload(payload.value());

      const iterations = parseInt(dict.i, 10);
      if (iterations && iterations < 4096) {
        callback(new MongoError(`Server returned an invalid iteration count ${iterations}`), false);
        return;
      }

      const salt = dict.s;
      const rnonce = dict.r;
      if (rnonce.startsWith('nonce')) {
        callback(new MongoError(`Server returned an invalid nonce: ${rnonce}`), false);
        return;
      }

      // Set up start of proof
      const withoutProof = `c=biws,r=${rnonce}`;
      const saltedPassword = HI(
        processedPassword,
        Buffer.from(salt, 'base64'),
        iterations,
        cryptoMethod
      );

      const clientKey = HMAC(cryptoMethod, saltedPassword, 'Client Key');
      const serverKey = HMAC(cryptoMethod, saltedPassword, 'Server Key');
      const storedKey = H(cryptoMethod, clientKey);
      const authMessage = [firstBare, payload.value().toString('base64'), withoutProof].join(',');

      const clientSignature = HMAC(cryptoMethod, storedKey, authMessage);
      const clientProof = `p=${xor(clientKey, clientSignature)}`;
      const clientFinal = [withoutProof, clientProof].join(',');

      const serverSignature = HMAC(cryptoMethod, serverKey, authMessage);

      const saslContinueCmd = {
        saslContinue: 1,
        conversationId: r.conversationId,
        payload: new Binary(Buffer.from(clientFinal))
      };

      sendAuthCommand(connection, `${db}.$cmd`, saslContinueCmd, (err, r) => {
        if (r && typeof r.ok === 'number' && r.ok === 0) {
          callback(err, r);
          return;
        }

        const parsedResponse = parsePayload(r.payload.value());
        if (!compareDigest(Buffer.from(parsedResponse.v, 'base64'), serverSignature)) {
          callback(new MongoError('Server returned an invalid signature'));
          return;
        }

        if (!r || r.done !== false) {
          return callback(err, r);
        }

        const retrySaslContinueCmd = {
          saslContinue: 1,
          conversationId: r.conversationId,
          payload: Buffer.alloc(0)
        };

        sendAuthCommand(connection, `${db}.$cmd`, retrySaslContinueCmd, callback);
      });
    });
  }

  /**
   * Implementation of authentication for a single connection
   * @override
   */
  _authenticateSingleConnection(sendAuthCommand, connection, credentials, callback) {
    // Create a random nonce
    crypto.randomBytes(24, (err, buff) => {
      if (err) {
        return callback(err, null);
      }

      return this._executeScram(
        sendAuthCommand,
        connection,
        credentials,
        buff.toString('base64'),
        callback
      );
    });
  }

  /**
   * Authenticate
   * @override
   * @method
   */
  auth(sendAuthCommand, connections, credentials, callback) {
    this._checkSaslprep();
    super.auth(sendAuthCommand, connections, credentials, callback);
  }

  _checkSaslprep() {
    const cryptoMethod = this.cryptoMethod;

    if (cryptoMethod === 'sha256') {
      if (!saslprep) {
        console.warn('Warning: no saslprep library specified. Passwords will not be sanitized');
      }
    }
  }
}

/**
 * Creates a new ScramSHA1 authentication mechanism
 * @class
 * @extends ScramSHA
 */
class ScramSHA1 extends ScramSHA {
  constructor(bson) {
    super(bson, 'sha1');
  }
}

/**
 * Creates a new ScramSHA256 authentication mechanism
 * @class
 * @extends ScramSHA
 */
class ScramSHA256 extends ScramSHA {
  constructor(bson) {
    super(bson, 'sha256');
  }
}

module.exports = { ScramSHA1, ScramSHA256 };
