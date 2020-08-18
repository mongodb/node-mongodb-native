import { AuthProvider, AuthContext } from './auth_provider';
import type { Callback } from '../../types';
import { MongoError } from '../../error';
import { Kerberos } from '../../deps';

const dns = require('dns');

type TransitionCallback = (err?: Error | null, payload?: any) => void;
interface KerberosClient {
  step: (challenge: string, callback?: TransitionCallback) => Promise<string> | void;
  wrap: (
    challenge: string,
    options?: { user: string },
    callback?: TransitionCallback
  ) => Promise<string> | void;
  unwrap: (challenge: string, callback?: TransitionCallback) => Promise<string> | void;
}
interface GSSAPIContext {
  host: string;
  port: string | number;
  serviceName: string;
  canonicalizeHostName: boolean;
  retries: number;
  username?: string;
  password?: string;
  client?: KerberosClient;
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

    const context: GSSAPIContext = {
      retries: 10,
      host,
      port,
      serviceName: gssapiServiceName,
      canonicalizeHostName:
        typeof mechanismProperties.gssapiCanonicalizeHostName === 'boolean'
          ? mechanismProperties.gssapiCanonicalizeHostName
          : false
    };

    function externalCommand(
      command: object,
      cb: (
        err: Error | MongoError | undefined,
        result: { result: { payload: string; conversationId: any } }
      ) => void
    ) {
      return connection.command('$external.$cmd', command, cb);
    }

    initialize(context, username, password, err => {
      if (err) return callback(err, false);
      context.client!.step('', (err, payload) => {
        if (err) return callback(err, false);

        const command = {
          saslStart: 1,
          mechanism: 'GSSAPI',
          payload,
          autoAuthorize: 1
        };

        externalCommand(command, (err, result) => {
          if (err) return callback(err, false);

          const doc = result.result;
          negotiate(context, doc.payload, (err, payload) => {
            if (err) return callback(err, false);
            externalCommand(
              {
                saslContinue: 1,
                conversationId: doc.conversationId,
                payload
              },
              (err, result) => {
                if (err) return callback(err, false);

                const doc = result.result;
                finalize(context, doc.payload, (err, payload) => {
                  if (err) return callback(err, false);
                  externalCommand(
                    {
                      saslContinue: 1,
                      conversationId: doc.conversationId,
                      payload
                    },
                    (err, result) => {
                      if (err) return callback(err, false);
                      callback(undefined, result.result);
                    }
                  );
                });
              }
            );
          });
        });
      });
    });
  }
}

function initialize(
  context: GSSAPIContext,
  username: string,
  password: string,
  callback: (err?: Error | null, client?: KerberosClient | null) => void
) {
  context.username = username;
  context.password = password;

  // Canonicialize host name if needed
  function performGssapiCanonicalizeHostName(
    canonicalizeHostName: boolean,
    host: string,
    callback: Function
  ) {
    if (!canonicalizeHostName) return callback();

    // Attempt to resolve the host name
    dns.resolveCname(host, (err: Error, r: any) => {
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
    if (password != null) {
      Object.assign(initOptions, { user: username, password });
    }

    Kerberos.initializeClient(
      `${context.serviceName}${process.platform === 'win32' ? '/' : '@'}${context.host}`,
      initOptions,
      (err: string, client: KerberosClient): void => {
        if (err) return callback(new Error(err), null);

        context.client = client;
        callback(null, client);
      }
    );
  });
}

function negotiate(context: GSSAPIContext, payload: string, callback: TransitionCallback) {
  context.client!.step(payload, (err, response) => {
    if (err && context.retries === 0) return callback(err);

    // Attempt to re-establish a context
    if (err) {
      // Adjust the number of retries
      context.retries = context.retries - 1;

      // Call same step again
      return negotiate(context, payload, callback);
    }

    // Return the payload
    callback(null, response || '');
  });
}

function finalize(context: GSSAPIContext, payload: string, callback: TransitionCallback) {
  // GSS Client Unwrap
  context.client!.unwrap(payload, (err, response) => {
    if (err) return callback(err, false);

    // Wrap the response
    context.client!.wrap(response, { user: context.username! }, (err, wrapped) => {
      if (err) return callback(err, false);

      // Return the payload
      callback(null, wrapped);
    });
  });
}
