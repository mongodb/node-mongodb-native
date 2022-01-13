import { expectError } from 'tsd';

import type { Collection } from '../../../../src';

/**
 * mutually recursive types are not supported and will not get type safety
 */
interface A {
  b: B;
}

interface B {
  a: A;
}

declare const mutuallyRecursive: Collection<A>;
//@ts-expect-error
mutuallyRecursive.find({});
mutuallyRecursive.find({
  b: {}
});

/**
 * types that are not recursive in name but are recursive in structure are
 *   still supported
 */
interface RecursiveButNotReally {
  a: { a: number; b: string };
  b: string;
}

declare const recursiveButNotReallyCollection: Collection<RecursiveButNotReally>;
expectError(
  recursiveButNotReallyCollection.find({
    'a.a': 'asdf'
  })
);
recursiveButNotReallyCollection.find({
  'a.a': 2
});

/**
 * recursive schemas are now supported, but with limited type checking support
 */
interface RecursiveSchema {
  name: RecursiveSchema;
  age: number;
}

declare const recursiveCollection: Collection<RecursiveSchema>;
recursiveCollection.find({
  name: {
    name: {
      age: 23
    }
  }
});

recursiveCollection.find({
  age: 23
});

/**
 * Recursive optional schemas are also supported with the same capabilities as
 *   standard recursive schemas
 */
interface RecursiveOptionalSchema {
  name?: RecursiveOptionalSchema;
  age: number;
}

declare const recursiveOptionalCollection: Collection<RecursiveOptionalSchema>;

recursiveOptionalCollection.find({
  name: {
    name: {
      age: 23
    }
  }
});

recursiveOptionalCollection.find({
  age: 23
});

/**
 * recursive union types are supported
 */
interface Node {
  next: Node | null;
}

declare const nodeCollection: Collection<Node>;

nodeCollection.find({
  next: null
});

expectError(
  nodeCollection.find({
    next: 'asdf'
  })
);

nodeCollection.find({
  'next.next': 'asdf'
});

nodeCollection.find({ 'next.next.next': 'yoohoo' });

/**
 * Recursive schemas with arrays are also supported
 */
interface MongoStrings {
  projectId: number;
  branches: Branch[];
  twoLevelsDeep: {
    name: string;
  };
}

interface Branch {
  id: number;
  name: string;
  title?: string;
  directories: Directory[];
}

interface Directory {
  id: number;
  name: string;
  title?: string;
  branchId: number;
  files: (number | Directory)[];
}

declare const recursiveSchemaWithArray: Collection<MongoStrings>;
expectError(
  recursiveSchemaWithArray.findOne({
    'branches.0.id': 'hello'
  })
);

expectError(
  recursiveSchemaWithArray.findOne({
    'branches.0.directories.0.id': 'hello'
  })
);

// type safety breaks after the first
//   level of nested types
recursiveSchemaWithArray.findOne({
  'branches.0.directories.0.files.0.id': 'hello'
});

recursiveSchemaWithArray.findOne({
  branches: [
    {
      id: 'asdf'
    }
  ]
});

// type inference works on properties but only at the top level
expectError(
  recursiveSchemaWithArray.findOne({
    projectId: 'asdf'
  })
);

recursiveSchemaWithArray.findOne({
  twoLevelsDeep: {
    name: 3
  }
});
