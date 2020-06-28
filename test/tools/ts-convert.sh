#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const prettier = require('prettier');
const argv = require('yargs')
  .usage('Usage: $0 [options] <pathish>')
  .options({
    stdout: {
      type: 'boolean',
      description: 'print transpilation to stdout'
    }
  })
  .demandCommand(1)
  .help('help').argv;

function resolveTypeNodeByName(typeChecker, name) {
  if (name === 'Array') {
    return ts.createArrayTypeNode(ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword));
  }

  const symbol = typeChecker.resolveName(name, undefined, ts.SymbolFlags.Type, false);
  if (symbol == null) {
    return ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);
  }

  const type = typeChecker.getDeclaredTypeOfSymbol(symbol);
  return typeChecker.typeToTypeNode(type);
}

function nodeName(node) {
  if (ts.isIdentifier(node)) {
    return node;
  }

  if (node.name == null) {
    return '<INVALID>';
  }

  return node.name.expression ? node.name.expression.escapedText : node.name.escapedText;
}

function parameterIsOptional(node) {
  const jsDocTags = ts.getJSDocParameterTags(node);
  if (jsDocTags.length && jsDocTags[0].isBracketed) {
    return true;
  }

  // detect if we have a conventional callback: (err, res) => {}, and
  // make the parameters optional if so.
  const parent = node.parent;
  if (ts.isFunctionLike(parent)) {
    if (parent.parameters.length === 2) {
      if (nodeName(node).match(/err/) || nodeName(parent.parameters[0]).match(/err/)) {
        return true;
      }
    }

    // fallthrough, is the previous prarameter optional?
    if (parent.parameters.length > 1) {
      const idx = parent.parameters.indexOf(node);

      if (idx > 0) {
        const previousNode = parent.parameters[idx - 1];
        return parameterIsOptional(previousNode);
      }
    }
  }

  return false;
}

function resolveNodeTypeNode(typeChecker, node) {
  const typeNode = ts.getJSDocType(node);
  if (typeNode) {
    if (ts.isToken(typeNode)) {
      return ts.createKeywordTypeNode(typeNode.kind);
    } else if (ts.isTypeReferenceNode(typeNode)) {
      return resolveTypeNodeByName(typeChecker, typeNode.typeName.escapedText);
    }
  }

  if (nodeName(node) === 'callback') {
    return resolveTypeNodeByName(typeChecker, 'Function');
  }

  return ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);
}

function isRequireAssignment(node) {
  return (
    ts.isVariableStatement(node) &&
    node.declarationList.declarations.length === 1 &&
    node.declarationList.declarations[0].initializer &&
    ts.isCallExpression(node.declarationList.declarations[0].initializer) &&
    node.declarationList.declarations[0].initializer.expression.escapedText === 'require'
  );
}

function indexAfterPrelude(statements) {
  const useStrictIndex = Math.max(
    statements.findIndex(s => s && s.expression && s.expression.text === 'use strict'),
    0
  );

  // find an index after all import and constant definitions
  for (let i = useStrictIndex + 1; i < statements.length; ++i) {
    const statement = statements[i];
    switch (statement.kind) {
      case ts.SyntaxKind.ImportClause:
      case ts.SyntaxKind.ImportDeclaration:
      case ts.SyntaxKind.VariableStatement:
        continue;
    }

    return i;
  }

  return useStrictIndex;
}

