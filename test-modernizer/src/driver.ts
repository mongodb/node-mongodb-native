/* eslint-disable no-console */
import assert from 'assert';
import { Writable } from 'stream';
import * as ts from 'typescript';
import * as util from 'util';

import { annotate, explore, find, nodeExists } from './utils';

export type MochaNode = MochaTestHook | MochaTestFunction | MochaTestGroup;

export type MochaTestHook = ts.Node & {
  expression: ts.Identifier;
  mochaType: 'before' | 'after' | 'beforeEach' | 'afterEach';
};

export type MochaTestFunction = ts.CallExpression & {
  expression: ts.Identifier;
  mochaType: 'it' | 'test';
};

export type MochaTestGroup = ts.Node & {
  expression: ts.Identifier;
  mochaType: 'describe' | 'context';
};

/**
 *
 * @param node a TS AST Node
 * @returns true if the Node represents a mocha test function Node, false otherwise.
 */
export function isMochaNode(node: ts.Node): node is MochaNode {
  return [isMochaGroup, isMochaHook, isMochaTest].some(f => f(node));
}

export function isMochaTest(node: ts.Node): node is MochaTestFunction {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    const name = (node.expression.escapedText as string) ?? '';
    const isTestNode = ['it', 'test'].includes(name.toLowerCase());
    if (isTestNode) {
      (node as unknown as MochaNode).mochaType = name as any;
    }
    return isTestNode;
  }
  return false;
}

export class StringStream extends Writable {
  private buffer: Array<string> = [];

  write(chunk: any, callback?: (error: Error) => void): boolean;
  write(chunk: any, encoding: BufferEncoding, callback?: (error: Error) => void): boolean;
  write(chunk: unknown, _?: unknown, __?: unknown): boolean {
    this.buffer.push(String(chunk));
    return true;
  }

  output(): string {
    return this.buffer.join('');
  }
}

export class MochaTest {
  get testFunction(): ts.FunctionExpression {
    const testFunction = this.node.arguments.at(-1);
    if (!ts.isFunctionExpression(testFunction))
      throw new Error('expected function expression - received ' + this.node.KIND);
    return testFunction;
  }
  get isCallbackTest(): boolean {
    const doneParameter = this.testFunction.parameters.at(0);

    return Boolean(doneParameter);
  }

  get testBody(): ts.Block {
    return this.testFunction.body;
  }

  constructor(public node: MochaTestFunction) {
    if (!isMochaTest(this.node))
      throw new Error(
        'cannot construct a mocha test with a node that is not a mocha test function.'
      );

    annotate(this.node);
  }

  [util.inspect.custom](): string {
    const sink = new StringStream();
    explore(this.node, sink);
    return sink.output();
  }
}

export class DriverAPINode {
  usesCallback: boolean;
  callback: ts.ArrowFunction | ts.FunctionExpression | null;
  constructor(protected node: DriverAPI) {
    if (!isDriverAPI(this.node)) {
      throw new Error('Driver API cannot be constructed with a non-driver API node.');
    }

    annotate(this.node);

    const potentialCallback = this.node.arguments.at(-1);
    this.callback =
      ts.isArrowFunction(potentialCallback) || ts.isFunctionExpression(potentialCallback)
        ? potentialCallback
        : null;
    this.usesCallback = Boolean(this.callback);
  }

  [util.inspect.custom](): string {
    const sink = new StringStream();
    explore(this.node, sink);
    return sink.output();
  }
}

export function convertStatement(statement: ts.Statement, output: ts.Statement[]) {
  let driverAPINode: DriverAPI | null = null;
  function findNode(node: ts.Node) {
    if (isDriverAPI(node)) {
      driverAPINode = node;
      return;
    }
    node.forEachChild(findNode);
  }

  findNode(statement);
  if (!driverAPINode) {
    output.push(statement);
    return;
  }
  try {
    const driverAPICallbackNode = new DriverAPICallbackNode(driverAPINode as any);
    driverAPICallbackNode.convert(output);
  } catch (e) {
    console.error(e.message);
    output.push(statement);
  }
}

