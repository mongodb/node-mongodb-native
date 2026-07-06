#!/usr/bin/env node
/**
 * Structural classifier for the migration diff gate (NODE-7603).
 *
 * etc/diff-lib-emit.mjs proves the old (tsc-only) and new (tsc-to-ESM + esbuild-to-CJS)
 * pipelines produce textually different lib/ output, and its header comment enumerates 7
 * classes of difference the team believes are cosmetic. That belief was reached by grep and
 * sampling — this module proves it instead, by parsing every emitted file with the TypeScript
 * compiler API and mechanically checking two things:
 *
 *   Check 1 (hard): the *set* of names each file exports is identical between old and new.
 *     This is the check with teeth — it is exactly what would catch esbuild silently dropping
 *     or renaming an export while everything else about the file looks fine.
 *
 *   Check 2 (best-effort): after stripping only statement shapes that are provably safe
 *     plumbing (the esbuild interop preamble, the old tsc TDZ/self-assign export wiring, the
 *     barrel-file getter re-export pattern, etc.) and normalizing `void 0` to `undefined`,
 *     how much of the diff is left? This does not need to reach zero. Reporting an honest
 *     residual is the point — a classifier that forces "clean" is worse than the raw diff.
 *
 * Nothing here changes runtime behavior; it only classifies the diff that
 * etc/diff-lib-emit.mjs already produces.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import * as prettier from 'prettier';
import * as ts from 'typescript';

// esbuild's per-file interop preamble: `var __helper = ...;` top-level declarations. Not every
// file has every helper (esbuild tree-shakes unused ones per file), so this is a membership
// test, not a required set.
const ESBUILD_HELPER_NAMES = new Set([
  '__create',
  '__defProp',
  '__getOwnPropDesc',
  '__getOwnPropNames',
  '__getProtoOf',
  '__hasOwnProp',
  '__export',
  '__copyProps',
  '__toESM',
  '__toCommonJS'
]);

function parse(fileName, sourceText) {
  return ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.ES2023, true, ts.ScriptKind.JS);
}

function isExportsPropertyAccess(node) {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'exports'
  );
}

// Walks a (possibly chained) `exports.A = exports.B = ... = <terminal>;` assignment, collecting
// every `exports.NAME` target along the way, regardless of what the terminal value turns out to
// be. Returns null if any link isn't an `exports.NAME = ...` assignment (i.e. this statement
// isn't this pattern at all).
function collectExportsAssignmentChain(expr) {
  const names = [];
  let cur = expr;
  for (;;) {
    if (!ts.isBinaryExpression(cur) || cur.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
      return names.length > 0 ? names : null;
    }
    if (!isExportsPropertyAccess(cur.left)) {
      return null;
    }
    names.push(cur.left.name.text);
    if (ts.isBinaryExpression(cur.right) && isExportsPropertyAccess(cur.right.left)) {
      cur = cur.right;
      continue;
    }
    // Terminal reached (whatever it is — void 0, a literal, an identifier, ...).
    return names;
  }
}

// Check 1: collect OLD's exported names — `exports.NAME = ...;` (including chains) and
// `Object.defineProperty(exports, "NAME", {...})`, excluding the `__esModule` marker.
function collectOldExports(sourceFile) {
  const names = new Set();
  for (const stmt of sourceFile.statements) {
    if (!ts.isExpressionStatement(stmt)) continue;
    const expr = stmt.expression;

    if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const chain = collectExportsAssignmentChain(expr);
      if (chain) {
        for (const name of chain) names.add(name);
      }
      continue;
    }

    if (ts.isCallExpression(expr)) {
      const callee = expr.expression;
      const isObjectDefineProperty =
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === 'Object' &&
        callee.name.text === 'defineProperty';
      if (isObjectDefineProperty && expr.arguments.length >= 2) {
        const [target, nameArg] = expr.arguments;
        if (
          ts.isIdentifier(target) &&
          target.text === 'exports' &&
          ts.isStringLiteralLike(nameArg)
        ) {
          names.add(nameArg.text);
        }
      }
    }
  }
  names.delete('__esModule');
  return names;
}

// Check 1: collect NEW's exported names from the `__export(target, { NAME: () => ..., ... })`
// call. Also returns the `target` identifier text (e.g. `index_exports`) so Check 2 can
// recognize the matching export-wiring block for this file without re-deriving it.
function findExportCall(sourceFile) {
  for (const stmt of sourceFile.statements) {
    if (!ts.isExpressionStatement(stmt)) continue;
    const expr = stmt.expression;
    if (!ts.isCallExpression(expr)) continue;
    const callee = expr.expression;
    if (ts.isIdentifier(callee) && callee.text === '__export' && expr.arguments.length >= 2) {
      return {
        statement: stmt,
        targetName: expr.arguments[0].getText(sourceFile),
        obj: expr.arguments[1]
      };
    }
  }
  return null;
}

function collectNewExports(exportCall) {
  const names = new Set();
  if (!exportCall || !ts.isObjectLiteralExpression(exportCall.obj)) return names;
  for (const prop of exportCall.obj.properties) {
    if (!prop.name) continue;
    if (ts.isIdentifier(prop.name) || ts.isStringLiteralLike(prop.name)) {
      names.add(prop.name.text);
    }
  }
  return names;
}

function setDifference(a, b) {
  return [...a].filter(x => !b.has(x)).sort();
}

// ---------------------------------------------------------------------------------------------
// Check 2: best-effort residual stripping.
// ---------------------------------------------------------------------------------------------

// NEW-side top-level statement predicates -------------------------------------------------------

function isEsbuildHelperVarStatement(stmt) {
  if (!ts.isVariableStatement(stmt)) return false;
  return stmt.declarationList.declarations.every(
    decl => ts.isIdentifier(decl.name) && ESBUILD_HELPER_NAMES.has(decl.name.text)
  );
}

// `var TARGET_exports = {};`
function isExportsTargetDecl(stmt, targetName) {
  if (!targetName || !ts.isVariableStatement(stmt)) return false;
  const decls = stmt.declarationList.declarations;
  if (decls.length !== 1) return false;
  const [decl] = decls;
  return (
    ts.isIdentifier(decl.name) &&
    decl.name.text === targetName &&
    decl.initializer != null &&
    ts.isObjectLiteralExpression(decl.initializer) &&
    decl.initializer.properties.length === 0
  );
}

// `module.exports = __toCommonJS(TARGET_exports);`
function isToCommonJSAssignment(stmt, targetName) {
  if (!ts.isExpressionStatement(stmt) || !ts.isBinaryExpression(stmt.expression)) return false;
  const { left, operatorToken, right } = stmt.expression;
  if (operatorToken.kind !== ts.SyntaxKind.EqualsToken) return false;
  if (
    left.getText() !== 'module.exports' &&
    !(
      ts.isPropertyAccessExpression(left) &&
      left.expression.getText() === 'module' &&
      left.name.text === 'exports'
    )
  ) {
    return false;
  }
  if (!ts.isCallExpression(right)) return false;
  const callee = right.expression;
  if (!ts.isIdentifier(callee) || callee.text !== '__toCommonJS') return false;
  if (!targetName || right.arguments.length !== 1) return false;
  return right.arguments[0].getText() === targetName;
}

// Trailing `0 && (module.exports = {...});`
function isCjsModuleLexerAnnotation(stmt) {
  if (!ts.isExpressionStatement(stmt) || !ts.isBinaryExpression(stmt.expression)) return false;
  const { left, operatorToken } = stmt.expression;
  return (
    operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
    ts.isNumericLiteral(left) &&
    left.text === '0'
  );
}

// OLD-side top-level statement predicates -------------------------------------------------------

// `Object.defineProperty(exports, "__esModule", { value: true });`
function isEsModuleMarker(stmt) {
  if (!ts.isExpressionStatement(stmt) || !ts.isCallExpression(stmt.expression)) return false;
  const call = stmt.expression;
  const callee = call.expression;
  const isObjectDefineProperty =
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'Object' &&
    callee.name.text === 'defineProperty';
  if (!isObjectDefineProperty || call.arguments.length < 2) return false;
  const [target, nameArg] = call.arguments;
  return (
    ts.isIdentifier(target) &&
    target.text === 'exports' &&
    ts.isStringLiteralLike(nameArg) &&
    nameArg.text === '__esModule'
  );
}

// Whole chain is a TDZ pre-declaration: every link `exports.NAME = ...` and the terminal value
// is literally `void 0`.
function isVoidZeroTdzChain(stmt) {
  if (!ts.isExpressionStatement(stmt) || !ts.isBinaryExpression(stmt.expression)) return false;
  let cur = stmt.expression;
  for (;;) {
    if (!ts.isBinaryExpression(cur) || cur.operatorToken.kind !== ts.SyntaxKind.EqualsToken)
      return false;
    if (!isExportsPropertyAccess(cur.left)) return false;
    if (ts.isBinaryExpression(cur.right) && isExportsPropertyAccess(cur.right.left)) {
      cur = cur.right;
      continue;
    }
    return (
      ts.isVoidExpression(cur.right) &&
      ts.isNumericLiteral(cur.right.expression) &&
      cur.right.expression.text === '0'
    );
  }
}

// `exports.NAME = NAME;` self-referential wiring (bare identifier RHS matching the LHS name).
function isSelfReferentialExportAssignment(stmt) {
  if (!ts.isExpressionStatement(stmt) || !ts.isBinaryExpression(stmt.expression)) return false;
  const { left, operatorToken, right } = stmt.expression;
  if (operatorToken.kind !== ts.SyntaxKind.EqualsToken) return false;
  if (!isExportsPropertyAccess(left)) return false;
  return ts.isIdentifier(right) && right.text === left.name.text;
}

// `Object.defineProperty(exports, "NAME", { enumerable: true, get: function () { return DEP.NAME2; } })`
// where the getter body is a single `return <PropertyAccessExpression>;` — the barrel re-export.
function isPassthroughGetterDefineProperty(stmt) {
  if (!ts.isExpressionStatement(stmt) || !ts.isCallExpression(stmt.expression)) return false;
  const call = stmt.expression;
  const callee = call.expression;
  const isObjectDefineProperty =
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'Object' &&
    callee.name.text === 'defineProperty';
  if (!isObjectDefineProperty || call.arguments.length < 3) return false;
  const [target, nameArg, descriptor] = call.arguments;
  if (!ts.isIdentifier(target) || target.text !== 'exports' || !ts.isStringLiteralLike(nameArg))
    return false;
  if (!ts.isObjectLiteralExpression(descriptor)) return false;

  const getProp = descriptor.properties.find(
    p => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'get'
  );
  if (!getProp || !ts.isPropertyAssignment(getProp)) return false;
  const getter = getProp.initializer;
  if (!ts.isFunctionExpression(getter) || getter.body.statements.length !== 1) return false;
  const [only] = getter.body.statements;
  return (
    ts.isReturnStatement(only) &&
    only.expression != null &&
    ts.isPropertyAccessExpression(only.expression)
  );
}

// Special-cased substitution for runtime_adapters.js only: the dynamic os-adapter loader differs
// by construction between pipelines (require() vs import()) — that is the entire point of the
// migration (see etc/check-lib-artifact.mjs's negative test for the runtime guard on this). We
// do not want that expected, understood difference to dominate the residual diff for this one
// file, but we also must not let it mask anything else — so it's an exact-shape match limited to
// this file only.
const OS_ADAPTER_PLACEHOLDER = '__OS_ADAPTER_PLACEHOLDER__';

function isOldOsRequireExpression(node) {
  // await Promise.resolve().then(() => require('os'))
  if (!ts.isAwaitExpression(node)) return false;
  const call = node.expression;
  if (!ts.isCallExpression(call)) return false;
  const thenCallee = call.expression;
  if (!ts.isPropertyAccessExpression(thenCallee) || thenCallee.name.text !== 'then') return false;
  const promiseResolveCall = thenCallee.expression;
  if (!ts.isCallExpression(promiseResolveCall)) return false;
  const resolveCallee = promiseResolveCall.expression;
  if (
    !ts.isPropertyAccessExpression(resolveCallee) ||
    resolveCallee.name.text !== 'resolve' ||
    resolveCallee.expression.getText() !== 'Promise'
  ) {
    return false;
  }
  const [arrow] = call.arguments;
  if (!arrow || !ts.isArrowFunction(arrow)) return false;
  const body = arrow.body;
  return (
    ts.isCallExpression(body) &&
    ts.isIdentifier(body.expression) &&
    body.expression.text === 'require' &&
    body.arguments.length === 1 &&
    ts.isStringLiteralLike(body.arguments[0]) &&
    body.arguments[0].text === 'os'
  );
}

function isNewOsImportExpression(node) {
  // await import("os")
  if (!ts.isAwaitExpression(node)) return false;
  const call = node.expression;
  return (
    ts.isCallExpression(call) &&
    call.expression.kind === ts.SyntaxKind.ImportKeyword &&
    call.arguments.length === 1 &&
    ts.isStringLiteralLike(call.arguments[0]) &&
    call.arguments[0].text === 'os'
  );
}

function substituteOsAdapterPlaceholder(sourceFile, matcher) {
  let matched = false;
  const placeholder = ts.factory.createIdentifier(OS_ADAPTER_PLACEHOLDER);
  function visit(node) {
    if (matcher(node)) {
      matched = true;
      return placeholder;
    }
    return ts.visitEachChild(node, visit, undefined);
  }
  const transformed = ts.visitNode(sourceFile, visit);
  return { transformed, matched };
}

// Normalizes `void 0` -> `undefined` (a bare Identifier with that text) everywhere in the tree.
function normalizeVoidZero(sourceFile) {
  function visit(node) {
    if (
      ts.isVoidExpression(node) &&
      ts.isNumericLiteral(node.expression) &&
      node.expression.text === '0'
    ) {
      return ts.factory.createIdentifier('undefined');
    }
    return ts.visitEachChild(node, visit, undefined);
  }
  return ts.visitNode(sourceFile, visit);
}

// ---------------------------------------------------------------------------------------------
// Tier-2 normalization: alpha-renaming and emit-style canonicalization.
//
// The dominant residual class after tier-1 stripping is require-binding naming: tsc calls a
// binding `error_1`, esbuild calls it `import_error`, and esbuild's collision avoidance renames
// unrelated locals (`value` -> `value2`) in shadowed scopes. A regex over the diff text cannot
// discount these safely — `value` vs `value2` is textually indistinguishable from a real change.
// Alpha-renaming can: rename every FILE-LOCALLY DECLARED binding, on both sides, with the same
// deterministic positional rule (`$1`, `$2`, ... in declaration order). Two files that differ
// only by consistent renaming become identical; anything else survives. Soundness properties:
//   - Only identifiers that resolve to a declaration inside the file are renamed. Property
//     names, exported names (already proven equal by Check 1), string contents, labels, and
//     globals are never touched, so `.foo` -> `.bar` or a changed literal still surfaces.
//   - Implementation failure direction is fail-visible: a resolution bug misaligns the
//     canonical numbering and GROWS the residual; it cannot silently shrink it.
//
// The same pass canonicalizes three other pure emit-style differences observed between the two
// compilers, each of which would otherwise pollute the residual:
//   - string/template literals are compared by cooked VALUE (`'\x00'` vs `'\0'` are identical),
//   - object shorthand is expanded (`{ payload }` -> `{ payload: payload }`) so a renamed value
//     no longer forces a shorthand/longhand mismatch,
//   - `__toESM(require(x))` is unwrapped to `require(x)` on the new side — this one is real
//     interop structure (documented esbuild helper behavior, runtime-verified by the smoke
//     test), so it is COUNTED and reported rather than silently erased,
//   - `var`/`const` is normalized to `const` only on require-binding statements (tsc emits
//     `const x_1 = require(..)`, esbuild emits `var import_x = require(..)`; kind differences
//     anywhere else are left alone and surface as residual).
// ---------------------------------------------------------------------------------------------

const isRequireCall = e =>
  ts.isCallExpression(e) &&
  ts.isIdentifier(e.expression) &&
  e.expression.text === 'require' &&
  e.arguments.length === 1;

const isRequireLikeExpr = e =>
  isRequireCall(e) ||
  (ts.isCallExpression(e) &&
    ts.isIdentifier(e.expression) &&
    e.expression.text === '__toESM' &&
    e.arguments.length >= 1 &&
    isRequireCall(e.arguments[0]));

// Template raw text for synthesized template parts: escape what would change the cooked value.
const templateRaw = text =>
  text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

// Collects every name bound by a (possibly destructuring) binding-name node.
function collectBoundNames(name, declare) {
  if (ts.isIdentifier(name)) {
    declare(name.text);
    return;
  }
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const el of name.elements) {
      if (ts.isBindingElement(el)) collectBoundNames(el.name, declare);
    }
  }
}

// Registers, in DOCUMENT ORDER, every declaration that binds in a function-level scope: `var`s
// and function declarations found recursively (without crossing into nested function or class
// bodies), interleaved with the lexical (`let`/`const`/`class`) declarations of the immediate
// statement list. Document-order interleaving — rather than hoisted-then-lexical phases — is
// what keeps canonical numbering aligned between the two emits even where one side declares a
// binding with `const` and the other with `var` (the require bindings: tsc emits const, esbuild
// emits var; a phase-ordered numbering would systematically misalign every such file).
function registerFunctionScope(statements, declare) {
  const walk = (node, immediate) => {
    if (ts.isFunctionDeclaration(node)) {
      if (node.name) declare(node.name.text);
      return;
    }
    if (ts.isClassDeclaration(node)) {
      if (immediate && node.name) declare(node.name.text);
      return;
    }
    if (
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node) ||
      ts.isClassExpression(node)
    ) {
      return;
    }
    if (ts.isVariableStatement(node)) {
      if (immediate || !(node.declarationList.flags & ts.NodeFlags.BlockScoped)) {
        for (const d of node.declarationList.declarations) collectBoundNames(d.name, declare);
      }
      return;
    }
    if (ts.isVariableDeclarationList(node)) {
      // for-statement heads reached via recursion: only `var` binds at function scope here.
      if (!(node.flags & ts.NodeFlags.BlockScoped)) {
        for (const d of node.declarations) collectBoundNames(d.name, declare);
      }
      return;
    }
    ts.forEachChild(node, child => walk(child, false));
  };
  for (const s of statements) walk(s, true);
}

// Registers the lexical (`let`/`const`/`class`/block-level `function`) declarations of a
// statement list at scope entry, so closures referencing later-declared siblings still resolve.
function registerLexicalDeclarations(statements, declare) {
  for (const s of statements) {
    if (ts.isVariableStatement(s) && s.declarationList.flags & ts.NodeFlags.BlockScoped) {
      for (const d of s.declarationList.declarations) collectBoundNames(d.name, declare);
    } else if (ts.isClassDeclaration(s) && s.name) {
      declare(s.name.text);
    } else if (ts.isFunctionDeclaration(s) && s.name) {
      declare(s.name.text);
    }
  }
}

// OLD-side only: tsc emits directly-exported values as `exports.NAME = <expr>;` with no local
// binding, and every later reference reads `exports.NAME`; esbuild creates a local `const NAME`
// (wired to exports via the already-stripped getter block). Check 1 has already proven the
// export-name sets identical, so rewriting the tsc form into `const NAME = <expr>` (and its
// reads into plain `NAME`) makes the two sides alpha-comparable without losing any signal —
// the value expressions themselves still diff normally. Only single-target, top-level
// assignments convert; anything unusual (chained value exports, later reassignment) is left
// alone and surfaces as residual.
function rewriteOldExportAssignments(sourceFile) {
  const factory = ts.factory;

  const isConvertibleStatement = stmt =>
    ts.isExpressionStatement(stmt) &&
    ts.isBinaryExpression(stmt.expression) &&
    stmt.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    isExportsPropertyAccess(stmt.expression.left) &&
    !(
      ts.isBinaryExpression(stmt.expression.right) &&
      stmt.expression.right.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      isExportsPropertyAccess(stmt.expression.right.left)
    );

  const converted = new Set();
  for (const stmt of sourceFile.statements) {
    if (isConvertibleStatement(stmt)) converted.add(stmt.expression.left.name.text);
  }
  if (converted.size === 0) return sourceFile;

  const rewriteReads = node => {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'exports' &&
      converted.has(node.name.text)
    ) {
      return factory.createIdentifier(node.name.text);
    }
    return ts.visitEachChild(node, rewriteReads, undefined);
  };

  const declared = new Set();
  const statements = sourceFile.statements.map(stmt => {
    if (isConvertibleStatement(stmt) && converted.has(stmt.expression.left.name.text)) {
      const name = stmt.expression.left.name.text;
      const init = ts.visitNode(stmt.expression.right, rewriteReads);
      if (declared.has(name)) {
        // A reassignment after the converted declaration: keep it an assignment so the printed
        // output stays valid for prettier's parser.
        return factory.createExpressionStatement(
          factory.createAssignment(factory.createIdentifier(name), init)
        );
      }
      declared.add(name);
      return factory.createVariableStatement(
        undefined,
        factory.createVariableDeclarationList(
          [factory.createVariableDeclaration(name, undefined, undefined, init)],
          ts.NodeFlags.Const
        )
      );
    }
    return ts.visitNode(stmt, rewriteReads);
  });

  return factory.updateSourceFile(sourceFile, statements);
}

/**
 * Alpha-normalizes one already-stripped source file: canonical positional renaming of file-local
 * bindings plus the emit-style canonicalizations described above. Returns the transformed file
 * and counts of what was mechanically explained.
 */
