import M = require("mocha")
import S = require("sinon");
import type { MongoClient } from "../src";
import NativeConfiguration = require("./tools/runner/config");

type Topologies = 'single' | 'replicaset' | 'sharded' | 'ssl' | 'heap' | 'wiredtiger' | 'auth'

declare global {

  namespace Mocha {

    /**
     * NOTE: Sometimes TS complains:
     * "Type 'Context' recursively references itself as a base type."
     * But the issues intermitently go away, and things still do work correctly
     * ts-ignore gets rid of these issues
     */

    /** @ts-ignore */
    export interface Context extends M.Context {
      configuration: NativeConfiguration;
      defer(arg: (() => any) | PromiseLike<any>): unknown;
      sinon: S.SinonSandbox,
      clock: S.SinonFakeTimers
    }

    /**
     * TypeScript currently can't handle this funciton unions correctly
     * @see https://github.com/microsoft/TypeScript/issues/41213
     * `this` context is not set for functions without `done` argument
     */
    type OptionsTest =
      | ((this: Context) => void)
      | ((this: Context) => PromiseLike<any>)
      | ((this: Context, done: Done) => void)

    export interface MongoOptions {
      metadata?: { requires?: {
        generators?: boolean,
        topology?: Topologies | Topologies[],
        mongodb?: string,
        node?: string,
        ignore?: { travis?: boolean }
      } }
      test?: OptionsTest
    }
    /** @ts-ignore */
    export interface SuiteFunction extends M.SuiteFunction {
      (title: string, mongoOptions?: MongoOptions): M.Suite;
    }
    /** @ts-ignore */
    export interface TestFunction extends M.TestFunction {
      (title: string, mongoOptions?: MongoOptions): M.Test;
      (title: string, mongoOptions?: MongoOptions, fn?: Func): M.Test;
      (title: string, mongoOptions?: MongoOptions, fn?: AsyncFunc): M.Test;
    }
    /** @ts-ignore */
    export interface ExclusiveTestFunction extends M.ExclusiveTestFunction {
      (title: string, mongoOptions?: MongoOptions): M.Test;
    }
    /** @ts-ignore */
    export interface PendingTestFunction extends M.PendingTestFunction {
      (title: string, mongoOptions?: MongoOptions): M.Test;
    }

  }

  type withClientCallback = (this: Mocha.Context, client: MongoClient) => PromiseLike<any>


  /**
   * NOTE: hard to match return type to mocha M.AsyncFunc because (executes lambda | returns lambda)
   */
  export interface withClient {
    (callback: withClientCallback);
    (client: String, callback: withClientCallback);
    (client: MongoClient, callback: withClientCallback);
    (client?: MongoClient | String | withClientCallback, callback?: withClientCallback);
  }

  namespace Chai {
    export interface Assertion {
      matchMongoSpec(value: any): void;
    }
  }

}