function makeVisitor(program, transformCtx, sourceFile, transforms) {
  const typeChecker = program.getTypeChecker();
  const semanticErrors = program.getSemanticDiagnostics(sourceFile);
  const newTopLevelStatements = [];

  const visitor = originalNode => {
    if (transforms.shouldRemoveNode(originalNode)) {
      return undefined;
    }

    const node = ts.visitEachChild(originalNode, visitor, transformCtx);

    try {
      const nodeError = semanticErrors.find(err => err.start === node.getStart());
      if (nodeError) {
        // type is implicitly `any`
        if (nodeError.code === 7034 && node.symbol && node.symbol.valueDeclaration) {
          const declaration = node.symbol.valueDeclaration;
          if (declaration.type == null) {
            declaration.type = ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);
          }
        }
      }
    } catch (e) {
      //
    }

    // do we need to add new statements to the top level
    if (
      ts.isSourceFile(node) &&
      (newTopLevelStatements.length || transforms.hasGeneratedInterfaces())
    ) {
      const statements = node.statements;
      statements.splice(indexAfterPrelude(statements), 0, ...newTopLevelStatements);

      if (transforms.hasGeneratedInterfaces()) {
        statements.splice(
          indexAfterPrelude(statements),
          0,
          ...transforms.makeInterfaceDeclarations()
        );
      }

      return ts.updateSourceFileNode(
        node,
        statements,
        node.isDeclarationFile,
        node.referencedFiles,
        node.typeReferences,
        node.hasNoDefaultLib,
        node.libReferences
      );
    }

    // fix: module has no default export
    if (ts.isImportDeclaration(node)) {
      const importClause = node.importClause;
      if (importClause.name) {
        const nodeError = semanticErrors.find(err => err.start === importClause.name.getStart());
        if (nodeError && nodeError.code === 1192) {
          return ts.updateImportDeclaration(
            node,
            node.decorators,
            node.modifiers,
            ts.createImportClause(undefined, ts.createNamespaceImport(importClause.name), false),
            node.moduleSpecifier
          );
        }
      }
    }

    // fix: non-optional parameter cannot follow optional parameter
    if (ts.isParameter(node)) {
      const nodeError = semanticErrors.find(err => err.start === node.getStart());
      if (nodeError && nodeError.code === 1016) {
        return ts.updateParameter(
          node,
          node.decorators,
          node.modifiers,
          node.dotDotDotToken,
          node.name,
          ts.createToken(ts.SyntaxKind.QuestionToken),
          node.type,
          node.initializer
        );
      }
    }

    // translate require statements to imports
    if (isRequireAssignment(node)) {
      const declaration = node.declarationList.declarations[0];
      const moduleName = declaration.initializer.arguments[0];

      if (ts.isObjectBindingPattern(declaration.name)) {
        const binding = declaration.name;

        if (binding.elements.every(elt => ts.isIdentifier(elt.name))) {
          const importSpecifiers = binding.elements.map(elt =>
            elt.propertyName
              ? ts.createImportSpecifier(elt.propertyName, elt.name)
              : ts.createImportSpecifier(undefined, elt.name)
          );

          return ts.createImportDeclaration(
            undefined,
            undefined,
            ts.createImportClause(undefined, ts.createNamedImports(importSpecifiers), false),
            moduleName
          );
        }
      } else {
        return ts.createImportEqualsDeclaration(
          undefined,
          undefined,
          declaration.name,
          ts.createExternalModuleReference(moduleName)
        );
      }
    }

    // translate module.exports to ts export syntax
    if (isModuleExportsExpression(node)) {
      const exported = node.expression.right;

      if (ts.isObjectLiteralExpression(exported)) {
        const properties = exported.properties.map(prop => {
          /*
            Convert `module.exports = { PROP: 'value' }` to:
            ```
            const PROP = 'value';
            export { PROP }
            ```
          */
          if (ts.isPropertyAssignment(prop)) {
            newTopLevelStatements.push(
              ts.createVariableStatement(
                undefined,
                ts.createVariableDeclarationList(
                  [ts.createVariableDeclaration(prop.name, undefined, prop.initializer)],
                  ts.NodeFlags.Const
                )
              )
            );

            return ts.createShorthandPropertyAssignment(prop.name);
          }

          return prop;
        });

        const exports = properties.map(prop => {
          if (ts.isShorthandPropertyAssignment(prop)) {
            return ts.createExportSpecifier(undefined, prop.name);
          }

          return ts.createExportSpecifier(prop.initializer, prop.name);
        });

        return ts.createExportDeclaration(
          undefined,
          undefined,
          ts.createNamedExports(exports),
          undefined,
          false
        );
      } else {
        return ts.createExportAssignment(undefined, undefined, true, exported);
      }
    }

    // add return types to methods if defined in their jsdoc
    if (ts.isFunctionLike(node) && node.type == null) {
      const returnType = ts.getJSDocReturnType(node.original || node);
      if (returnType) {
        if (ts.isMethodDeclaration(node)) {
          return ts.updateMethod(
            node,
            node.decorators,
            node.modifiers,
            node.asteriskToken,
            node.name,
            node.questionToken,
            node.typeParameters,
            node.parameters,
            returnType,
            node.body
          );
        }

        if (ts.isFunctionDeclaration(node)) {
          return ts.updateFunctionDeclaration(
            node,
            node.decorators,
            node.modifiers,
            node.asteriskToken,
            node.name,
            node.typeParameters,
            node.parameters,
            returnType,
            node.body
          );
        }

        if (ts.isArrowFunction(node)) {
          return ts.updateArrowFunction(
            node,
            node.modifiers,
            node.typeParameters,
            node.parameters,
            returnType,
            node.equalsGreaterThanToken,
            node.body
          );
        }

        if (ts.isFunctionExpression(node)) {
          return ts.updateFunctionExpression(
            node,
            node.modifiers,
            node.asteriskToken,
            node.name,
            node.typeParameters,
            node.parameters,
            returnType,
            node.body
          );
        }
      }
    }

    // we can immediately correct missing types on the first phase
    if (ts.isParameter(node) && node.type == null) {
      return ts.updateParameter(
        node,
        node.decorators,
        node.modifiers,
        node.dotDotDotToken,
        node.name,
        parameterIsOptional(node)
          ? ts.createToken(ts.SyntaxKind.QuestionToken)
          : node.questionToken,
        resolveNodeTypeNode(typeChecker, node),
        node.initializer
      );
    }

    if (ts.isFunctionLike(node) && transforms.has(node.pos)) {
      const parameters = node.parameters;
      parameters.unshift(transforms.get(node.pos)[0]);

      if (ts.isFunctionDeclaration(node)) {
        return ts.updateFunctionDeclaration(
          node,
          node.decorators,
          node.modifiers,
          node.asteriskToken,
          node.name,
          node.typeParameters,
          parameters,
          node.type,
          node.body
        );
      }

      if (ts.isFunctionExpression(node)) {
        return ts.updateFunctionExpression(
          node,
          node.modifiers,
          node.asteriskToken,
          node.name,
          node.typeParameters,
          parameters,
          node.type,
          node.body
        );
      }

      if (ts.isArrowFunction(node)) {
        return ts.updateArrowFunction(
          node,
          node.modifiers,
          node.typeParameters,
          parameters,
          node.type,
          node.equalsGreaterThanToken,
          node.body
        );
      }
    }

    if (ts.isClassDeclaration(node) && transforms.hasClassProperties(node.pos)) {
      const classDeclaration = node;
      const memberElements = transforms
        .takeClassProperties(classDeclaration.pos)
        .concat(classDeclaration.members);

      return ts.updateClassDeclaration(
        classDeclaration,
        classDeclaration.decorators,
        classDeclaration.modifiers,
        classDeclaration.name,
        classDeclaration.typeParameters,
        classDeclaration.heritageClauses,
        memberElements
      );
    }

    if (ts.isObjectLiteralExpression(node) && transforms.has(node.pos)) {
      return ts.updateNode(transforms.take(node.pos), node);
    }

    if (ts.isIdentifier(node) && transforms.has(node.pos)) {
      return ts.updateNode(transforms.take(node.pos), node);
    }

    return node;
  };

  return visitor;
}