function alphaNormalize(sourceFile, { unwrapToESM }) {
  let counter = 0;
  const stats = { renamedBindings: 0, toEsmUnwraps: 0 };

  class Scope {
    constructor(parent) {
      this.parent = parent;
      this.names = new Map();
    }
    declare(name) {
      if (!this.names.has(name)) {
        counter += 1;
        this.names.set(name, `$${counter}`);
        stats.renamedBindings += 1;
      }
    }
    resolve(name) {
      const own = this.names.get(name);
      if (own != null) return own;
      return this.parent != null ? this.parent.resolve(name) : null;
    }
  }

  let current = new Scope(null);
  const factory = ts.factory;
  // Function bodies whose declarations were already registered at function entry (params share
  // that scope) — the generic Block case must not open a second scope for them.
  const functionBodies = new Set();

  function inScope(setup, run) {
    const saved = current;
    current = new Scope(saved);
    try {
      setup();
      return run();
    } finally {
      current = saved;
    }
  }

  // Identifier positions that are names-of-things rather than references — never renamed.
  function isNamePosition(id) {
    const p = id.parent;
    if (p == null) return false;
    if (ts.isPropertyAccessExpression(p) && p.name === id) return true;
    if (ts.isPropertyAssignment(p) && p.name === id) return true;
    if (
      (ts.isMethodDeclaration(p) ||
        ts.isPropertyDeclaration(p) ||
        ts.isGetAccessorDeclaration(p) ||
        ts.isSetAccessorDeclaration(p)) &&
      p.name === id
    ) {
      return true;
    }
    if (ts.isBindingElement(p) && p.propertyName === id) return true;
    if ((ts.isBreakStatement(p) || ts.isContinueStatement(p)) && p.label === id) return true;
    if (ts.isLabeledStatement(p) && p.label === id) return true;
    return false;
  }

  function renameIfResolvable(id) {
    const canonical = current.resolve(id.text);
    return canonical != null ? factory.createIdentifier(canonical) : id;
  }

  function visit(node) {
    // Literal canonicalization: compare by cooked value, not source spelling.
    if (ts.isNumericLiteral(node)) {
      const value = Number(node.text.replace(/_/g, ''));
      return Number.isFinite(value) ? factory.createNumericLiteral(String(value)) : node;
    }
    if (ts.isStringLiteral(node)) return factory.createStringLiteral(node.text);
    if (ts.isNoSubstitutionTemplateLiteral(node)) {
      return factory.createNoSubstitutionTemplateLiteral(node.text, templateRaw(node.text));
    }
    if (node.kind === ts.SyntaxKind.TemplateHead) {
      return factory.createTemplateHead(node.text, templateRaw(node.text));
    }
    if (node.kind === ts.SyntaxKind.TemplateMiddle) {
      return factory.createTemplateMiddle(node.text, templateRaw(node.text));
    }
    if (node.kind === ts.SyntaxKind.TemplateTail) {
      return factory.createTemplateTail(node.text, templateRaw(node.text));
    }

    // `__toESM(require(x))` -> `require(x)` (new side only; counted, not silent).
    if (
      unwrapToESM &&
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === '__toESM' &&
      node.arguments.length >= 1 &&
      isRequireCall(node.arguments[0])
    ) {
      stats.toEsmUnwraps += 1;
      return visit(node.arguments[0]);
    }

    // `{ payload }` -> `{ payload: payload }` (key untouched, value visited as a reference), so
    // renaming the value binding can't force a shorthand/longhand mismatch between the sides.
    if (ts.isShorthandPropertyAssignment(node) && node.objectAssignmentInitializer == null) {
      return factory.createPropertyAssignment(
        factory.createIdentifier(node.name.text),
        renameIfResolvable(node.name)
      );
    }

    // Object-pattern shorthand binding `{ a }`: keep `a` as the property, rename the binding.
    if (
      ts.isBindingElement(node) &&
      node.propertyName == null &&
      node.dotDotDotToken == null &&
      ts.isIdentifier(node.name) &&
      node.parent != null &&
      ts.isObjectBindingPattern(node.parent)
    ) {
      const canonical = current.resolve(node.name.text);
      if (canonical != null) {
        return factory.updateBindingElement(
          node,
          undefined,
          factory.createIdentifier(node.name.text),
          factory.createIdentifier(canonical),
          node.initializer != null ? ts.visitNode(node.initializer, visit) : undefined
        );
      }
      return ts.visitEachChild(node, visit, undefined);
    }

    // Function-likes open a scope: params + own name (expressions) + hoisted vars of the body.
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)
    ) {
      return inScope(
        () => {
          if (ts.isFunctionExpression(node) && node.name) current.declare(node.name.text);
          for (const p of node.parameters) collectBoundNames(p.name, n => current.declare(n));
          if (node.body != null && ts.isBlock(node.body)) {
            functionBodies.add(node.body);
            registerFunctionScope(node.body.statements, n => current.declare(n));
          }
        },
        () => ts.visitEachChild(node, visit, undefined)
      );
    }

    if (ts.isClassExpression(node) && node.name) {
      return inScope(
        () => current.declare(node.name.text),
        () => ts.visitEachChild(node, visit, undefined)
      );
    }

    if (ts.isBlock(node)) {
      if (functionBodies.has(node)) {
        return ts.visitEachChild(node, visit, undefined);
      }
      return inScope(
        () => registerLexicalDeclarations(node.statements, n => current.declare(n)),
        () => ts.visitEachChild(node, visit, undefined)
      );
    }

    if (ts.isCaseBlock(node)) {
      return inScope(
        () => {
          for (const clause of node.clauses) {
            registerLexicalDeclarations(clause.statements, n => current.declare(n));
          }
        },
        () => ts.visitEachChild(node, visit, undefined)
      );
    }

    if (ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)) {
      return inScope(
        () => {
          const init = node.initializer;
          if (
            init != null &&
            ts.isVariableDeclarationList(init) &&
            init.flags & ts.NodeFlags.BlockScoped
          ) {
            for (const d of init.declarations) collectBoundNames(d.name, n => current.declare(n));
          }
        },
        () => ts.visitEachChild(node, visit, undefined)
      );
    }

    if (ts.isCatchClause(node)) {
      return inScope(
        () => {
          if (node.variableDeclaration != null) {
            collectBoundNames(node.variableDeclaration.name, n => current.declare(n));
          }
        },
        () => ts.visitEachChild(node, visit, undefined)
      );
    }

    // Require-binding statements: normalize declaration kind (tsc `const` vs esbuild `var`).
    if (ts.isVariableStatement(node)) {
      const allRequireInits =
        node.declarationList.declarations.length > 0 &&
        node.declarationList.declarations.every(
          d => d.initializer != null && isRequireLikeExpr(d.initializer)
        );
      const visited = ts.visitEachChild(node, visit, undefined);
      if (allRequireInits) {
        return factory.updateVariableStatement(
          visited,
          visited.modifiers,
          factory.createVariableDeclarationList(
            [...visited.declarationList.declarations],
            ts.NodeFlags.Const
          )
        );
      }
      return visited;
    }

    if (ts.isIdentifier(node)) {
      if (isNamePosition(node)) return node;
      return renameIfResolvable(node);
    }

    return ts.visitEachChild(node, visit, undefined);
  }

  registerFunctionScope(sourceFile.statements, n => current.declare(n));
  const transformed = ts.visitEachChild(sourceFile, visit, undefined);
  return { sourceFile: transformed, stats };
}

