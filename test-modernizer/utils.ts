import { createProjectSync } from '@ts-morph/bootstrap';
import * as prettier from 'prettier';
import * as ts from 'typescript';

export function annotate(child: ts.Node) {
  child.KIND = ts.SyntaxKind[child.kind];
  child.forEachChild(annotate);
}

export function explore(node: ts.Node) {
  // annotate nodes first
  node.forEachChild(annotate);

  let spacing = 0;
  function print(node) {
    const padding = Array.from({ length: spacing })
      .map(() => ' ')
      .join('');
    // eslint-disable-next-line no-console
    console.log(`${padding}${node.KIND}`);
    spacing += 2;
    node.forEachChild(print);
    spacing -= 2;
  }

  node.forEachChild(print);
}

export async function formatSource(source: string) {
  const config = await prettier.resolveConfig(__dirname);
  const formatOptions = { ...config, parser: 'typescript' };
  return await prettier.format(source, formatOptions);
}

export async function print(node: ts.Node | ts.Statement[]) {
  const _node = Array.isArray(node) ? ts.factory.createBlock(node) : node;
  const printer = ts.createPrinter();
  const project = createProjectSync();
  const resultFile = project.createSourceFile('someFileName.ts');
  const typescriptSource = printer.printNode(ts.EmitHint.Unspecified, _node, resultFile);
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
