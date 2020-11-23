import * as http from 'http';
import * as crypto from 'crypto';
import * as url from 'url';
import * as BSON from '../../bson';
import { AuthProvider, AuthContext } from './auth_provider';
import { MongoCredentials } from './mongo_credentials';
import { MongoError } from '../../error';
import { maxWireVersion, Callback } from '../../utils';
import type { BSONSerializeOptions } from '../../bson';

import { aws4 } from '../../deps';
import { AuthMechanism } from './defaultAuthProviders';

const ASCII_N = 110;
const AWS_RELATIVE_URI = 'http://169.254.170.2';
const AWS_EC2_URI = 'http://169.254.169.254';
const AWS_EC2_PATH = '/latest/meta-data/iam/security-credentials';
const bsonOptions: BSONSerializeOptions = {
  promoteLongs: true,
  promoteValues: true,
  promoteBuffers: false
};

interface AWSSaslContinuePayload {
  a: string;
  d: string;
  t?: string;
}

export class MongoDBAWS extends AuthProvider {
  auth(authContext: AuthContext, callback: Callback): void {
    const { connection, credentials } = authContext;
    if (!credentials) {
      return callback(new MongoError('AuthContext must provide credentials.'));
    }

    if ('kModuleError' in aws4) {
      return callback(aws4['kModuleError']);
    }

    if (maxWireVersion(connection) < 9) {
      callback(new MongoError('MONGODB-AWS authentication requires MongoDB version 4.4 or later'));
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
    crypto.randomBytes(32, (err, nonce) => {
      if (err) {
        callback(err);
        return;
      }

      const saslStart = {
        saslStart: 1,
        mechanism: 'MONGODB-AWS',
        payload: BSON.serialize({ r: nonce, p: ASCII_N }, bsonOptions)
      };

      connection.command(`${db}.$cmd`, saslStart, (err, res) => {
        if (err) return callback(err);

        const serverResponse = BSON.deserialize(res.payload.buffer, bsonOptions);
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
        const payload: AWSSaslContinuePayload = { a: authorization, d: date };
        if (token) {
          payload.t = token;
        }

        const saslContinue = {
          saslContinue: 1,
          conversationId: 1,
          payload: BSON.serialize(payload, bsonOptions)
        };

        connection.command(`${db}.$cmd`, saslContinue, callback);
      });
    });
  }
}

interface AWSCredentials {
  AccessKeyId?: string;
  SecretAccessKey?: string;
  Token?: string;
}

function makeTempCredentials(credentials: MongoCredentials, callback: Callback<MongoCredentials>) {
  function done(creds: AWSCredentials) {
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
        mechanism: AuthMechanism.MONGODB_AWS,
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

function deriveRegion(host: string) {
  const parts = host.split('.');
  if (parts.length === 1 || parts[1] === 'amazonaws') {
    return 'us-east-1';
  }

  return parts[1];
}

interface RequestOptions {
  json?: boolean;
  method?: string;
  timeout?: number;
  headers?: http.OutgoingHttpHeaders;
}

function request(uri: string, callback: Callback): void;
function request(uri: string, options: RequestOptions, callback: Callback): void;
function request(uri: string, _options: RequestOptions | Callback, _callback?: Callback) {
  let options = _options as RequestOptions;
  if ('function' === typeof _options) {
    options = {};
  }

  let callback: Callback = _options as Callback;
  if (_callback) {
    callback = _callback;
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
