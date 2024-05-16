import assert from 'assert';
import * as ts from 'typescript';

export function makeFunctionParametersUnique(node: ts.SourceFile): ts.Node {
  let count = 0;
  const unique = s => `${s}_${count++}`;
  class ParameterScope {
    // an array of objects mapping parameter names to their new names
    scopes: { [key: string]: string }[] = [];

    enterFunctionScope(parameters: ts.ParameterDeclaration[]) {
      const newParameters: [string, string][] = parameters
        .filter(node => ts.isIdentifier(node.name))
        .map(parameter => {
          const name = parameter.name.getText();
          const newName = unique(name);

          return [name, String(newName)];
        });
      this.scopes.unshift(Object.fromEntries(newParameters));
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
