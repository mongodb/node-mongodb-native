import assert from 'assert';
import * as ts from 'typescript';

import { isMochaGroup, isMochaTest } from './driver';

export function makeFunctionParametersUnique(node: ts.SourceFile): ts.Node {
  let count = 0;
  const unique = s => `${s}_${count++}`;
  class ParameterScope {
    // an array of objects mapping parameter names to their new names
    scopes: { [key: string]: string }[] = [];

    enterFunctionScope(parameters: ts.ParameterDeclaration[]) {
      const scope = Object.create(null);
      const newParameters: [string, string][] = parameters
        .filter(node => ts.isIdentifier(node.name))
        .map(parameter => {
          const name = parameter.name.getText();
          const newName = unique(name);

          return [name, String(newName)];
        });
      for (const [name, value] of newParameters) {
        scope[name] = value;
      }
      this.scopes.unshift(scope);
    }

    exitScope() {
      this.scopes.shift();
    }

    getNewNameInScope(key: string) {
      for (const scope of this.scopes) {
        if (key in scope) {
          return scope[key];
        }
      }
      return null;
    }
  }
  // @ts-expect-error asdf
  const transformerFactory: TransformerFactory<ts.SourceFile> = context => {
    const scope = new ParameterScope();

    function visitFunction(node: ts.ArrowFunction): ts.ArrowFunction;
    function visitFunction(node: ts.FunctionDeclaration): ts.FunctionDeclaration;
    function visitFunction(node: ts.FunctionExpression): ts.FunctionExpression;
    function visitFunction(
      node: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction
    ) {
      if (!node.body) return ts.visitEachChild(node, visit, context);
      if (!node.parameters.length) return ts.visitEachChild(node, visit, context);

      scope.enterFunctionScope(node.parameters as any);

      // we have a function parameter to rename here.
      const statements = ts.isArrowFunction(node.body)
        ? visitFunction(node.body)
        : ts.visitEachChild(node.body, visit, context);
      const parameters = node.parameters.map(parameter =>
        ts.isIdentifier(parameter.name)
          ? ts.factory.updateParameterDeclaration(
              parameter,
              parameter.modifiers,
              parameter.dotDotDotToken,
              ts.factory.createIdentifier(scope.getNewNameInScope(parameter.name.getText())),
              parameter.questionToken,
              parameter.type,
              parameter.initializer
            )
          : parameter
      );

      const update = () => {
        if (ts.isFunctionDeclaration(node)) {
          assert(ts.isBlock(statements));
          return ts.factory.updateFunctionDeclaration(
            node,
            node.modifiers,
            node.asteriskToken,
            node.name,
            node.typeParameters,
            parameters,
            node.type,
            statements
          );
        }
        if (ts.isFunctionExpression(node)) {
          assert(ts.isBlock(statements));

          return ts.factory.updateFunctionExpression(
            node,
            node.modifiers,
            node.asteriskToken,
            node.name,
            node.typeParameters,
            parameters,
            node.type,
            statements
          );
        }
        return ts.factory.updateArrowFunction(
          node,
          node.modifiers,
          node.typeParameters,
          parameters,
          node.type,
          node.equalsGreaterThanToken,
          statements
        );
      };

      const result = update();
      scope.exitScope();
      return result;
    }
    function visitIdentifier(node: ts.Identifier) {
      const name = scope.getNewNameInScope(node.getText());
      if (name != null) {
        return context.factory.createIdentifier(name);
      }

      return node;
    }
    function visit(node: ts.Node): ts.Node {
      if (ts.isIdentifier(node)) return visitIdentifier(node);
      if (ts.isFunctionDeclaration(node)) return visitFunction(node);
      if (ts.isFunctionExpression(node)) return visitFunction(node);
      if (ts.isArrowFunction(node)) return visitFunction(node);
      return ts.visitEachChild(node, visit, context);
    }
    return visit;
  };
  const result = ts.transform(node, [transformerFactory]);
  return result.transformed[0];
}

export function arrowFunctionsExpressionToBodiedFunction(node: ts.SourceFile): ts.SourceFile {
  // @ts-expect-error asdf
  const transformerFactory: ts.TransformerFactory<ts.SourceFile> = context => {
    function visit(node: ts.Node): ts.Node {
      if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) {
        const body = visit(node.body) as ts.Expression;
        return ts.factory.updateArrowFunction(
          node,
          node.modifiers,
          node.typeParameters,
          node.parameters,
          node.type,
          node.equalsGreaterThanToken,
          ts.factory.createBlock([ts.factory.createReturnStatement(body)])
        );
      }
      return ts.visitEachChild(node, visit, context);
    }

    return visit;
  };
  const result = ts.transform(node, [transformerFactory]);
  return result.transformed[0];
}

