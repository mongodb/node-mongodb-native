"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DriverAPIs = exports.isDriverAPI = exports.isMochaGroup = exports.isMochaHook = exports.isMochaTest = exports.isMochaNode = void 0;
var ts = require("typescript");
/**
 *
 * @param node a TS AST Node
 * @returns true if the Node represents a mocha test function Node, false otherwise.
 */
function isMochaNode(node) {
    return [isMochaGroup, isMochaHook, isMochaTest].some(function (f) { return f(node); });
}
exports.isMochaNode = isMochaNode;
function isMochaTest(node) {
    var _a;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        var name_1 = (_a = node.expression.escapedText) !== null && _a !== void 0 ? _a : '';
        var isTestNode = ['it', 'test'].includes(name_1.toLowerCase());
        if (isTestNode) {
            node.mochaType = name_1;
        }
        return isTestNode;
    }
    return false;
}
exports.isMochaTest = isMochaTest;
function isMochaHook(node) {
    var _a;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        var name_2 = (_a = node.expression.escapedText) !== null && _a !== void 0 ? _a : '';
        var isTestNode = ['before', 'after', 'beforeeach', 'aftereach'].includes(name_2.toLowerCase());
        if (isTestNode) {
            node.mochaType = name_2;
        }
        return isTestNode;
    }
    return false;
}
exports.isMochaHook = isMochaHook;
function isMochaGroup(node) {
    var _a;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        var name_3 = (_a = node.expression.escapedText) !== null && _a !== void 0 ? _a : '';
        var isTestNode = ['describe', 'context'].includes(name_3.toLowerCase());
        if (isTestNode) {
            node.mochaType = name_3;
        }
        return isTestNode;
    }
    return false;
}
exports.isMochaGroup = isMochaGroup;
function isDriverAPI(node) {
    var _a;
    var isDriverAPI = ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.name) &&
        exports.DriverAPIs.includes(((_a = node.expression.name.escapedText) !== null && _a !== void 0 ? _a : ''));
    return isDriverAPI;
}
exports.isDriverAPI = isDriverAPI;
exports.DriverAPIs = [
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
];
