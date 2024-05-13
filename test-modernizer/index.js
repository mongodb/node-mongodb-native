"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convert = void 0;
var bootstrap_1 = require("@ts-morph/bootstrap");
var ts = require("typescript");
var driver_1 = require("./driver");
var utils_1 = require("./utils");
var FUNCTION_DECLARATION = "\nfunction (done) {\n    var configuration = this.configuration;\n    var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });\n    client.connect(function (err, client) {\n      if (err) {\n        console.log(err);\n      };\n      var db = client.db(configuration.db);\n    });\n  }\n// const x = 5;\n";
var project = (0, bootstrap_1.createProjectSync)();
var resultFile = project.createSourceFile('someFileName.ts', FUNCTION_DECLARATION);
var program = project.createProgram();
function hasCallbackAsLastArgument(node) {
    var lastArgument = node.arguments.at(-1);
    return (lastArgument && (ts.isFunctionExpression(lastArgument) || ts.isArrowFunction(lastArgument)));
}
function getCallbackArgument(node) {
    var lastArgument = node.arguments.at(-1);
    if (lastArgument) {
        if (ts.isFunctionExpression(lastArgument))
            return lastArgument;
        if (ts.isArrowFunction(lastArgument))
            return lastArgument;
    }
    return null;
}
(0, utils_1.annotate)(resultFile);
function getMochaTestNodesFromFile(node) {
    var tests = [];
    var visit = function (child) {
        (0, driver_1.isMochaTest)(child) && tests.push(child);
        child.forEachChild(visit);
    };
    node.forEachChild(visit);
    return tests;
}
function usesDriverCallbackMethod(node) {
    var usesCallback = false;
    var visit = function (node) {
        if ((0, driver_1.isDriverAPI)(node) && hasCallbackAsLastArgument(node)) {
            usesCallback = true;
        }
        node.forEachChild(visit);
    };
    node.forEachChild(visit);
    return usesCallback;
}
var checker = program.getTypeChecker();
/**
 *
 * given a function body, a "return" parameter and an "error" parameter to search for,
 * recursively traverses each statement and checks to see if the statement uses the return value
 * or the error value.
 *
 * throws an error if the function determines that a statement uses both the return and error values.
 *
 * returns a list of statements that use the return value and statements that use the error value.
 */
function findUsagesOfParameters(node, parameters) {
    // @ts-expect-error Expected error.
    if (ts.isExpression(node))
        return; // todo
    /** recursively traverse a statement, looking for idenfitiers that match a parameter */
    function statementUses(parameter) {
        return function (statement) {
            function _visit(node) {
                // todo - confirm this is the correct way to check equality.
                var _a = checker.getSymbolAtLocation(node);
                var _b = parameter.symbol;
                if (ts.isIdentifier(node) && _a && _b && _a === _b) {
                    return true;
                }
                return node.forEachChild(_visit);
            }
            return statement.forEachChild(_visit) || false;
        };
    }
    // traverse all statements recursively,
    var _returns = node.statements.filter(statementUses(parameters.returnParameter));
    var _errors = node.statements.filter(statementUses(parameters.errorParameter));
    if ((0, utils_1.setUnion)(_returns, _errors).size > 0) {
        throw new Error('encountered statements which use both the error and value parameters of a callback.');
    }
    return { returnStatements: _returns, errorStatements: _errors };
}
function convert(node) {
    var _c;
    if (!(0, driver_1.isDriverAPI)(node))
        return node.forEachChild(convert);
    var driverCallbackNode = getCallbackArgument(node);
    if (!driverCallbackNode)
        return node.forEachChild(convert);
    var _d = (_c = driverCallbackNode.parameters) !== null && _c !== void 0 ? _c : [], errorParameter = _d[0], returnParameter = _d[1];
    node.forEachChild(convert); // should we be traversing the Node's function body instead?
    var _e = findUsagesOfParameters(driverCallbackNode.body, {
        errorParameter: errorParameter,
        returnParameter: returnParameter
    }), errorStatements = _e.errorStatements, returnStatements = _e.returnStatements;
    // remove the callback from the overload
    node.arguments = node.arguments.slice(0, node.arguments.length - 1);
    if (errorStatements.length === 0 && returnStatements.length === 0) {
        var _await = ts.factory.createAwaitExpression(node);
    }
    else if (errorStatements.length === 0) {
        // no try block here
        var statements = [];
        var assignment = ts.factory.createVariableStatement(undefined, [
            ts.factory.createVariableDeclaration(returnParameter.name, undefined, undefined, ts.factory.createAwaitExpression(node))
        ]);
        statements.push(assignment);
        statements.push.apply(statements, returnStatements);
        (0, utils_1.print)(statements);
    }
    else if (returnStatements.length === 0) {
        var _await = ts.factory.createAwaitExpression(node);
        var catchClause = ts.factory.createCatchClause(errorParameter.name, ts.factory.createBlock(errorStatements));
        var tryBlock = ts.factory.createTryStatement(ts.factory.createBlock([ts.factory.createExpressionStatement(_await)]), catchClause, undefined);
        (0, utils_1.print)(tryBlock);
    }
    else {
        var tryStatements = [];
        var assignment = ts.factory.createVariableStatement(undefined, [
            ts.factory.createVariableDeclaration(returnParameter.name, undefined, undefined, ts.factory.createAwaitExpression(node))
        ]);
        tryStatements.push(assignment);
        tryStatements.push.apply(tryStatements, returnStatements);
        var catchClause = ts.factory.createCatchClause(errorParameter.name, ts.factory.createBlock(errorStatements));
        var tryBlock = ts.factory.createTryStatement(ts.factory.createBlock(tryStatements), catchClause, undefined);
        (0, utils_1.print)(tryBlock);
    }
}
exports.convert = convert;
// explore(resultFile);
convert(resultFile);
