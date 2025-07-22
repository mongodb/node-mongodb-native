import { runUnifiedSuite } from './unified-spec-runner/runner';
import {
  type CollectionData,
  type EntityDescription,
  type ExpectedEventsForClient,
  type OperationDescription,
  type RunOnRequirement,
  type Test,
  type UnifiedSuite
} from './unified-spec-runner/schema';

export class TestBuilder {
  private _description: string;
  private runOnRequirements: RunOnRequirement[] = [];
  private _skipReason?: string;
  private _operations: OperationDescription[] = [];
  private _expectEvents?: ExpectedEventsForClient[] = [];
  private _outcome?: CollectionData[] = [];

  static it(title: string) {
    return new TestBuilder(title);
  }

  constructor(description: string) {
    this._description = description;
  }

  operation(operation: OperationDescription): this {
    this._operations.push({
      object: 'collection0',
      arguments: {},
      ...operation
    });
    return this;
  }

  runOnRequirement(requirement: RunOnRequirement): this {
    this.runOnRequirements.push(requirement);
    return this;
  }

  expectEvents(event: ExpectedEventsForClient): this {
    this._expectEvents.push(event);
    return this;
  }

  toJSON(): Test {
    const test: Test = {
      description: this._description,
      runOnRequirements: this.runOnRequirements,
      operations: this._operations,
      expectEvents: this._expectEvents,
      outcome: this._outcome
    };

    if (this._skipReason != null) {
      test.skipReason = this._skipReason;
    }

    return test;
  }
}

export class UnifiedTestSuiteBuilder {
  private _description = 'Default Description';
  private _schemaVersion = '1.0';
  private _createEntities: EntityDescription[];
  private _runOnRequirement: RunOnRequirement[] = [];
  private _initialData: CollectionData[] = [];
  private _tests: Test[] = [];

  static describe(title: string) {
    return new UnifiedTestSuiteBuilder(title);
  }

  /**
   * Establish common defaults
   * - id and name = client0, listens for commandStartedEvent
   * - id and name = database0
   * - id and name = collection0
   */
  static get defaultEntities(): EntityDescription[] {
    return [
      {
        client: {
          id: 'client0',
          useMultipleMongoses: true,
          observeEvents: ['commandStartedEvent']
        }
      },
      {
        database: {
          id: 'database0',
          client: 'client0',
          databaseName: 'database0'
        }
      },
      {
        collection: {
          id: 'collection0',
          database: 'database0',
          collectionName: 'collection0'
        }
      }
    ];
  }

  constructor(description: string) {
    this._description = description;
    this._createEntities = [];
  }

  description(description: string): this {
    this._description = description;
    return this;
  }

  test(test: Test): this;
  test(test: Test[]): this;
  test(test: Test | Test[]): this {
    if (Array.isArray(test)) {
      this._tests.push(...test);
    } else {
      this._tests.push(test);
    }
    return this;
  }

  createEntities(entity: EntityDescription): this;
  createEntities(entity: EntityDescription[]): this;
  createEntities(entity: EntityDescription | EntityDescription[]): this {
    if (Array.isArray(entity)) {
      this._createEntities.push(...entity);
    } else {
      this._createEntities.push(entity);
    }
    return this;
  }

  initialData(data: CollectionData): this;
  initialData(data: CollectionData[]): this;
  initialData(data: CollectionData | CollectionData[]): this {
    if (Array.isArray(data)) {
      this._initialData.push(...data);
    } else {
      this._initialData.push(data);
    }
    return this;
  }

  runOnRequirement(requirement: RunOnRequirement): this;
  runOnRequirement(requirement: RunOnRequirement[]): this;
  runOnRequirement(requirement: RunOnRequirement | RunOnRequirement[]): this {
    Array.isArray(requirement)
      ? this._runOnRequirement.push(...requirement)
      : this._runOnRequirement.push(requirement);
    return this;
  }

  schemaVersion(version: string): this {
    this._schemaVersion = version;
    return this;
  }

  toJSON(): UnifiedSuite {
    return {
      description: this._description,
      schemaVersion: this._schemaVersion,
      runOnRequirements: this._runOnRequirement,
      createEntities: this._createEntities,
      initialData: this._initialData,
      tests: this._tests
    };
  }

  run(): void {
    return runUnifiedSuite([this.toJSON()]);
  }

  toMocha() {
    return describe(this._description, () => runUnifiedSuite([this.toJSON()]));
  }

  clone(): UnifiedSuite {
    return JSON.parse(JSON.stringify(this));
  }
}
