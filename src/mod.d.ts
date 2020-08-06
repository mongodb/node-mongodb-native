import type { Callback } from './types';

/** Declaration Merging block for MongoDB specific functionality in Kerberos */
declare module 'kerberos' {
  export const processes: {
    MongoAuthProcess: {
      new (host: string, port: number, serviceName: string, options: unknown): {
        host: string;
        port: number;
        serviceName: string;
        canonicalizeHostName: boolean;
        retries: number;

        init: (username: string, password: string, callback: Callback) => void;
        transition: (payload: unknown, callback: Callback) => void;
      };
    };
  };
}
