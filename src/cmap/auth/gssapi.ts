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
interface KerberosAuthContext {
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

    const authProcess: KerberosAuthContext = {
      retries: 10,
      host,
      port,
      serviceName: gssapiServiceName,
      canonicalizeHostName:
        typeof mechanismProperties.gssapiCanonicalizeHostName === 'boolean'
          ? mechanismProperties.gssapiCanonicalizeHostName
          : false
    };

    const externalCommand = (
      command: object,
      cb: (
        err: Error | MongoError | undefined,
        result: { result: { payload: string; conversationId: any } }
      ) => void
    ) => connection.command('$external.$cmd', command, cb);

    stepOne(authProcess, username, password, err => {
      if (err) return callback(err, false);
      authProcess.client!.step('', (err, payload) => {
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
          stepTwo(authProcess, doc.payload, (err, payload) => {
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
                stepThree(authProcess, doc.payload, (err, payload) => {
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

function stepOne(
  self: KerberosAuthContext,
  username: string,
  password: string,
  callback: (err?: Error | null, client?: KerberosClient | null) => void
) {
  self.username = username;
  self.password = password;

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
        self.host = r[0];
      }

      callback();
    });
  }

  // Canonicialize host name if needed
  performGssapiCanonicalizeHostName(self.canonicalizeHostName, self.host, (err: Error) => {
    if (err) return callback(err);

    const initOptions = {};
    if (password != null) {
      Object.assign(initOptions, { user: username, password });
    }

    const service =
      process.platform === 'win32'
        ? `${self.serviceName}/${self.host}`
        : `${self.serviceName}@${self.host}`;

    Kerberos.initializeClient(service, initOptions, (err: string, client: KerberosClient): void => {
      if (err) return callback(new Error(err), null);

      self.client = client;
      callback(null, client);
    });
  });
}

function stepTwo(auth: KerberosAuthContext, payload: string, callback: TransitionCallback) {
  auth.client!.step(payload, (err, response) => {
    if (err && auth.retries === 0) return callback(err);

    // Attempt to re-establish a context
    if (err) {
      // Adjust the number of retries
      auth.retries = auth.retries - 1;

      // Call same step again
      return stepTwo(auth, payload, callback);
    }

    // Return the payload
    callback(null, response || '');
  });
}

function stepThree(auth: KerberosAuthContext, payload: string, callback: TransitionCallback) {
  // GSS Client Unwrap
  auth.client!.unwrap(payload, (err, response) => {
    if (err) return callback(err, false);

    // Wrap the response
    auth.client!.wrap(response, { user: auth.username! }, (err, wrapped) => {
      if (err) return callback(err, false);

      // Return the payload
      callback(null, wrapped);
    });
  });
}
