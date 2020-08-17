const dns = require('dns');
import { Kerberos } from '../../deps';

type TransitionCallback = (err?: Error | null, payload?: any) => void;
type Transition = typeof MongoAuthProcess.prototype.transition;

interface KerberosClient {
  step: (challenge: string, callback?: TransitionCallback) => Promise<string> | string;
  wrap: (
    challenge: string,
    options?: { user: string },
    callback?: TransitionCallback
  ) => Promise<string> | string;
  unwrap: (challenge: string, callback?: TransitionCallback) => Promise<string> | string;
}

interface gssapiOptions {
  gssapiServiceName?: string;
  gssapiCanonicalizeHostName?: boolean;
}

export class MongoAuthProcess {
  host: string;
  port: string | number;
  serviceName: string;
  canonicalizeHostName: boolean;
  retries: number;
  _transition: ((payload: any, callback: TransitionCallback) => void) | null;
  username?: string;
  password?: string;
  client?: KerberosClient;

  constructor(host: string, port: string | number, serviceName?: string, options?: gssapiOptions) {
    options = options || {};
    this.host = host;
    this.port = port;

    // Set up service name
    this.serviceName = serviceName || options.gssapiServiceName || 'mongodb';

    // Options
    this.canonicalizeHostName =
      typeof options.gssapiCanonicalizeHostName === 'boolean'
        ? options.gssapiCanonicalizeHostName
        : false;

    // Set up first transition
    this._transition = firstTransition(this);

    // Number of retries
    this.retries = 10;
  }

  init(
    username: string,
    password: string,
    callback: (err?: Error | null, client?: KerberosClient | null) => void
  ) {
    const self = this;
    this.username = username;
    this.password = password;

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
    performGssapiCanonicalizeHostName(this.canonicalizeHostName, this.host, (err: Error) => {
      if (err) return callback(err);

      const initOptions = {};
      if (password != null) {
        Object.assign(initOptions, { user: username, password });
      }

      const service =
        process.platform === 'win32'
          ? `${this.serviceName}/${this.host}`
          : `${this.serviceName}@${this.host}`;

      Kerberos.initializeClient(
        service,
        initOptions,
        (err: string, client: KerberosClient): void => {
          if (err) return callback(new Error(err), null);

          self.client = client;
          callback(null, client);
        }
      );
    });
  }

  transition(payload: any, callback: TransitionCallback) {
    if (this._transition == null) {
      return callback(new Error('Transition finished'));
    }

    this._transition(payload, callback);
  }
}

function firstTransition(auth: MongoAuthProcess): Transition {
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

function secondTransition(auth: MongoAuthProcess): Transition {
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

function thirdTransition(auth: MongoAuthProcess): Transition {
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

function fourthTransition(auth: MongoAuthProcess): Transition {
  return (payload, callback) => {
    // Set the transition to null
    auth._transition = null;

    // Callback with valid authentication
    callback(null, true);
  };
}
