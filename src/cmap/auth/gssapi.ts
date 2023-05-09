import * as dns from 'dns';

import type { Document } from '../../bson';
import { Kerberos, KerberosClient } from '../../deps';
import {
  MongoError,
  MongoInvalidArgumentError,
  MongoMissingCredentialsError,
  MongoMissingDependencyError,
  MongoRuntimeError
} from '../../error';
import { Callback, ns } from '../../utils';
import { AuthContext, AuthProvider } from './auth_provider';

/** @public */
export const GSSAPICanonicalizationValue = Object.freeze({
  on: true,
  off: false,
  none: 'none',
  forward: 'forward',
  forwardAndReverse: 'forwardAndReverse'
} as const);

/** @public */
export type GSSAPICanonicalizationValue =
  (typeof GSSAPICanonicalizationValue)[keyof typeof GSSAPICanonicalizationValue];

type MechanismProperties = {
  /** @deprecated use `CANONICALIZE_HOST_NAME` instead */
  gssapiCanonicalizeHostName?: boolean;
  CANONICALIZE_HOST_NAME?: GSSAPICanonicalizationValue;
  SERVICE_HOST?: string;
  SERVICE_NAME?: string;
  SERVICE_REALM?: string;
};

export class GSSAPI extends AuthProvider {
  override auth(authContext: AuthContext, callback: Callback): void {
    const { connection, credentials } = authContext;
    if (credentials == null)
      return callback(
        new MongoMissingCredentialsError('Credentials required for GSSAPI authentication')
      );
    const { username } = credentials;
    function externalCommand(
      command: Document,
      cb: Callback<{ payload: string; conversationId: any }>
    ) {
      return connection.command(ns('$external.$cmd'), command, undefined, cb);
    }
    makeKerberosClient(authContext, (err, client) => {
      if (err) return callback(err);
      if (client == null) return callback(new MongoMissingDependencyError('GSSAPI client missing'));
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
    });
  }
}

function makeKerberosClient(authContext: AuthContext, callback: Callback<KerberosClient>): void {
  const { hostAddress } = authContext.options;
  const { credentials } = authContext;
  if (!hostAddress || typeof hostAddress.host !== 'string' || !credentials) {
    return callback(
      new MongoInvalidArgumentError('Connection must have host and port and credentials defined.')
    );
  }

  if ('kModuleError' in Kerberos) {
    return callback(Kerberos['kModuleError']);
  }
  const { initializeClient } = Kerberos;

  const { username, password } = credentials;
  const mechanismProperties = credentials.mechanismProperties as MechanismProperties;

  const serviceName = mechanismProperties.SERVICE_NAME ?? 'mongodb';

  performGSSAPICanonicalizeHostName(
    hostAddress.host,
    mechanismProperties,
    (err?: Error | MongoError, host?: string) => {
      if (err) return callback(err);

      const initOptions = {};
      if (password != null) {
        Object.assign(initOptions, { user: username, password: password });
      }

      const spnHost = mechanismProperties.SERVICE_HOST ?? host;
      let spn = `${serviceName}${process.platform === 'win32' ? '/' : '@'}${spnHost}`;
      if ('SERVICE_REALM' in mechanismProperties) {
        spn = `${spn}@${mechanismProperties.SERVICE_REALM}`;
      }

      initializeClient(spn, initOptions, (err: string, client: KerberosClient): void => {
        // TODO(NODE-3483)
        if (err) return callback(new MongoRuntimeError(err));
        callback(undefined, client);
      });
    }
  );
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

export function performGSSAPICanonicalizeHostName(
  host: string,
  mechanismProperties: MechanismProperties,
  callback: Callback<string>
): void {
  const mode = mechanismProperties.CANONICALIZE_HOST_NAME;
  if (!mode || mode === GSSAPICanonicalizationValue.none) {
    return callback(undefined, host);
  }

  // If forward and reverse or true
  if (
    mode === GSSAPICanonicalizationValue.on ||
    mode === GSSAPICanonicalizationValue.forwardAndReverse
  ) {
    // Perform the lookup of the ip address.
    dns.lookup(host, (error, address) => {
      // No ip found, return the error.
      if (error) return callback(error);

      // Perform a reverse ptr lookup on the ip address.
      dns.resolvePtr(address, (err, results) => {
        // This can error as ptr records may not exist for all ips. In this case
        // fallback to a cname lookup as dns.lookup() does not return the
        // cname.
        if (err) {
          return resolveCname(host, callback);
        }
        // If the ptr did not error but had no results, return the host.
        callback(undefined, results.length > 0 ? results[0] : host);
      });
    });
  } else {
    // The case for forward is just to resolve the cname as dns.lookup()
    // will not return it.
    resolveCname(host, callback);
  }
}

export function resolveCname(host: string, callback: Callback<string>): void {
  // Attempt to resolve the host name
  dns.resolveCname(host, (err, r) => {
    if (err) return callback(undefined, host);

    // Get the first resolve host id
    if (r.length > 0) {
      return callback(undefined, r[0]);
    }

    callback(undefined, host);
  });
}
