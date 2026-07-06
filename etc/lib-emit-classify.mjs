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
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

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

// Strips, substitutes, and prints both sides for one file, writing the results into tmpDir so
// they can be prettier-normalized in a single batched call (see classifyEmitDiff) rather than one
// `npx prettier` process per file per side — with 131 files that difference is the whole runtime
// of this step.
async function prepareResidualFiles(relFile, oldSourceFile, newSourceFile, targetName, tmpDir) {
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

  strippedOld = normalizeVoidZero(strippedOld);
  strippedNew = normalizeVoidZero(strippedNew);

  const oldPrinted = printer.printFile(strippedOld);
  const newPrinted = printer.printFile(strippedNew);

  const safeName = relFile.replace(/[/\\]/g, '__');
  const oldTmpPath = path.join(tmpDir, `${safeName}.old.js`);
  const newTmpPath = path.join(tmpDir, `${safeName}.new.js`);
  await fs.writeFile(oldTmpPath, oldPrinted);
  await fs.writeFile(newTmpPath, newPrinted);

  return { oldTmpPath, newTmpPath };
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

  const tmpDir = path.join(path.dirname(oldDir), 'residual-tmp');
  // maxRetries/retryDelay: recursive deletes of a directory that just had ~260 files written into
  // it in quick succession can transiently fail with ENOTEMPTY (e.g. a filesystem indexer briefly
  // touching the directory) — retry a few times instead of crashing the whole classification run.
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  await fs.mkdir(tmpDir, { recursive: true });

  // Pass 1: parse, run the (cheap, in-memory) export-set check, strip known-safe plumbing, and
  // write both stripped-and-printed sides to tmpDir for every file.
  const pending = [];
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

    const targetName = exportCall ? exportCall.targetName : null;
    const { oldTmpPath, newTmpPath } = await prepareResidualFiles(
      relFile,
      oldSourceFile,
      newSourceFile,
      targetName,
      tmpDir
    );

    pending.push({
      file: relFile,
      oldExports: [...oldExports].sort(),
      newExports: [...newExports].sort(),
      exportCheck: { ok: exportCheckOk, onlyInOld, onlyInNew },
      oldTmpPath,
      newTmpPath
    });
  }

  // Pass 2: normalize every stripped file in one batched prettier invocation — one `npx prettier`
  // process for the whole tree instead of one per file per side (262 invocations otherwise).
  // Prettier expands the glob itself (as diff-lib-emit.mjs's own call does), so no shell is needed.
  // --ignore-path overrides prettier 3's default of [.gitignore, .prettierignore]: tmpDir lives
  // under .diff-gate/, which is itself gitignored, so without this the write is silently skipped
  // and every residual would be a wall of quote-style/line-wrap noise instead of real structure.
  if (pending.length > 0) {
    const noIgnorePath = path.join(tmpDir, '.prettier-ignore-none');
    await fs.writeFile(noIgnorePath, '');
    execFileSync(
      'npx',
      [
        'prettier',
        '--log-level',
        'warn',
        '--ignore-path',
        noIgnorePath,
        '--write',
        `${tmpDir}/*.js`
      ],
      { encoding: 'utf8' }
    );
  }

  // Pass 3: read back the normalized text and line-diff each pair.
  const files = [];
  let totalResidualLines = 0;
  let allExportChecksPass = true;
  for (const entry of pending) {
    const [oldFormatted, newFormatted] = await Promise.all([
      fs.readFile(entry.oldTmpPath, 'utf8'),
      fs.readFile(entry.newTmpPath, 'utf8')
    ]);
    const diffLines = oldFormatted === newFormatted ? [] : lineDiff(oldFormatted, newFormatted);
    if (!entry.exportCheck.ok) allExportChecksPass = false;
    totalResidualLines += diffLines.length;

    files.push({
      file: entry.file,
      oldExports: entry.oldExports,
      newExports: entry.newExports,
      exportCheck: entry.exportCheck,
      residualLineCount: diffLines.length,
      residualDiff: diffLines.join('\n')
    });
  }

  // maxRetries/retryDelay: recursive deletes of a directory that just had ~260 files written into
  // it in quick succession can transiently fail with ENOTEMPTY (e.g. a filesystem indexer briefly
  // touching the directory) — retry a few times instead of crashing the whole classification run.
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });

  return { files, allExportChecksPass, totalResidualLines };
}