// `module.exports = __toCommonJS(X)` identifies X unambiguously even on the zero-export files
// that have no `__export(...)` call to derive a target from (esbuild still emits the
// `X_exports = {}` / `__toCommonJS(X)` wiring even when there is nothing to put in it — see
// operations/client_bulk_write/common.js, whose whole exported surface is type-only).
function findToCommonJSTarget(sourceFile) {
  for (const stmt of sourceFile.statements) {
    if (
      ts.isExpressionStatement(stmt) &&
      ts.isBinaryExpression(stmt.expression) &&
      stmt.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      const { left, right } = stmt.expression;
      if (
        ts.isPropertyAccessExpression(left) &&
        ts.isIdentifier(left.expression) &&
        left.expression.text === 'module' &&
        left.name.text === 'exports' &&
        ts.isCallExpression(right) &&
        ts.isIdentifier(right.expression) &&
        right.expression.text === '__toCommonJS' &&
        right.arguments.length === 1
      ) {
        return right.arguments[0].getText(sourceFile);
      }
    }
  }
  return null;
}

function stripNewStatements(sourceFile, exportCallTargetName) {
  const targetName = exportCallTargetName ?? findToCommonJSTarget(sourceFile);
  const kept = sourceFile.statements.filter(stmt => {
    if (isEsbuildHelperVarStatement(stmt)) return false;
    if (isExportsTargetDecl(stmt, targetName)) return false;
    // The __export(...) call itself: matches by callee name, already validated by Check 1.
    if (
      ts.isExpressionStatement(stmt) &&
      ts.isCallExpression(stmt.expression) &&
      ts.isIdentifier(stmt.expression.expression) &&
      stmt.expression.expression.text === '__export'
    ) {
      return false;
    }
    if (isToCommonJSAssignment(stmt, targetName)) return false;
    if (isCjsModuleLexerAnnotation(stmt)) return false;
    return true;
  });
  return ts.factory.updateSourceFile(sourceFile, kept);
}

