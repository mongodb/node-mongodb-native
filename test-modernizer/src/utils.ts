import { createProjectSync } from '@ts-morph/bootstrap';
import * as prettier from 'prettier';
import { type Writable } from 'stream';
import * as ts from 'typescript';

export function annotate(child: ts.Node) {
  child.KIND = ts.SyntaxKind[child.kind];
  child.forEachChild(annotate);
}

export function explore(node: ts.Node, outStream: Writable = process.stdout) {
  // annotate nodes first
  node.forEachChild(annotate);

  let spacing = 0;
  function write(node) {
    const padding = Array.from({ length: spacing })
      .map(() => ' ')
      .join('');

    if (node.text) {
      outStream.write(`${padding}${node.KIND} (${node.text})\n`);
    } else {
      outStream.write(`${padding}${node.KIND}\n`);
    }
    spacing += 2;
    node.forEachChild(write);
    spacing -= 2;
  }

  node.forEachChild(write);
}

export async function formatSource(source: string | ts.Node, hint = ts.EmitHint.Unspecified) {
  if (typeof source === 'object') {
    const printer = ts.createPrinter();
    const project = createProjectSync();
    const resultFile = project.createSourceFile('someFileName.ts');
    source = printer.printNode(hint, source, resultFile);
  }

  const config = await prettier.resolveConfig(__dirname);
  const formatOptions = { ...config, parser: 'typescript' };
  return await prettier.format(source, formatOptions);
}

export async function print(node: ts.Node | ts.Statement[], hint = ts.EmitHint.Unspecified) {
  const _node = Array.isArray(node) ? ts.factory.createBlock(node) : node;
  const printer = ts.createPrinter();
  const project = createProjectSync();
  const resultFile = project.createSourceFile('someFileName.ts');
  const typescriptSource = printer.printNode(hint, _node, resultFile);
  // eslint-disable-next-line no-console
  console.log(await formatSource(typescriptSource));
}

export type IntoSet<T> = ConstructorParameters<typeof Set<T>>[0];
export type ArrayFromabble<T> = Iterable<T> | ArrayLike<T>;
export function setUnion<T>(a: ArrayFromabble<T>, b: IntoSet<T>): Set<T> {
  const _b = new Set(b);
  return new Set(
    Array.from(a).reduce((accum, v) => {
      if (_b.has(v)) {
        accum.add(v);
      }
      return accum;
    }, new Set<T>())
  );
}

export function find(root: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node[] {
  const result: ts.Node[] = [];
  function visit(node: ts.Node) {
    if (predicate(node)) {
      result.push(node);
    }
    node.forEachChild(visit);
  }

  visit(root);

  return result;
}

export function nodeExists(root: ts.Node, predicate: (node: ts.Node) => boolean) {
  return find(root, predicate).length > 0;
}

export function parseSource(source: string) {
  const project = createProjectSync();
  const resultFile = project.createSourceFile('someFileName.ts', source);
  annotate(resultFile);
  return resultFile;
}
