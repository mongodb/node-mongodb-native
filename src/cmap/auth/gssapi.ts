import { AuthProvider, AuthContext } from './auth_provider';
import { MongoError } from '../../error';
import { Kerberos, KerberosClient } from '../../deps';
import type { Callback } from '../../utils';
import type { HandshakeDocument } from '../connect';
import type { Document } from '../../bson';

const kGssapiClient = Symbol('GSSAPI_CLIENT');

type MechanismProperties = {
  gssapiCanonicalizeHostName?: boolean;
};

import * as dns from 'dns';

export class GSSAPI extends AuthProvider {
  [kGssapiClient]: KerberosClient;
  prepare(
    handshakeDoc: HandshakeDocument,
    authContext: AuthContext,
    callback: Callback<HandshakeDocument>
  ): void {
    const { host, port } = authContext.options;
    const { credentials } = authContext;
    if (!host || !port || !credentials) {
      return callback(
        new MongoError(
          `Connection must specify: ${host ? 'host' : ''}, ${port ? 'port' : ''}, ${
            credentials ? 'host' : 'credentials'
          }.`
        )
      );
    }

    if ('kModuleError' in Kerberos) {
      return callback(Kerberos['kModuleError']);
    }

    const { username, password, mechanismProperties } = credentials;
    const serviceName =
      mechanismProperties['gssapiservicename'] ||
      mechanismProperties['gssapiServiceName'] ||
      'mongodb';

    performGssapiCanonicalizeHostName(
      host,
      mechanismProperties as MechanismProperties,
      (err?: Error | MongoError, host?: string) => {
        if (err) return callback(err);

        const initOptions = {};
        if (password != null) {
          Object.assign(initOptions, { user: username, password: password });
        }

        Kerberos.initializeClient(
          `${serviceName}${process.platform === 'win32' ? '/' : '@'}${host}`,
          initOptions,
          (err: string, client: KerberosClient): void => {
            if (err) return callback(new MongoError(err));
            if (client == null) return callback();
            this[kGssapiClient] = client;
            callback(undefined, handshakeDoc);
          }
        );
      }
    );
  }

  auth(authContext: AuthContext, callback: Callback): void {
    const { connection, credentials } = authContext;
    if (credentials == null) return callback(new MongoError('credentials required'));
    const { username } = credentials;
    const client = this[kGssapiClient];
    if (client == null) return callback(new MongoError('gssapi client missing'));
    function externalCommand(
      command: Document,
      cb: Callback<{ payload: string; conversationId: any }>
    ) {
      return connection.command('$external.$cmd', command, cb);
    }
    client.step('', (err, payload) => {
      if (err) return callback(err);

      externalCommand(saslStart(payload), (err, result) => {
        if (err) return callback(err);
        if (result == null) return callback();
        negotiate(client, 10, result.payload, (err, payload) => {
          if (err) return callback(err);

          externalCommand(saslContinue(payload, result.conversationId), (err, result) => {
            if (err) return callback(err);
            if (result == null) return callback();
            finalize(client, username, result.payload, (err, payload) => {
              if (err) return callback(err);

              externalCommand(
                {
                  saslContinue: 1,
                  conversationId: result.conversationId,
                  payload
                },
                (err, result) => {
                  if (err) return callback(err);

                  callback(undefined, result);
                }
              );
            });
          });
        });
      });
    });
  }
}
function saslStart(payload?: string): Document {
  return {
    saslStart: 1,
    mechanism: 'GSSAPI',
    payload,
    autoAuthorize: 1
  };
}

function saslContinue(payload?: string, conversationId?: number): Document {
  return {
    saslContinue: 1,
    conversationId,
    payload
  };
}

function negotiate(
  client: KerberosClient,
  retries: number,
  payload: string,
  callback: Callback<string>
): void {
  client.step(payload, (err, response) => {
    // Retries exhausted, raise error
    if (err && retries === 0) return callback(err);

    // Adjust number of retries and call step again
    if (err) return negotiate(client, retries - 1, payload, callback);

    // Return the payload
    callback(undefined, response || '');
  });
}

function finalize(
  client: KerberosClient,
  user: string,
  payload: string,
  callback: Callback<string>
): void {
  // GSS Client Unwrap
  client.unwrap(payload, (err, response) => {
    if (err) return callback(err);

    // Wrap the response
    client.wrap(response || '', { user }, (err, wrapped) => {
      if (err) return callback(err);

      // Return the payload
      callback(undefined, wrapped);
    });
  });
}

function performGssapiCanonicalizeHostName(
  host: string,
  mechanismProperties: MechanismProperties,
  callback: Callback<string>
): void {
  if (!mechanismProperties.gssapiCanonicalizeHostName) return callback(undefined, host);

  // Attempt to resolve the host name
  dns.resolveCname(host, (err, r) => {
    if (err) return callback(err);

    // Get the first resolve host id
    if (Array.isArray(r) && r.length > 0) {
      return callback(undefined, r[0]);
    }

    callback(undefined, host);
  });
}