function stripOldStatements(sourceFile) {
  const kept = sourceFile.statements.filter(stmt => {
    if (isEsModuleMarker(stmt)) return false;
    if (isVoidZeroTdzChain(stmt)) return false;
    if (isSelfReferentialExportAssignment(stmt)) return false;
    if (isPassthroughGetterDefineProperty(stmt)) return false;
    return true;
  });
  return ts.factory.updateSourceFile(sourceFile, kept);
}

const printer = ts.createPrinter({ removeComments: true });

function lineDiff(oldText, newText) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  if (oldLines.at(-1) === '') oldLines.pop();
  if (newLines.at(-1) === '') newLines.pop();

  // A plain LCS-based line diff. Files here are small (post-stripping residuals), so an O(n*m)
  // LCS table is plenty fast; no need for a smarter Myers-diff implementation.
  const n = oldLines.length;
  const m = newLines.length;
  const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        oldLines[i] === newLines[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const diffLines = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      diffLines.push(`-${oldLines[i]}`);
      i++;
    } else {
      diffLines.push(`+${newLines[j]}`);
      j++;
    }
  }
  while (i < n) {
    diffLines.push(`-${oldLines[i]}`);
    i++;
  }
  while (j < m) {
    diffLines.push(`+${newLines[j]}`);
    j++;
  }
  return diffLines;
}