function makeTransformer(program, transforms) {
  return transformCtx => {
    return sourceFile => {
      return ts.visitNode(sourceFile, makeVisitor(program, transformCtx, sourceFile, transforms));
    };
  };
}

function findParent(node, predicate) {
  if (node.parent == null) return;
  if (predicate(node)) return node;
  return findParent(node.parent, predicate);
}

function isModuleExportsExpression(node) {
  return (
    ts.isExpressionStatement(node) &&
    ts.isBinaryExpression(node.expression) &&
    ts.isPropertyAccessExpression(node.expression.left) &&
    node.expression.left.expression.escapedText === 'module' &&
    node.expression.left.name.escapedText === 'exports'
  );
}

function isJsSymbolType(symbol) {
  return (
    symbol.valueDeclaration &&
    symbol.valueDeclaration.initializer &&
    symbol.valueDeclaration.initializer.expression &&
    symbol.valueDeclaration.initializer.expression.escapedText === 'Symbol'
  );
}

class TransformContext {
  constructor() {
    this._transforms = new Map();
    this._properties = new Map();
    this._interfaces = new Map();
    this._toRemove = new Set();
  }

  has(key) {
    return this._transforms.has(key);
  }

  get(key) {
    return this._transforms.get(key);
  }

  take(key) {
    const result = this._transforms.get(key);
    this._transforms.delete(key);
    return result;
  }

