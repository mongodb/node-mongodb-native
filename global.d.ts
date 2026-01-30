import { type OneOrMore } from './src/mongo_types';
import type { TestConfiguration } from './test/tools/runner/config';

declare global {
  interface MongoDBMetadataUI {
    requires?: {
      topology?: TopologyTypeRequirement;
      mongodb?: string;
      os?: NodeJS.Platform | `!${NodeJS.Platform}`;
      apiVersion?: '1' | boolean;

      /**
       * require FLE to be set up to run the test
       *
       * A semver range may be provided as well to enforce a particular version range
       * of mongodb-client-encryption.  Ex: `clientSideEncryption: '>=6.0.1'`
       */
      clientSideEncryption?: string | true;
      auth?: 'enabled' | 'disabled';
      idmsMockServer?: true;
      nodejs?: string;
      predicate?: (test?: Mocha.Test) => true | string;
      crypt_shared?: 'enabled' | 'disabled';
      libmongocrypt?: string;

      tls?: 'enabled' | 'disabled';
    };

    sessions?: {
      skipLeakTests?: boolean;
    };
  }

  type WithExclusion<T extends string> = `!${T}`;
  /** Defined in test/tools/runner/filters/mongodb_topology_filter.js (topologyTypeToString) */
  type TopologyTypes = 'single' | 'replicaset' | 'sharded' | 'load-balanced';
  type TopologyTypeRequirement = OneOrMore<TopologyTypes> | OneOrMore<WithExclusion<TopologyTypes>>;

  interface MetadataAndTest<Fn> {
    metadata: MongoDBMetadataUI;
    test: Fn;
  }

  namespace Chai {
    interface Assertion {
      /** @deprecated Used only by the legacy spec runner, the unified runner implements the unified spec expectations */
      matchMongoSpec: (anything: any) => Chai.Assertion;
    }
  }

  namespace Mocha {
    interface SuiteFunction {
      (title: string, metadata: MongoDBMetadataUI, fn: (this: Suite) => void): Mocha.Suite;
    }

    interface PendingSuiteFunction {
      (title: string, metadata: MongoDBMetadataUI, fn: (this: Suite) => void): Mocha.Suite;
    }

    interface ExclusiveSuiteFunction {
      (title: string, metadata: MongoDBMetadataUI, fn: Mocha.Func): Mocha.Test;
      (title: string, metadata: MongoDBMetadataUI, fn: Mocha.AsyncFunc): Mocha.Test;
      (title: string, metadataAndTest: MetadataAndTest<Mocha.Func>): Mocha.Test;
      (title: string, metadataAndTest: MetadataAndTest<Mocha.AsyncFunc>): Mocha.Test;
    }

    interface ExclusiveTestFunction {
      (title: string, metadata: MongoDBMetadataUI, fn: Mocha.Func): Mocha.Test;
      (title: string, metadata: MongoDBMetadataUI, fn: Mocha.AsyncFunc): Mocha.Test;
      (title: string, metadataAndTest: MetadataAndTest<Mocha.Func>): Mocha.Test;
      (title: string, metadataAndTest: MetadataAndTest<Mocha.AsyncFunc>): Mocha.Test;
    }

    interface TestFunction {
      (title: string, metadata: MongoDBMetadataUI, fn: Mocha.Func): Mocha.Test;
      (title: string, metadata: MongoDBMetadataUI, fn: Mocha.AsyncFunc): Mocha.Test;
      (title: string, metadataAndTest: MetadataAndTest<Mocha.Func>): Mocha.Test;
      (title: string, metadataAndTest: MetadataAndTest<Mocha.AsyncFunc>): Mocha.Test;
    }

    interface PendingTestFunction {
      (title: string, metadata: MongoDBMetadataUI, fn: Mocha.Func): Mocha.Test;
      (title: string, metadata: MongoDBMetadataUI, fn: Mocha.AsyncFunc): Mocha.Test;
      (title: string, metadataAndTest: MetadataAndTest<Mocha.Func>): Mocha.Test;
      (title: string, metadataAndTest: MetadataAndTest<Mocha.AsyncFunc>): Mocha.Test;
    }

    interface Context {
      configuration: TestConfiguration;
      /** @deprecated Please use afterEach hooks instead */
      defer(fn: () => Promise<unknown>): void;
    }

    interface Test {
      metadata: MongoDBMetadataUI;

      spec: Record<string, any>;
    }

    interface Runnable {
      /**
       * An optional string the test author can attach to print out why a test is skipped
       *
       * @example
       * ```ts
       * it.skip('my test', () => {
       *   //...
       * }).skipReason = 'TODO(NODE-XXXX): Feature implementation impending!';
       * ```
       *
       * The reporter (`test/tools/reporter/mongodb_reporter.js`) will print out the skipReason
       * indented directly below the test name.
       * ```txt
       * - my test
       *   - TODO(NODE-XXXX): Feature implementation impending!
       * ```
       *
       * You can also skip a set of tests via beforeEach:
       * ```ts
       * beforeEach(() => {
       *   if ('some condition') {
       *     this.currentTest.skipReason = 'requires <run condition> to run';
       *     this.skip();
       *   }
       * });
       * ```
       */
      skipReason?: string;
    }
  }
}
