import { createProjectSync } from '@ts-morph/bootstrap';
import * as ts from 'typescript';

import { type DriverAPI, isDriverAPI, isMochaTest, type MochaTestFunction } from './driver';
import { annotate, explore, print, setUnion } from './utils';

declare module 'typescript' {
  export interface Node {
    KIND?: string;
  }
}

const FUNCTION_DECLARATION = `
function (done) {
    var configuration = this.configuration;
    var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
    client.connect(function (err, client) {
      if (err) {
        console.log(err);
      };
      var db = client.db(configuration.db);
    });
  }
// const x = 5;
`;

const project = createProjectSync();
const resultFile = project.createSourceFile('someFileName.ts', FUNCTION_DECLARATION);

const program = project.createProgram();

function hasCallbackAsLastArgument(node: DriverAPI) {
  const lastArgument = node.arguments.at(-1);

  return (
    lastArgument && (ts.isFunctionExpression(lastArgument) || ts.isArrowFunction(lastArgument))
  );
}

function getCallbackArgument(node: DriverAPI): ts.FunctionExpression | ts.ArrowFunction | null {
  const lastArgument = node.arguments.at(-1);
  if (lastArgument) {
    if (ts.isFunctionExpression(lastArgument)) return lastArgument;
    if (ts.isArrowFunction(lastArgument)) return lastArgument;
  }

  return null;
}
annotate(resultFile);

function getMochaTestNodesFromFile(node: ts.Node): MochaTestFunction[] {
  const tests: Array<MochaTestFunction> = [];
  const visit = (child: ts.Node) => {
    isMochaTest(child) && tests.push(child);
    child.forEachChild(visit);
  };
  node.forEachChild(visit);
  return tests;
}

function usesDriverCallbackMethod(node: ts.Node): boolean {
  let usesCallback = false;

  const visit = (node: ts.Node) => {
    if (isDriverAPI(node) && hasCallbackAsLastArgument(node)) {
      usesCallback = true;
    }
    node.forEachChild(visit);
  };

  node.forEachChild(visit);

  return usesCallback;
}

const checker = program.getTypeChecker();

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
function findUsagesOfParameters(
  node: (ts.FunctionExpression | ts.ArrowFunction)['body'],
  parameters: { returnParameter: ts.ParameterDeclaration; errorParameter: ts.ParameterDeclaration }
): { returnStatements: ts.Statement[]; errorStatements: ts.Statement[] } {
  // @ts-expect-error Expected error.
  if (ts.isExpression(node)) return; // todo

  /** recursively traverse a statement, looking for idenfitiers that match a parameter */
  function statementUses(parameter: ts.ParameterDeclaration) {
    return function (statement: ts.Statement): boolean {
      function _visit(node: ts.Node) {
        // todo - confirm this is the correct way to check equality.
        const _a = checker.getSymbolAtLocation(node);
        const _b = parameter.symbol;
        if (ts.isIdentifier(node) && _a && _b && _a === _b) {
          return true;
        }

        return node.forEachChild(_visit);
      }
      return statement.forEachChild(_visit) || false;
    };
  }

  // traverse all statements recursively,
  const _returns = node.statements.filter(statementUses(parameters.returnParameter));
  const _errors = node.statements.filter(statementUses(parameters.errorParameter));

  if (setUnion(_returns, _errors).size > 0) {
    throw new Error(
      'encountered statements which use both the error and value parameters of a callback.'
    );
  }

  return { returnStatements: _returns, errorStatements: _errors };
}

export function convert(node: ts.Node) {
  if (!isDriverAPI(node)) return node.forEachChild(convert);
  const driverCallbackNode = getCallbackArgument(node);
  if (!driverCallbackNode) return node.forEachChild(convert);

  const [errorParameter, returnParameter] = driverCallbackNode.parameters ?? [];
  node.forEachChild(convert); // should we be traversing the Node's function body instead?

  const { errorStatements, returnStatements } = findUsagesOfParameters(driverCallbackNode.body, {
    errorParameter,
    returnParameter
  });

  // remove the callback from the overload
  node.arguments = node.arguments.slice(0, node.arguments.length - 1);
  if (errorStatements.length === 0 && returnStatements.length === 0) {
    const _await = ts.factory.createAwaitExpression(node);
  } else if (errorStatements.length === 0) {
    // no try block here
    const statements: ts.Statement[] = [];

    const assignment = ts.factory.createVariableStatement(undefined, [
      ts.factory.createVariableDeclaration(
        returnParameter.name,
        undefined,
        undefined,
        ts.factory.createAwaitExpression(node)
      )
    ]);
    statements.push(assignment);
    statements.push(...returnStatements);
    print(statements);
  } else if (returnStatements.length === 0) {
    const _await = ts.factory.createAwaitExpression(node);
    const catchClause = ts.factory.createCatchClause(
      errorParameter.name,
      ts.factory.createBlock(errorStatements)
    );
    const tryBlock = ts.factory.createTryStatement(
      ts.factory.createBlock([ts.factory.createExpressionStatement(_await)]),
      catchClause,
      undefined
    );
    print(tryBlock);
  } else {
    const tryStatements: ts.Statement[] = [];

    const assignment = ts.factory.createVariableStatement(undefined, [
      ts.factory.createVariableDeclaration(
        returnParameter.name,
        undefined,
        undefined,
        ts.factory.createAwaitExpression(node)
      )
    ]);
    tryStatements.push(assignment);
    tryStatements.push(...returnStatements);
    const catchClause = ts.factory.createCatchClause(
      errorParameter.name,
      ts.factory.createBlock(errorStatements)
    );
    const tryBlock = ts.factory.createTryStatement(
      ts.factory.createBlock(tryStatements),
      catchClause,
      undefined
    );

    print(tryBlock);
  }
}

// explore(resultFile);
convert(resultFile);

function analyzeControlFlow();
