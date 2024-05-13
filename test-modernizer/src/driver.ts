import * as ts from 'typescript';

export type MochaNode = MochaTestHook | MochaTestFunction | MochaTestGroup;

export type MochaTestHook = ts.Node & {
  expression: ts.Identifier;
  mochaType: 'before' | 'after' | 'beforeEach' | 'afterEach';
};

export type MochaTestFunction = ts.Node & {
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
