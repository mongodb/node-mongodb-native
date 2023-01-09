import { expectError } from 'tsd';

import { MongoClient, ObjectId } from '../../../mongodb';

// TODO(NODE-3347): Improve these tests to use more expect assertions

// collection.bulkWrite tests
const client = new MongoClient('');
const db = client.db('test');

interface SubTestSchema {
  field1: string;
  field2: string;
}

type FruitTypes = 'apple' | 'pear';

// test with collection type
interface TestSchema {
  _id: ObjectId;
  stringField: string;
  numberField: number;
  optionalNumberField?: number;
  dateField: Date;
  fruitTags: string[];
  maybeFruitTags?: FruitTypes[];
  readonlyFruitTags: ReadonlyArray<string>;
  subInterfaceField: SubTestSchema;
  subInterfaceArray: SubTestSchema[];
}
const collectionType = db.collection<TestSchema>('test.update');

const testDocument: TestSchema = {
  _id: new ObjectId(),
  stringField: 'foo',
  numberField: 123,
  dateField: new Date(),
  fruitTags: ['apple'],
  readonlyFruitTags: ['pear'],
  subInterfaceField: {
    field1: 'foo',
    field2: 'bar'
  },
  subInterfaceArray: []
};
const { ...testDocumentWithoutId } = testDocument;

// insertOne

collectionType.bulkWrite([
  {
    insertOne: {
      document: testDocument
    }
  }
]);
collectionType.bulkWrite([
  {
    insertOne: {
      document: testDocumentWithoutId
    }
  }
]);
expectError(
  collectionType.bulkWrite([{ insertOne: { document: { ...testDocument, stringField: 123 } } }])
);

// updateOne

collectionType.bulkWrite([
  {
    updateOne: {
      filter: { stringField: 'foo' },
      update: {
        $set: {
          numberField: 123,
          'subInterfaceField.field1': 'true'
        }
      }
    }
  }
]);
collectionType.bulkWrite([
  {
    updateOne: {
      filter: {},
      update: {
        $set: {
          optionalNumberField: 123,
          fruitTags: ['apple']
        }
      },
      upsert: true
    }
  }
]);

expectError(
  collectionType.bulkWrite([
    { updateOne: { filter: { stringField: 123 }, update: { $set: { numberField: 123 } } } }
  ])
);

expectError(
  collectionType.bulkWrite([
    { updateOne: { filter: { stringField: 'foo' }, update: { $set: { numberField: 'bar' } } } }
  ])
);

// This is a runtime error, the "update" has no Atomic operators ($ keys)
// We want our driver to automatically support future operators, so we cannot constrain the UpdateFilter
collectionType.bulkWrite([
  // no top-level $ operator
  { updateOne: { filter: { stringField: 'foo' }, update: { 'dot.notation': true } } }
]);

// updateMany

collectionType.bulkWrite([
  {
    updateMany: {
      filter: { stringField: 'foo' },
      update: {
        $set: {
          numberField: 123,
          'subInterfaceField.field2': 'true'
        }
      }
    }
  }
]);
collectionType.bulkWrite([
  {
    updateMany: {
      filter: {},
      update: {
        $set: {
          optionalNumberField: 123,
          fruitTags: ['apple']
        }
      },
      upsert: true
    }
  }
]);

expectError(
  collectionType.bulkWrite([
    { updateMany: { filter: { stringField: 123 }, update: { $set: { numberField: 123 } } } }
  ])
);

expectError(
  collectionType.bulkWrite([
    { updateMany: { filter: { stringField: 'foo' }, update: { $set: { numberField: 'bar' } } } }
  ])
);

// This is a runtime error, the "update" & "updateMany" has no Atomic operators ($ keys)
// We want our driver to automatically support future operators, so we cannot constrain the UpdateFilter
collectionType.bulkWrite([
  // no top-level $ operator
  { updateMany: { filter: { stringField: 'foo' }, update: { 'dot.notation': true } } }
]);

// replaceOne

collectionType.bulkWrite([
  {
    replaceOne: {
      filter: { stringField: 'foo' },
      replacement: testDocument
    }
  }
]);
collectionType.bulkWrite([
  {
    replaceOne: {
      filter: {},
      replacement: testDocument,
      upsert: true
    }
  }
]);
// allow a literal replacement doc without an _id
collectionType.bulkWrite([
  {
    replaceOne: {
      filter: {},
      replacement: {
        dateField: new Date(),
        fruitTags: [],
        numberField: 0,
        readonlyFruitTags: [],
        stringField: 'string',
        subInterfaceArray: [],
        subInterfaceField: { field1: '1', field2: '2' }
      },
      upsert: true
    }
  }
]);
// disallow a literal replacement doc with an _id
expectError(
  collectionType.bulkWrite([
    {
      replaceOne: {
        filter: {},
        replacement: {
          _id: new ObjectId()
        },
        upsert: true
      }
    }
  ])
);

expectError(
  collectionType.bulkWrite([
    { replaceOne: { filter: { stringField: 123 }, replacement: testDocument } }
  ])
);

expectError(
  collectionType.bulkWrite([
    {
      replaceOne: {
        filter: { stringField: 'foo' },
        replacement: { ...testDocument, stringField: 123 }
      }
    }
  ])
);

// deleteOne

collectionType.bulkWrite([
  {
    deleteOne: {
      filter: { stringField: 'foo' }
    }
  }
]);

expectError(collectionType.bulkWrite([{ deleteOne: { filter: { stringField: 123 } } }]));

// deleteMany

collectionType.bulkWrite([
  {
    deleteMany: {
      filter: { stringField: 'foo' }
    }
  }
]);

expectError(collectionType.bulkWrite([{ deleteMany: { filter: { stringField: 123 } } }]));

// combined

collectionType.bulkWrite([
  {
    insertOne: {
      document: testDocument
    }
  },
  {
    updateMany: {
      filter: { stringField: 'foo' },
      update: {
        $set: { numberField: 123 }
      }
    }
  },
  {
    updateMany: {
      filter: { stringField: 'foo' },
      update: {
        $set: { numberField: 123 }
      }
    }
  },
  {
    replaceOne: {
      filter: { stringField: 'foo' },
      replacement: testDocument
    }
  },
  {
    deleteOne: {
      filter: { stringField: 'foo' }
    }
  },
  {
    deleteMany: {
      filter: { stringField: 'foo' }
    }
  }
]);
