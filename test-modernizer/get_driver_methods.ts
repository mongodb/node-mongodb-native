import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

function* walk(root): Generator<string> {
  const directoryContents = fs.readdirSync(root);
  for (const filepath of directoryContents) {
    const fullPath = path.join(root, filepath);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      yield* walk(fullPath);
    } else if (stat.isFile()) {
      yield fullPath;
    }
  }
}

const root = '../src';

function getClasses(file: string): ts.ClassDeclaration[] {
  const contents = fs.readFileSync(file, 'utf-8');
  const sourceFile = ts.createSourceFile(
    'someFileName.ts',
    contents,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ false,
    ts.ScriptKind.TS
  );

  const classes: ts.ClassDeclaration[] = [];
  function findClasses(node: ts.Node) {
    if (ts.isClassDeclaration(node)) {
      classes.push(node);
    }
    node.forEachChild(findClasses);
  }

  sourceFile.forEachChild(findClasses);

  return classes;
}

function getMethods(node: ts.ClassDeclaration) {
  const members: ts.MethodDeclaration[] = [];
  function visit(node: ts.Node) {
    if (ts.isMethodDeclaration(node)) {
      const modifiers = node.modifiers ?? [];
      if (
        modifiers.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword) &&
        !modifiers.some(modifier => modifier.kind === ts.SyntaxKind.PrivateKeyword)
      ) {
        members.push(node);
      }
    }
    node.forEachChild(visit);
  }

  visit(node);
  return members;
}

const members: ts.MethodDeclaration[] = [];

for (const file of walk(root)) {
  const classes = getClasses(file);

  for (const class_ of classes) {
    members.push(...getMethods(class_));
  }
}

const filtered = Array.from(new Set(members.map(member => member.name?.escapedText)));

console.log(`[${filtered.map(n => `"${n}"`).join(',')}]`);