  set(key, value) {
    return this._transforms.set(key, value);
  }

  addPropertyToClass(classDeclaration, propertyNode) {
    const propertyName = nodeName(propertyNode);
    const existingClassProperties = new Set(
      classDeclaration.members.filter(m => ts.isPropertyDeclaration(m)).map(m => nodeName(m))
    );

    if (existingClassProperties.has(propertyName)) {
      return;
    }

    const key = classDeclaration.pos;
    if (!this._properties.has(key)) {
      this._properties.set(key, [propertyNode]);
      return;
    }

    const toAdd = this._properties.get(key);
    if (!toAdd.find(p => nodeName(p) === propertyName)) {
      this._properties.get(key).push(propertyNode);
    }
  }

  hasClassProperties(pos) {
    return this._properties.has(pos);
  }

  takeClassProperties(pos) {
    const result = this._properties.has(pos) ? this._properties.get(pos) : [];
    this._properties.clear();
    return result;
  }

  removeNode(node) {
    this._toRemove.add(node);
  }

  shouldRemoveNode(node) {
    return this._toRemove.has(node);
  }

  addSignatureToInterface(typeName, methodSignature) {
    if (this._interfaces.has(typeName)) {
      this._interfaces.get(typeName).push(methodSignature);
      return;
    }

    this._interfaces.set(typeName, [methodSignature]);
  }

  hasGeneratedInterfaces() {
    return this._interfaces.size;
  }

  makeInterfaceDeclarations() {
    const declarations = [];
    for (const [typeName, methodSignatures] of this._interfaces) {
      const declaration = ts.createInterfaceDeclaration(
        undefined,
        undefined,
        ts.createIdentifier(typeName),
        undefined,
        undefined,
        methodSignatures
      );

      declarations.push(declaration);
    }

    return declarations;
  }
}