export function convertTest(node: MochaTest) {
  if (!node.isCallbackTest) {
    // The test does not use a `done` callback - there's nothing for us to do here.
    return node;
  }

  // we have a mocha tests with a done callback

  if (!nodeExists(node.node, node => isDriverAPI(node))) {
    return node;
  }

  const testBody = node.testBody;
  const statements: ts.Statement[] = [];
  for (const statement of testBody.statements) {
    convertStatement(statement, statements);
  }

  const doneFunction = node.testFunction.parameters.at(-1)?.name;
  assert(ts.isIdentifier(doneFunction));
  // @ts-expect-error accessing readonly property
  // remove the `done` parameter from the function.
  node.testFunction.parameters = node.testFunction.parameters.slice(
    0,
    node.testFunction.parameters.length - 1
  );

  // filter out any statements that call the "done" callback
  const finalStatements = statements.filter(statement => {
    return !(
      ts.isExpressionStatement(statement) &&
      ts.isCallExpression(statement.expression) &&
      ts.isIdentifier(statement.expression.expression) &&
      statement.expression.expression.escapedText === doneFunction.escapedText
    );
  });

  // @ts-expect-error accessing readonly property
  // mark the function async
  node.testFunction.modifiers = (node.testFunction.modifiers ?? []).concat([
    ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)
  ]);

  // @ts-expect-error accessing readonly property
  // set the body of the function to the converted statements.
  testBody.statements = finalStatements;
  return node;
}

export function convert(sourceFile: ts.SourceFile) {
  if (!nodeExists(sourceFile, node => isMochaGroup(node))) {
    console.log('nothing to do - not a mocha test file.');
    return;
  }

  if (!nodeExists(sourceFile, node => isMochaTest(node))) {
    console.log('nothing to do - no tests in file.');
    return;
  }

  const tests = find(sourceFile, node => isMochaTest(node));
  for (const test of tests) {
    convertTest(new MochaTest(test as MochaTestFunction));
  }
}

export class DriverAPICallbackNode extends DriverAPINode {
  readonly errorParameter: ts.Identifier | null = null;
  readonly resultParameter: ts.Identifier | null = null;
  readonly callbackBody: ts.Block;

  get parameterLength(): number {
    return [this.errorParameter, this.resultParameter].filter(item => item != null).length;
  }

  constructor(node: DriverAPI) {
    super(node);

    assert(
      this.callback != null && this.usesCallback,
      'DriverAPICallbackNode can only be constructed with a callback.'
    );

    const [errorParameter, resultParameter] = this.callback.parameters;
    if (errorParameter) {
      const identifier = errorParameter.name;
      assert(
        ts.isIdentifier(identifier),
        'encountered callback with an error parameter that uses destructing'
      );
      this.errorParameter = identifier;
    }

    if (resultParameter) {
      const identifier = resultParameter.name;
      assert(
        ts.isIdentifier(identifier),
        'encountered callback with an result parameter that uses destructing'
      );
      this.resultParameter = identifier;
    }

    this.callbackBody = ts.isExpression(this.callback.body)
      ? ts.factory.createBlock([ts.factory.createExpressionStatement(this.callback.body)])
      : this.callback.body;
  }

  convert(output: ts.Statement[]): void {
    // first, we convert all the function body's statements.
    const body: ts.Statement[] = [];
    for (const statement of this.callbackBody.statements) {
      convertStatement(statement, body);
    }
    // remove the callback function from the list of arguments.
    // @ts-expect-error - assigning to a readonly property
    this.node.arguments = this.node.arguments.slice(0, this.node.arguments.length - 1);

    const awaitExpression = ts.factory.createAwaitExpression(this.node);
    const awaitStatement = ts.factory.createExpressionStatement(awaitExpression);
    if (this.parameterLength === 0) {
      output.push(awaitStatement);
    } else if (this.parameterLength === 1) {
      const error = this.errorParameter;
      const statements: ts.Statement[] = [];
      statements.push(
        ts.factory.createVariableStatement(undefined, [ts.factory.createVariableDeclaration(error)])
      );
      const try_block = ts.factory.createTryStatement(
        ts.factory.createBlock([awaitStatement]),
        ts.factory.createCatchClause(
          '_error_unique',
          ts.factory.createBlock([
            ts.factory.createExpressionStatement(
              ts.factory.createAssignment(error, ts.factory.createIdentifier('_error_unique'))
            )
          ])
        ),
        undefined
      );
      statements.push(try_block);
      output.push(...statements);
    } else {
      const statements: ts.Statement[] = [];
      statements.push(
        ts.factory.createVariableStatement(undefined, [
          ts.factory.createVariableDeclaration(this.errorParameter)
        ])
      );

      statements.push(
        ts.factory.createVariableStatement(undefined, [
          ts.factory.createVariableDeclaration(this.resultParameter)
        ])
      );
      const try_block = ts.factory.createTryStatement(
        ts.factory.createBlock([
          ts.factory.createExpressionStatement(
            ts.factory.createAssignment(this.resultParameter, awaitExpression)
          )
        ]),
        ts.factory.createCatchClause(
          '_error_unique',
          ts.factory.createBlock([
            ts.factory.createExpressionStatement(
              ts.factory.createAssignment(
                this.errorParameter,
                ts.factory.createIdentifier('_error_unique')
              )
            )
          ])
        ),
        undefined
      );
      statements.push(try_block);
      output.push(...statements);
    }
    output.push(...body);
  }
}

