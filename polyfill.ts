import { ESLint } from 'eslint';
import { readFileSync, writeFileSync } from 'fs';
import * as ts from 'typescript';

const source = ts.createSourceFile('mongodb.d.ts', readFileSync('mongodb.d.ts', 'utf-8'));
writeFileSync('mongodb-next.d.ts', readFileSync('mongodb.d.ts', 'utf-8'));

const transformer: ts.TransformerFactory<ts.SourceFile> = _ => {
  function isAsyncDisposeImplementation(node: ts.MethodDeclaration): boolean {
    if (
      ts.isComputedPropertyName(node.name) &&
      ts.isPropertyAccessExpression(node.name.expression)
    ) {
      const expression = node.name.expression.expression;
      const name = node.name.expression.name;

      const found =
        ts.isIdentifier(expression) &&
        expression.text === 'Symbol' &&
        ts.isIdentifier(name) &&
        name.text === 'asyncDispose';

      return found;
    }
    return false;
  }
  function cleanClass(node: ts.ClassDeclaration): ts.ClassDeclaration {
    // filter out all implementations
    const members = node.members.filter(node =>
      ts.isMethodDeclaration(node) ? !isAsyncDisposeImplementation(node) : true
    );

    const heratigeClauses = node.heritageClauses
      ?.map(node =>
        ts.factory.updateHeritageClause(
          node,
          node.types.filter(
            type =>
              !(
                ts.isExpressionWithTypeArguments(type) &&
                ts.isIdentifier(type.expression) &&
                type.expression.text === 'AsyncDisposable'
              )
          )
        )
      )
      .filter(node => node.types.length > 0);

    return ts.factory.updateClassDeclaration(
      node,
      node.modifiers,
      node.name,
      node.typeParameters,
      heratigeClauses,
      members
    );
  }
  return (node: ts.SourceFile) => {
    const children = node.statements.map(node => {
      if (ts.isClassDeclaration(node)) {
        return cleanClass(node);
      }
      return node;
    });
    return ts.factory.updateSourceFile(node, children);
  };
};
const transformed = ts.transform(source, [transformer]).transformed[0];
const printer = ts.createPrinter({
  removeComments: false
});

writeFileSync('mongodb.d.ts', printer.printFile(transformed));

async function lint() {
  const linter = new ESLint({ fix: true });
  const linted = await linter.lintFiles(['mongodb.d.ts', 'mongodb-next.d.ts']);
  await ESLint.outputFixes(linted);
}

lint();