// Strips, substitutes, and prints both sides for one file, returning plain source text ready for
// prettier. Everything here is in-memory (no tmp files): earlier versions of this function shelled
// out to `npx prettier --write` against a scratch directory under .diff-gate/, but that directory
// is itself gitignored and prettier 3 skips gitignored paths during its own glob-matching even
// when --ignore-path is overridden — on top of that, the scratch directory sat inside a workspace
// whose filesystem showed glob/readdir inconsistencies right after a burst of ~260 file writes,
// occasionally making freshly-written files invisible to the very next `npx prettier` invocation.
// Calling prettier's own formatting API on in-memory strings sidesteps both problems entirely.
function prepareResidualSource(relFile, oldSourceFile, newSourceFile, targetName) {
  let strippedOld = stripOldStatements(oldSourceFile);
  let strippedNew = stripNewStatements(newSourceFile, targetName);

  // runtime_adapters.js only: neutralize the require('os')/import('os') split, which is the
  // migration's entire point and is independently covered by etc/check-lib-artifact.mjs.
  if (path.basename(relFile) === 'runtime_adapters.js') {
    const oldResult = substituteOsAdapterPlaceholder(strippedOld, isOldOsRequireExpression);
    const newResult = substituteOsAdapterPlaceholder(strippedNew, isNewOsImportExpression);
    strippedOld = oldResult.transformed;
    strippedNew = newResult.transformed;
  }

  // Tier-2: alpha-rename local bindings and canonicalize emit-style differences on both sides.
  // Stats are reported from the new side (the esbuild emit is where the renames/wraps originate).
  strippedOld = rewriteOldExportAssignments(strippedOld);
  const oldNorm = alphaNormalize(strippedOld, { unwrapToESM: false });
  const newNorm = alphaNormalize(strippedNew, { unwrapToESM: true });
  strippedOld = normalizeVoidZero(oldNorm.sourceFile);
  strippedNew = normalizeVoidZero(newNorm.sourceFile);

  return {
    oldPrinted: printer.printFile(strippedOld),
    newPrinted: printer.printFile(strippedNew),
    explained: {
      renamedBindings: newNorm.stats.renamedBindings,
      toEsmUnwraps: newNorm.stats.toEsmUnwraps
    }
  };
}