export function isMochaHook(node: ts.Node): node is MochaTestFunction {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    const name = (node.expression.escapedText as string) ?? '';
    const isTestNode = ['before', 'after', 'beforeeach', 'aftereach'].includes(name.toLowerCase());
    if (isTestNode) {
      (node as unknown as MochaNode).mochaType = name as any;
    }
    return isTestNode;
  }
  return false;
}

export function isMochaGroup(node: ts.Node): node is MochaTestGroup {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    const name = (node.expression.escapedText as string) ?? '';
    const isTestNode = ['describe', 'context'].includes(name.toLowerCase());
    if (isTestNode) {
      (node as unknown as MochaNode).mochaType = name as any;
    }
    return isTestNode;
  }
  return false;
}

/** A driver method call in the form of <driver object>.<driver method>(...) */
export type DriverAPI = ts.CallExpression & {
  expression: ts.PropertyAccessExpression & {
    name: ts.Identifier;
  };
  function: (typeof DriverAPIs)[number];
};

export function isDriverAPI(node: ts.Node): node is DriverAPI {
  const isDriverAPI =
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.name) &&
    DriverAPIs.includes((node.expression.name.escapedText ?? '') as any);

  return isDriverAPI;
}

export const DriverAPIs = [
  'command',
  'buildInfo',
  'serverInfo',
  'serverStatus',
  'ping',
  'removeUser',
  'validateCollection',
  'listDatabases',
  'replSetGetStatus',
  'execute',
  'hasNext',
  'next',
  'tryNext',
  'close',
  'init',
  'teardown',
  'encrypt',
  'decrypt',
  'askForKMSCredentials',
  'createDataKey',
  'rewrapManyDataKey',
  'deleteKey',
  'getKey',
  'getKeyByAltName',
  'addKeyAltName',
  'removeKeyAltName',
  'createEncryptedCollection',
  'encryptExpression',
  'spawn',
  'withRespawn',
  'getToken',
  'kmsRequest',
  'setTlsOptions',
  'fetchCollectionInfo',
  'markCommand',
  'prepare',
  'reauth',
  'getCredentials',
  'auth',
  'speculativeAuth',
  'toBin',
  'checkOut',
  'reauthenticate',
  'insertOne',
  'insert',
  'insertMany',
  'bulkWrite',
  'updateOne',
  'replaceOne',
  'updateMany',
  'deleteOne',
  'deleteMany',
  'rename',
  'drop',
  'findOne',
  'options',
  'isCapped',
  'createIndex',
  'createIndexes',
  'dropIndex',
  'dropIndexes',
  'indexExists',
  'indexInformation',
  'estimatedDocumentCount',
  'countDocuments',
  'distinct',
  'indexes',
  'findOneAndDelete',
  'findOneAndReplace',
  'findOneAndUpdate',
  'count',
  'createSearchIndex',
  'createSearchIndexes',
  'dropSearchIndex',
  'updateSearchIndex',
  'forEach',
  'toArray',
  'getMore',
  '_initialize',
  'explain',
  'createCollection',
  'stats',
  'renameCollection',
  'dropCollection',
  'dropDatabase',
  'collections',
  'setProfilingLevel',
  'profilingLevel',
  'connectInternalClient',
  'abort',
  'delete',
  'connect',
  'withSession',
  'executeCommand',
  '_poll',
  'selectServer',
  'endSession',
  'commitTransaction',
  'abortTransaction',
  'withTransaction'
] as const;