function scanForTransforms(program, sourceFile) {
  const typeChecker = program.getTypeChecker();
  const transforms = new TransformContext();
  const checker = program.getTypeChecker();
  const semanticErrors = program.getSemanticDiagnostics(sourceFile);
  // console.log(sourceFile.path);

  function visit(node) {
    ts.forEachChild(node, visit);

    const nodeError = semanticErrors.find(err => err.start === node.getStart());
    if (nodeError == null) {
      return;
    }

    // use of function which is potentially undefined, add a `!` at the end to coerce to concrete type
    if (ts.isIdentifier(node) && (nodeError.code === 2345 || nodeError.code === 2722)) {
      transforms.set(node.pos, ts.createNonNullExpression(node));
      return;
    }

    // can't use type to index other type
    if (
      ts.isIdentifier(node) &&
      (nodeError.code === 2571 || nodeError.code === 2532 || nodeError.code === 2322)
    ) {
      const symbol = typeChecker.getSymbolAtLocation(node);
      if (symbol && symbol.valueDeclaration) {
        const declaration = symbol.valueDeclaration;
        if (declaration && declaration.type == null) {
          declaration.type = ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);
          return;
        }
      }
    }

    // can't use type to index other type (element access expr)
    if (ts.isElementAccessExpression(node) && nodeError.code === 7053) {
      const symbol = typeChecker.getSymbolAtLocation(node.expression);
      if (symbol && symbol.valueDeclaration) {
        const declaration = symbol.valueDeclaration;
        if (declaration && declaration.type == null) {
          declaration.type = ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);
          return;
        }
      }
    }

    // fix implicit `this` access in strict mode
    if (node.kind === ts.SyntaxKind.ThisKeyword && nodeError.code === 2683) {
      const parent = findParent(node, ts.isFunctionLike);
      if (parent) {
        const propertyName = 'this';
        const property = ts.createParameter(
          /*decorators*/ undefined,
          /*modifiers*/ undefined,
          /*dotDotDotToken*/ undefined,
          propertyName,
          /*questionToken*/ undefined,
          ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
          /*initializer*/ undefined
        );

        transforms.set(parent.pos, [property]);
      }
    }

    function getLeftmostPropertyAccessExpression(expr) {
      if (
        ts.isPropertyAccessExpression(expr.expression) &&
        expr.expression.name.escapedText !== 'prototype'
      ) {
        return getLeftmostPropertyAccessExpression(expr.expression);
      }

      return expr;
    }

    if (
      (nodeError.code === 2339 || nodeError.code === 2551) &&
      ts.isPropertyAccessExpression(node.parent)
    ) {
      const accessExpression = getLeftmostPropertyAccessExpression(node.parent);
      const symbol = checker.getSymbolAtLocation(accessExpression.expression);

      if (symbol) {
        if (symbol.escapedName === 'prototype') {
          if (
            ts.isBinaryExpression(accessExpression.parent) &&
            ts.isExpressionStatement(accessExpression.parent.parent)
          ) {
            const binaryExpression = accessExpression.parent;
            let declaration = binaryExpression.right;

            if (ts.isFunctionLike(declaration) || ts.isCallExpression(declaration)) {
              if (ts.isCallExpression(declaration)) {
                declaration =
                  declaration.arguments.find(arg => ts.isFunctionLike(arg)) ||
                  declaration.arguments[0];
              }

              if (declaration == null) {
                console.dir(
                  { sourceFile: sourceFile.resolvedPath, accessExpression },
                  { depth: 4 }
                );
              }

              const parameters = declaration.parameters
                ? declaration.parameters.map(p =>
                    ts.createParameter(
                      p.decorators,
                      p.modifiers,
                      p.dotDotDotToken,
                      p.name,
                      parameterIsOptional(node)
                        ? ts.createToken(ts.SyntaxKind.QuestionToken)
                        : node.questionToken,
                      resolveNodeTypeNode(typeChecker, node),
                      p.initializer
                    )
                  )
                : undefined;

              const signature = ts.createMethodSignature(
                undefined,
                parameters,
                declaration.type ? declaration.type : ts.createToken(ts.SyntaxKind.VoidKeyword),
                accessExpression.name,
                undefined
              );

              const typeName = accessExpression.parent.left.expression.expression.escapedText;
              transforms.addSignatureToInterface(typeName, signature);
            }
          }
        } else {
          // for situations where a property is being added to an object literal, need to make it: const x = { a: 'hello' } as any;
          if (ts.isVariableDeclaration(symbol.valueDeclaration)) {
            if (
              symbol.valueDeclaration.initializer &&
              ts.isObjectLiteralExpression(symbol.valueDeclaration.initializer)
            ) {
              const objectLiteral = symbol.valueDeclaration.initializer;
              const asExpression = ts.createAsExpression(
                objectLiteral,
                ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)
              );

              transforms.set(objectLiteral.pos, asExpression);
            }
          }
          // otherwise we are adding to a class declaration
          else if (ts.isClassDeclaration(symbol.valueDeclaration)) {
            const classDeclaration = symbol.valueDeclaration;
            const propertyName = nodeName(node);

            // add class member for a `this.prop` which has no declared property
            if (accessExpression.expression.kind === ts.SyntaxKind.ThisKeyword) {
              const property = ts.createProperty(
                /*decorators*/ undefined,
                /*modifiers*/ undefined,
                propertyName,
                /*questionToken*/ undefined,
                ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
                /*initializer*/ undefined
              );

              transforms.addPropertyToClass(classDeclaration, property);
            } else {
              if (
                ts.isBinaryExpression(accessExpression.parent) &&
                ts.isExpressionStatement(accessExpression.parent.parent)
              ) {
                const binaryExpression = accessExpression.parent;
                const expressionStatement = binaryExpression.parent;

                // add static properties for `Type.prop = value`
                const property = ts.createProperty(
                  undefined,
                  [
                    ts.createModifier(ts.SyntaxKind.PublicKeyword),
                    ts.createModifier(ts.SyntaxKind.StaticKeyword)
                  ],
                  accessExpression.name,
                  undefined,
                  undefined,
                  binaryExpression.right
                );

                transforms.addPropertyToClass(classDeclaration, property);
                transforms.removeNode(expressionStatement);
              }
            }
          }
        }
      }
    }

    if (
      (nodeError.code === 7053 || nodeError.code === 2538) &&
      ts.isElementAccessExpression(node.parent)
    ) {
      const accessExpression = node.parent;
      if (accessExpression.expression.kind === ts.SyntaxKind.ThisKeyword) {
        const symbol = checker.getSymbolAtLocation(accessExpression.expression);
        if (symbol && ts.isClassDeclaration(symbol.valueDeclaration)) {
          const classDeclaration = symbol.valueDeclaration;
          const propertyName = nodeName(accessExpression.argumentExpression);
          const propertySymbol = checker.getSymbolAtLocation(propertyName);
          const property = ts.createProperty(
            /*decorators*/ undefined,
            /*modifiers*/ undefined,
            isJsSymbolType(propertySymbol)
              ? ts.createComputedPropertyName(propertyName)
              : propertyName,
            /*questionToken*/ undefined,
            ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
            /*initializer*/ undefined
          );

          transforms.addPropertyToClass(classDeclaration, property);
        }
      }
    }
  }

  ts.forEachChild(sourceFile, visit);
  return transforms;
}

