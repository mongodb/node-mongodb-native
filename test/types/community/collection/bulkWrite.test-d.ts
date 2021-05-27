import { expectError } from 'tsd';
import { MongoClient, ObjectId } from '../../../../src/index';

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
const { _id, ...testDocumentWithoutId } = testDocument;

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
          'dot.notation': true
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

collectionType.bulkWrite([
  { updateOne: { filter: { stringField: 'foo' }, update: { $set: { numberField: 'bar' } } } }
]);

collectionType.bulkWrite([
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
          'dot.notation': true
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

collectionType.bulkWrite([
  { updateMany: { filter: { stringField: 'foo' }, update: { $set: { numberField: 'bar' } } } }
]);

collectionType.bulkWrite([
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
