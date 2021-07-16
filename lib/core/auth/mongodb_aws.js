'use strict';
const AuthProvider = require('./auth_provider').AuthProvider;
const MongoCredentials = require('./mongo_credentials').MongoCredentials;
const MongoError = require('../error').MongoError;
const crypto = require('crypto');
const http = require('http');
const maxWireVersion = require('../utils').maxWireVersion;
const url = require('url');

let aws4;
try {
  // Ensure you always wrap an optional require in the try block NODE-3199
  aws4 = require('aws4');
} catch (e) {
  // don't do anything;
}

const ASCII_N = 110;
const AWS_RELATIVE_URI = 'http://169.254.170.2';
const AWS_EC2_URI = 'http://169.254.169.254';
const AWS_EC2_PATH = '/latest/meta-data/iam/security-credentials';

class MongoDBAWS extends AuthProvider {
  auth(authContext, callback) {
    const connection = authContext.connection;
    const credentials = authContext.credentials;

    if (maxWireVersion(connection) < 9) {
      callback(new MongoError('MONGODB-AWS authentication requires MongoDB version 4.4 or later'));
      return;
    }

    if (aws4 == null) {
      callback(
        new MongoError(
          'MONGODB-AWS authentication requires the `aws4` module, please install it as a dependency of your project'
        )
      );

      return;
    }

    if (credentials.username == null) {
      makeTempCredentials(credentials, (err, tempCredentials) => {
        if (err) return callback(err);

        authContext.credentials = tempCredentials;
        this.auth(authContext, callback);
      });

      return;
    }

    const username = credentials.username;
    const password = credentials.password;
    const db = credentials.source;
    const token = credentials.mechanismProperties.AWS_SESSION_TOKEN;
    const bson = this.bson;

    crypto.randomBytes(32, (err, nonce) => {
      if (err) {
        callback(err);
        return;
      }

      const saslStart = {
        saslStart: 1,
        mechanism: 'MONGODB-AWS',
        payload: bson.serialize({ r: nonce, p: ASCII_N })
      };

      connection.command(`${db}.$cmd`, saslStart, (err, result) => {
        if (err) return callback(err);

        const res = result.result;
        const serverResponse = bson.deserialize(res.payload.buffer);
        const host = serverResponse.h;
        const serverNonce = serverResponse.s.buffer;
        if (serverNonce.length !== 64) {
          callback(
            new MongoError(`Invalid server nonce length ${serverNonce.length}, expected 64`)
          );
          return;
        }

        if (serverNonce.compare(nonce, 0, nonce.length, 0, nonce.length) !== 0) {
          callback(new MongoError('Server nonce does not begin with client nonce'));
          return;
        }

        if (host.length < 1 || host.length > 255 || host.indexOf('..') !== -1) {
          callback(new MongoError(`Server returned an invalid host: "${host}"`));
          return;
        }

        const body = 'Action=GetCallerIdentity&Version=2011-06-15';
        const options = aws4.sign(
          {
            method: 'POST',
            host,
            region: deriveRegion(serverResponse.h),
            service: 'sts',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Content-Length': body.length,
              'X-MongoDB-Server-Nonce': serverNonce.toString('base64'),
              'X-MongoDB-GS2-CB-Flag': 'n'
            },
            path: '/',
            body
          },
          {
            accessKeyId: username,
            secretAccessKey: password,
            token
          }
        );

        const authorization = options.headers.Authorization;
        const date = options.headers['X-Amz-Date'];
        const payload = { a: authorization, d: date };
        if (token) {
          payload.t = token;
        }

        const saslContinue = {
          saslContinue: 1,
          conversationId: 1,
          payload: bson.serialize(payload)
        };

        connection.command(`${db}.$cmd`, saslContinue, err => {
          if (err) return callback(err);
          callback();
        });
      });
    });
  }
}

function makeTempCredentials(credentials, callback) {
  function done(creds) {
    if (creds.AccessKeyId == null || creds.SecretAccessKey == null || creds.Token == null) {
      callback(new MongoError('Could not obtain temporary MONGODB-AWS credentials'));
      return;
    }

    callback(
      undefined,
      new MongoCredentials({
        username: creds.AccessKeyId,
        password: creds.SecretAccessKey,
        source: credentials.source,
        mechanism: 'MONGODB-AWS',
        mechanismProperties: {
          AWS_SESSION_TOKEN: creds.Token
        }
      })
    );
  }

  // If the environment variable AWS_CONTAINER_CREDENTIALS_RELATIVE_URI
  // is set then drivers MUST assume that it was set by an AWS ECS agent
  if (process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI) {
    request(
      `${AWS_RELATIVE_URI}${process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI}`,
      (err, res) => {
        if (err) return callback(err);
        done(res);
      }
    );

    return;
  }

  // Otherwise assume we are on an EC2 instance

  // get a token

  request(
    `${AWS_EC2_URI}/latest/api/token`,
    { method: 'PUT', json: false, headers: { 'X-aws-ec2-metadata-token-ttl-seconds': 30 } },
    (err, token) => {
      if (err) return callback(err);

      // get role name
      request(
        `${AWS_EC2_URI}/${AWS_EC2_PATH}`,
        { json: false, headers: { 'X-aws-ec2-metadata-token': token } },
        (err, roleName) => {
          if (err) return callback(err);

          // get temp credentials
          request(
            `${AWS_EC2_URI}/${AWS_EC2_PATH}/${roleName}`,
            { headers: { 'X-aws-ec2-metadata-token': token } },
            (err, creds) => {
              if (err) return callback(err);
              done(creds);
            }
          );
        }
      );
    }
  );
}

function deriveRegion(host) {
  const parts = host.split('.');
  if (parts.length === 1 || parts[1] === 'amazonaws') {
    return 'us-east-1';
  }

  return parts[1];
}

function request(uri, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  options = Object.assign(
    {
      method: 'GET',
      timeout: 10000,
      json: true
    },
    url.parse(uri),
    options
  );

  const req = http.request(options, res => {
    res.setEncoding('utf8');

    let data = '';
    res.on('data', d => (data += d));
    res.on('end', () => {
      if (options.json === false) {
        callback(undefined, data);
        return;
      }

      try {
        const parsed = JSON.parse(data);
        callback(undefined, parsed);
      } catch (err) {
        callback(new MongoError(`Invalid JSON response: "${data}"`));
      }
    });
  });

  req.on('error', err => callback(err));
  req.end();
}

module.exports = MongoDBAWS;