function preserveNewlines(buffer) {
  return buffer.toString().replace(/\n\n/g, '/** THIS_IS_A_NEWLINE **/\n');
}

function restoreNewlines(data) {
  return data.replace(/\/\*\* THIS_IS_A_NEWLINE \*\*\//g, '\n');
}

function applyTypeInformation(fileNames, options) {
  const compilerHost = ts.createCompilerHost(options);

  const $readFile = compilerHost.readFile;
  compilerHost.readFile = fileName => {
    const baseName = `${path.basename(fileName)}`;
    if (fileNames.some(name => name.match(new RegExp(baseName)))) {
      return preserveNewlines(fs.readFileSync(path.join(__dirname, fileName)));
    }

    return $readFile.apply(null, [fileName]);
  };

  const program = ts.createProgram(fileNames, options, compilerHost);
  const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
    removeComments: false,
    omitTrailingSemicolon: false
  });

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) {
      continue;
    }

    const transforms = scanForTransforms(program, sourceFile);
    const result = ts.transform(sourceFile, [makeTransformer(program, transforms)]);

    // console.log('\n\n##### OUTPUT #####');
    const output = restoreNewlines(printer.printFile(result.transformed[0]));
    const formatted = prettier.format(output, {
      singleQuote: true,
      tabWidth: 2,
      printWidth: 100,
      arrowParens: 'avoid',
      parser: 'typescript'
    });

    if (formatted.length === 0) {
      console.log(`failed to generate code for ${sourceFile.resolvedPath}`);
      process.exit(1);
    }

    if (argv.stdout) {
      console.log(formatted);
    } else {
      fs.writeFileSync(sourceFile.resolvedPath, formatted);
    }
  }
}

applyTypeInformation(argv._, {
  target: ts.ScriptTarget.ES2018,
  module: ts.ModuleKind.CommonJS,
  allowJs: false,
  checkJs: false,
  strict: true,
  declaration: false,
  importHelpers: false,
  alwaysStrict: true,
  noEmitHelpers: true,
  noEmitOnError: true
});