export function getMetadataArgument(node: ts.ObjectLiteralExpression) {
  assert(ts.isObjectLiteralExpression(node));

  const metadataNode = node.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) &&
      ts.isIdentifier(property.name) &&
      property.name.getText() === 'metadata'
  );

  if (metadataNode) {
    return metadataNode.initializer;
  }

  // create an empty metadata object
  return ts.factory.createObjectLiteralExpression([
    ts.factory.createPropertyAssignment('requires', ts.factory.createObjectLiteralExpression([]))
  ]);
}

export function getTestArgument(
  node: ts.ObjectLiteralExpression
): ts.ArrowFunction | ts.FunctionExpression {
  assert(ts.isObjectLiteralExpression(node));

  {
    // property assignment: { test: function() { ... } }
    const metadataNode = node.properties.find(
      (property): property is ts.PropertyAssignment =>
        ts.isPropertyAssignment(property) &&
        ts.isIdentifier(property.name) &&
        property.name.getText() === 'test'
    );

    if (metadataNode) {
      const _function = metadataNode.initializer;
      assert(
        ts.isFunctionExpression(_function) || ts.isArrowFunction(_function),
        `received a mocha test function that is not a function expression or an arrow function: ${_function.KIND}`
      );
      return _function;
    }
  }

  {
    // method definition
    const metadataNode = node.properties.find(
      (property): property is ts.MethodDeclaration =>
        ts.isMethodDeclaration(property) &&
        ts.isIdentifier(property.name) &&
        property.name.getText() === 'test'
    );

    if (metadataNode) {
      return ts.factory.createFunctionExpression(
        (metadataNode.modifiers ?? []).map(modifier =>
          ts.factory.createModifier(modifier.kind as any)
        ),
        metadataNode.asteriskToken,
        '',
        metadataNode.typeParameters,
        metadataNode.parameters,
        metadataNode.type,
        metadataNode.body
      );
    }
  }
  // create an empty metadata object
  throw new Error('did not find a property `test` on a mocha test.');
}

export function convertTestToSeparateMetadataAndTestFunctionArguments(
  node: ts.SourceFile
): ts.SourceFile {
  // @ts-expect-error asdf
  const transformerFactory: ts.TransformerFactory<ts.SourceFile> = context => {
    function visit(node: ts.Node): ts.Node {
      if (isMochaTest(node)) {
        const lastArgument = node.arguments.at(-1);
        if (ts.isFunctionExpression(lastArgument) || ts.isArrowFunction(lastArgument)) {
          // it('does something', ..., function() { ... })
          // do nothing - function is formatted correctly already.
          return ts.visitEachChild(node, visit, context);
        }
        if (ts.isObjectLiteralExpression(lastArgument)) {
          // it('does something', { test: function() { ... } })
          const test = getTestArgument(lastArgument);
          const metadata = getMetadataArgument(lastArgument);
          const description = node.arguments.at(0);
          return ts.factory.updateCallExpression(node, node.expression, node.typeArguments, [
            description,
            metadata,
            test
          ]);
        }
        throw new Error(`received unparsable test: ${lastArgument.KIND}`);
      }
      return ts.visitEachChild(node, visit, context);
    }

    return visit;
  };
  const result = ts.transform(node, [transformerFactory]);
  return result.transformed[0];
}

export function convertContextBlocksToDescribe(node: ts.SourceFile): ts.SourceFile {
  // @ts-expect-error asdf
  const transformerFactory: ts.TransformerFactory<ts.SourceFile> = context => {
    function visit(node: ts.Node): ts.Node {
      if (isMochaGroup(node) && node.mochaType === 'context') {
        const args = node.arguments.map(node => visit(node));
        return ts.factory.updateCallExpression(
          node,
          ts.factory.createIdentifier('describe'),
          node.typeArguments,
          args as any
        );
      }
      return ts.visitEachChild(node, visit, context);
    }

    return visit;
  };
  const result = ts.transform(node, [transformerFactory]);
  return result.transformed[0];
}

export function modernizeTest(node: ts.SourceFile): ts.SourceFile {
  return convertTestToSeparateMetadataAndTestFunctionArguments(
    convertContextBlocksToDescribe(node)
  );
}
