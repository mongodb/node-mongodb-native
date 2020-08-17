import { AuthProvider, AuthContext } from './auth_provider';
import type { Callback } from '../../types';
import { MongoError } from '../../error';
import { Kerberos } from '../../deps';

const dns = require('dns');

type TransitionCallback = (err?: Error | null, payload?: any) => void;
type Transition = typeof GSSAPI.prototype.transition;
interface KerberosClient {
  step: (challenge: string, callback?: TransitionCallback) => Promise<string> | void;
  wrap: (
    challenge: string,
    options?: { user: string },
    callback?: TransitionCallback
  ) => Promise<string> | void;
  unwrap: (challenge: string, callback?: TransitionCallback) => Promise<string> | void;
}

export class GSSAPI extends AuthProvider {
  _transition: ((payload: any, callback: TransitionCallback) => void) | null;
  host?: string;
  retries: number;
  username?: string;
  password?: string;
  client?: KerberosClient;
  constructor() {
    super();
    this._transition = firstTransition(this);
    this.retries = 10;
  }
  auth(authContext: AuthContext, callback: Callback): void {
    const self = this;
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

    this.username = credentials.username;
    this.password = credentials.password;
    const mechanismProperties = credentials.mechanismProperties;
    const canonicalizeHostName =
      typeof credentials.mechanismProperties.gssapiCanonicalizeHostName === 'boolean'
        ? credentials.mechanismProperties.gssapiCanonicalizeHostName
        : false;
    const gssapiServiceName =
      mechanismProperties['gssapiservicename'] ||
      mechanismProperties['gssapiServiceName'] ||
      'mongodb';

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
    performGssapiCanonicalizeHostName(canonicalizeHostName, host, (err: Error) => {
      if (err) return callback(err);

      const initOptions = {};
      if (this.password != null) {
        Object.assign(initOptions, { user: this.username, password: this.password });
      }

      const service =
        process.platform === 'win32'
          ? `${gssapiServiceName}/${host}`
          : `${gssapiServiceName}@${host}`;

      Kerberos.initializeClient(
        service,
        initOptions,
        (err: string, client: KerberosClient): void => {
          if (err) return callback(new Error(err));

          self.client = client;
          callback(undefined, client);
        }
      );
    });

    // if (err) return callback(err, false);
    this.transition('', (err, payload) => {
      if (err) return callback(err, false);

      const command = {
        saslStart: 1,
        mechanism: 'GSSAPI',
        payload,
        autoAuthorize: 1
      };

      connection.command('$external.$cmd', command, (err, result) => {
        if (err) return callback(err, false);

        const doc = result.result;
        this.transition(doc.payload, (err, payload) => {
          if (err) return callback(err, false);
          const command = {
            saslContinue: 1,
            conversationId: doc.conversationId,
            payload
          };

          connection.command('$external.$cmd', command, (err, result) => {
            if (err) return callback(err, false);

            const doc = result.result;
            this.transition(doc.payload, (err, payload) => {
              if (err) return callback(err, false);
              const command = {
                saslContinue: 1,
                conversationId: doc.conversationId,
                payload
              };

              connection.command('$external.$cmd', command, (err, result) => {
                if (err) return callback(err, false);

                const response = result.result;
                this.transition(null, err => {
                  if (err) return callback(err);
                  callback(undefined, response);
                });
              });
            });
          });
        });
      });
    });
  }
  transition(payload: any, callback: TransitionCallback) {
    if (this._transition == null) {
      return callback(new Error('Transition finished'));
    }

    this._transition(payload, callback);
  }
}

function firstTransition(auth: GSSAPI): Transition {
  return (payload, callback) => {
    auth.client!.step('', (err, response) => {
      if (err) return callback(err);

      // Set up the next step
      auth._transition = secondTransition(auth);

      // Return the payload
      callback(null, response);
    });
  };
}

function secondTransition(auth: GSSAPI): Transition {
  return (payload, callback) => {
    auth.client!.step(payload, (err, response) => {
      if (err && auth.retries === 0) return callback(err);

      // Attempt to re-establish a context
      if (err) {
        // Adjust the number of retries
        auth.retries = auth.retries - 1;

        // Call same step again
        return auth.transition(payload, callback);
      }

      // Set up the next step
      auth._transition = thirdTransition(auth);

      // Return the payload
      callback(null, response || '');
    });
  };
}

function thirdTransition(auth: GSSAPI): Transition {
  return (payload, callback) => {
    // GSS Client Unwrap
    auth.client!.unwrap(payload, (err, response) => {
      if (err) return callback(err, false);

      // Wrap the response
      auth.client!.wrap(response, { user: auth.username! }, (err, wrapped) => {
        if (err) return callback(err, false);

        // Set up the next step
        auth._transition = fourthTransition(auth);

        // Return the payload
        callback(null, wrapped);
      });
    });
  };
}

function fourthTransition(auth: GSSAPI): Transition {
  return (payload, callback) => {
    // Set the transition to null
    auth._transition = null;

    // Callback with valid authentication
    callback(null, true);
  };
}