// Recursively lists files (relative paths) under dir, matching diff-lib-emit.mjs's own tree
// walk semantics (js only; .map/.d.ts are already excluded upstream when new/ was populated).
async function listJsFilesRecursive(dir) {
  const out = [];
  async function walk(sub) {
    const entries = await fs.readdir(path.join(dir, sub), { withFileTypes: true });
    for (const entry of entries) {
      const relPath = path.join(sub, entry.name);
      if (entry.isDirectory()) {
        await walk(relPath);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        out.push(relPath);
      }
    }
  }
  await walk('.');
  return out;
}

/**
 * Classifies the diff between the old-pipeline and new-pipeline lib/ trees already built by
 * etc/diff-lib-emit.mjs at `oldDir` and `newDir`.
 *
 * Returns per-file export-set equality (hard check) and a best-effort residual structural diff
 * after stripping statement shapes that are provably safe plumbing (informational only).
 */
export async function classifyEmitDiff(oldDir, newDir) {
  const oldFiles = new Set(await listJsFilesRecursive(oldDir));
  const newFiles = new Set(await listJsFilesRecursive(newDir));
  const commonFiles = [...oldFiles].filter(f => newFiles.has(f)).sort();

  // prettier's config (quote style, width, etc.) is resolved once against this file's own
  // location, same as the rest of the repo's `.prettierrc.json`-driven formatting.
  const prettierConfig = (await prettier.resolveConfig(import.meta.url)) ?? {};
  const formatJs = text => prettier.format(text, { ...prettierConfig, parser: 'babel' });

  const files = [];
  let totalResidualLines = 0;
  let allExportChecksPass = true;
  let totalRenamedBindings = 0;
  let totalToEsmUnwraps = 0;

  for (const relFile of commonFiles) {
    const oldText = await fs.readFile(path.join(oldDir, relFile), 'utf8');
    const newText = await fs.readFile(path.join(newDir, relFile), 'utf8');
    const oldSourceFile = parse(relFile, oldText);
    const newSourceFile = parse(relFile, newText);

    const oldExports = collectOldExports(oldSourceFile);
    const exportCall = findExportCall(newSourceFile);
    const newExports = collectNewExports(exportCall);

    const onlyInOld = setDifference(oldExports, newExports);
    const onlyInNew = setDifference(newExports, oldExports);
    const exportCheckOk = onlyInOld.length === 0 && onlyInNew.length === 0;
    if (!exportCheckOk) allExportChecksPass = false;

    const targetName = exportCall ? exportCall.targetName : null;
    const { oldPrinted, newPrinted, explained } = prepareResidualSource(
      relFile,
      oldSourceFile,
      newSourceFile,
      targetName
    );
    const [oldFormatted, newFormatted] = await Promise.all([
      formatJs(oldPrinted),
      formatJs(newPrinted)
    ]);

    const diffLines = oldFormatted === newFormatted ? [] : lineDiff(oldFormatted, newFormatted);
    totalResidualLines += diffLines.length;
    totalRenamedBindings += explained.renamedBindings;
    totalToEsmUnwraps += explained.toEsmUnwraps;

    files.push({
      file: relFile,
      oldExports: [...oldExports].sort(),
      newExports: [...newExports].sort(),
      exportCheck: { ok: exportCheckOk, onlyInOld, onlyInNew },
      explained,
      residualLineCount: diffLines.length,
      residualDiff: diffLines.join('\n')
    });
  }

  return {
    files,
    allExportChecksPass,
    totalResidualLines,
    totalRenamedBindings,
    totalToEsmUnwraps
  };
}
