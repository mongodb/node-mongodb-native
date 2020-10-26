import "mocha";
import type { SinonFakeTimers, SinonSandbox } from "sinon";
import type { MongoClient } from "../src";
import type { withClientCallback } from "./functional/shared";
import NativeConfiguration = require("./tools/runner/config");

type Topologies = 'single' | 'replicaset' | 'sharded' | 'ssl' | 'heap' | 'wiredtiger' | 'auth'

declare global {
  namespace Mocha {
    interface Context {
      configuration: NativeConfiguration;
      defer(arg: (() => any) | PromiseLike<any>): unknown;
      sinon: SinonSandbox,
      clock: SinonFakeTimers
    }

    interface MongoOptions {
      configuration?: NativeConfiguration;
      metadata?: { requires?: {
        generators?: boolean,
        topology?: Topologies | Topologies[],
        mongodb?: string,
        node?: string,
        ignore?: { travis?: boolean }
      } }
      test?: Func | AsyncFunc;
    }

    export interface TestFunction {
      (title: string, mongoOptions?: MongoOptions): Test;
      (title: string, mongoOptions?: MongoOptions, fn?: Func): Test;
      (title: string, mongoOptions?: MongoOptions, fn?: AsyncFunc): Test;
    }

    export interface SuiteFunction {
      (title: string, mongoOptions?: MongoOptions): Suite;
    }

    export interface ExclusiveTestFunction {
      (title: string, mongoOptions?: MongoOptions): Test;
    }

    export interface PendingTestFunction {
      (title: string, mongoOptions?: MongoOptions): Test;
    }

  }
  namespace Chai {
    export interface Assertion {
      matchMongoSpec(value: any): void;
    }
    export interface TypeComparison {
      lengthOf(number: number): void;
    }

    export interface Assertion {
      containSubset(subset: any[]): void;
    }

  }

  export interface withClient {
    (callback: withClientCallback): any;
    (client: String, callback: withClientCallback): any;
    (client: MongoClient, callback: withClientCallback): any;
    (client?: MongoClient | String | withClientCallback, callback?: withClientCallback): any;
  }

}
