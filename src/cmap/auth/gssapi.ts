import { AuthProvider, AuthContext } from './auth_provider';
import type { Callback } from '../../types';
import { MongoError } from '../../error';
import { Kerberos } from '../../deps';

import * as dns from 'dns';

interface KerberosClient {
  step: (challenge: string, callback?: Callback<string>) => Promise<string> | void;
  wrap: (
    challenge: string,
    options?: { user: string },
    callback?: Callback<string>
  ) => Promise<string> | void;
  unwrap: (challenge: string, callback?: Callback<string>) => Promise<string> | void;
}
interface GSSAPIContext {
  host: string;
  port: string | number;
  serviceName: string;
  canonicalizeHostName: boolean;
  retries: number;
  username: string;
  password: string;
  client: KerberosClient;
}

export class GSSAPI extends AuthProvider {
  auth(authContext: AuthContext, callback: Callback): void {
    const { host, port } = authContext.options;
    const { connection, credentials } = authContext;
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

    const username = credentials.username;
    const password = credentials.password;
    const mechanismProperties = credentials.mechanismProperties;
    const gssapiServiceName =
      mechanismProperties['gssapiservicename'] ||
      mechanismProperties['gssapiServiceName'] ||
      'mongodb';

    function externalCommand(
      command: object,
      cb: (
        err: Error | MongoError | undefined,
        result: { result: { payload: string; conversationId: any } }
      ) => void
    ) {
      return connection.command('$external.$cmd', command, cb);
    }

    initialize(
      {
        retries: 10,
        host,
        port,
        username,
        password,
        serviceName: gssapiServiceName,
        canonicalizeHostName:
          typeof mechanismProperties.gssapiCanonicalizeHostName === 'boolean'
            ? mechanismProperties.gssapiCanonicalizeHostName
            : false
      },
      (err, context) => {
        if (err) return callback(err);

        context!.client.step('', (err, payload) => {
          if (err) return callback(err);

          externalCommand(
            {
              saslStart: 1,
              mechanism: 'GSSAPI',
              payload,
              autoAuthorize: 1
            },
            (err, result) => {
              if (err) return callback(err);

              const doc = result.result;
              negotiate(context!, doc.payload, (err, payload) => {
                if (err) return callback(err);

                externalCommand(
                  {
                    saslContinue: 1,
                    conversationId: doc.conversationId,
                    payload
                  },
                  (err, result) => {
                    if (err) return callback(err);

                    const doc = result.result;
                    finalize(context!, doc.payload, (err, payload) => {
                      if (err) return callback(err);

                      externalCommand(
                        {
                          saslContinue: 1,
                          conversationId: doc.conversationId,
                          payload
                        },
                        (err, result) => {
                          if (err) return callback(err);

                          callback(undefined, result.result);
                        }
                      );
                    });
                  }
                );
              });
            }
          );
        });
      }
    );
  }
}

function initialize(
  context: Omit<GSSAPIContext, 'client'>,
  callback: (err?: Error, context?: GSSAPIContext) => void
): void {
  // Canonicialize host name if needed
  function performGssapiCanonicalizeHostName(
    canonicalizeHostName: boolean,
    host: string,
    callback: Function
  ) {
    if (!canonicalizeHostName) return callback();

    // Attempt to resolve the host name
    dns.resolveCname(host, (err: Error | null, r: string[]) => {
      if (err) return callback(err);

      // Get the first resolve host id
      if (Array.isArray(r) && r.length > 0) {
        context.host = r[0];
      }

      callback();
    });
  }

  // Canonicialize host name if needed
  performGssapiCanonicalizeHostName(context.canonicalizeHostName, context.host, (err: Error) => {
    if (err) return callback(err);

    const initOptions = {};
    if (context.password != null) {
      Object.assign(initOptions, { user: context.username, password: context.password });
    }

    Kerberos.initializeClient(
      `${context.serviceName}${process.platform === 'win32' ? '/' : '@'}${context.host}`,
      initOptions,
      (err: string, client: KerberosClient): void => {
        if (err) return callback(new Error(err));
        const c: GSSAPIContext = Object.assign({ client }, context);
        callback(undefined, c);
      }
    );
  });
}

function negotiate(context: GSSAPIContext, payload: string, callback: Callback<string>) {
  context.client.step(payload, (err, response) => {
    if (err && context.retries === 0) return callback(err);

    // Attempt to re-establish a context
    if (err) {
      // Adjust the number of retries
      context.retries = context.retries - 1;

      // Call same step again
      return negotiate(context, payload, callback);
    }

    // Return the payload
    callback(undefined, response || '');
  });
}

function finalize(context: GSSAPIContext, payload: string, callback: Callback<string>) {
  // GSS Client Unwrap
  context.client.unwrap(payload, (err, response) => {
    if (err) return callback(err);

    // Wrap the response
    context.client.wrap(response || '', { user: context.username }, (err, wrapped) => {
      if (err) return callback(err);

      // Return the payload
      callback(undefined, wrapped);
    });
  });
}
