import { expectAssignable, expectError, expectNotAssignable, expectNotType } from 'tsd';

import type { Collection, StrictFilter, StrictUpdateFilter, UpdateFilter } from '../../../mongodb';

/**
 * mutually recursive types are not supported and will not get type safety
 */
interface Author {
  name: string;
  bestBook: Book;
}

interface Book {
  title: string;
  author: Author;
}

expectAssignable<StrictFilter<Author>>({
  bestBook: {
    title: 'book title',
    author: {
      name: 'author name'
    }
  }
});

// Check that devolving to Document after a certain recursive depth does not affect checking
// cases where dot notation is not being used
expectNotType<UpdateFilter<Author>>({
  $set: {
    bestBook: {
      title: 'a title',
      published: new Date(),
      author: {
        name: 23
      }
    }
  }
});

//////////// Filter
// Depth of 1 has type checking
expectNotAssignable<StrictFilter<Author>>({
  'bestBook.title': 23
});
// Depth of 2 has type checking
expectNotAssignable<StrictFilter<Author>>({
  'bestBook.author.name': 23
});
// Depth of 3 has type checking
expectNotAssignable<StrictFilter<Author>>({
  'bestBook.author.bestBook.title': 23
});
// Depth of 4 has type checking
expectNotAssignable<StrictFilter<Author>>({
  'bestBook.author.bestBook.author.name': 23
});
// Depth of 5 has type checking
expectNotAssignable<StrictFilter<Author>>({
  'bestBook.author.bestBook.author.bestBook.title': 23
});
// Depth of 6 has type checking
expectNotAssignable<StrictFilter<Author>>({
  'bestBook.author.bestBook.author.bestBook.author.name': 23
});
// Depth of 7 has type checking
expectNotAssignable<StrictFilter<Author>>({
  'bestBook.author.bestBook.author.bestBook.author.bestBook.title': 23
});
// Depth of 8 does **not** have type checking
expectAssignable<StrictFilter<Author>>({
  'bestBook.author.bestBook.author.bestBook.author.bestBook.author.name': 23
});

//////////// UpdateFilter
// Depth of 1 has type checking
expectNotAssignable<StrictUpdateFilter<Author>>({
  $set: {
    'bestBook.title': 23
  }
});
// Depth of 2 has type checking
expectAssignable<UpdateFilter<Author>>({
  $set: {
    'bestBook.author.name': 23
  }
});
// Depth of 3 has type checking
expectAssignable<UpdateFilter<Author>>({
  $set: {
    'bestBook.author.bestBook.title': 23
  }
});
// Depth of 4 has type checking
expectAssignable<UpdateFilter<Author>>({
  $set: {
    'bestBook.author.bestBook.author.name': 23
  }
});
// Depth of 5 has type checking
expectAssignable<UpdateFilter<Author>>({
  $set: {
    'bestBook.author.bestBook.author.bestBook.title': 23
  }
});
// Depth of 6 has type checking
expectAssignable<UpdateFilter<Author>>({
  $set: {
    'bestBook.author.bestBook.author.bestBook.author.name': 23
  }
});
// Depth of 7 has type checking
expectAssignable<UpdateFilter<Author>>({
  $set: {
    'bestBook.author.bestBook.author.bestBook.author.bestBook.title': 23
  }
});
// Depth of 8 does **not** have type checking
expectAssignable<UpdateFilter<Author>>({
  $set: {
    'bestBook.author.bestBook.author.bestBook.author.bestBook.author.name': 23
  }
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

// Modeling A -> B -> C -> D -> A recursive type
type A = {
  name: string;
  b: B;
};

type B = {
  name: string;
  c: C;
};

type C = {
  name: string;
  d: D;
};

type D = {
  name: string;
  a: A;
};

expectAssignable<StrictFilter<A>>({
  'b.c.d.a.b.c.d.a.b.name': 'a'
});

// Beyond the depth supported, there is no type checking
expectAssignable<StrictFilter<A>>({
  'b.c.d.a.b.c.d.a.b.c.name': 3
});

expectAssignable<UpdateFilter<A>>({
  $set: { 'b.c.d.a.b.c.d.a.b.name': 'a' }
});

expectAssignable<UpdateFilter<A>>({
  $set: { 'b.c.d.a.b.c.d.a.b.c.name': 'a' }
});
