import { expect } from 'chai';
import { test } from 'mocha';

import {
  generateModelClasses,
  type readInputSchema
} from '../../src/server-response-codegen/codegen';
import { explore, formatSource, parseSource } from '../../src/utils';

type Models = ReturnType<typeof readInputSchema>;
type Model = Models[number];
describe('Response Model Codegen', function () {
  describe('model generation', function () {
    it('does nothing on an empty specification', async function () {
      const models = [];
      const output = generateModelClasses(models);
      expect(await formatSource(output)).to.equal('');
    });

    describe('one model', function () {
      it('empty class definition', async function () {
        const models: Model[] = [{ className: 'Cursor', properties: [] }];
        const output = generateModelClasses(models);
        expect(await formatSource(output)).to.deep.equal(
          await formatSource(
            parseSource(`export class Cursor {
			  constructor(private readonly response: MongoDBResponse) {}
			}`)
          )
        );
      });

      it('one required eager property', async function () {
        const models: Model[] = [
          {
            className: 'Cursor',
            properties: [{ type: 'int64', name: 'id', lazy: false, required: true }]
          }
        ];
        const output = generateModelClasses(models);
        expect(await formatSource(output)).to.deep.equal(
          await formatSource(
            parseSource(
              `export class Cursor {
	  readonly id: BigInt;
	  constructor(private readonly response: MongoDBResponse) {
		  this.id = this.response.get('id', BSONType.long, true);
	  }
	  }`
            )
          )
        );
      });

      it('one required lazy property', async function () {
        const models: Model[] = [
          {
            className: 'Cursor',
            properties: [{ type: 'int64', name: 'id', lazy: true, required: true }]
          }
        ];
        const output = generateModelClasses(models);
        expect(await formatSource(output)).to.deep.equal(
          await formatSource(
            parseSource(
              `export class Cursor {
	  get id() : BigInt {
      return this.response.get('id', BSONType.long, true);
	  }
	  constructor(private readonly response: MongoDBResponse) { }
	  }`
            )
          )
        );
      });

      it('one non-required eager property', async function () {
        const models: Model[] = [
          {
            className: 'Cursor',
            properties: [{ type: 'int64', name: 'id', lazy: false, required: false }]
          }
        ];
        const output = generateModelClasses(models);
        expect(await formatSource(output)).to.deep.equal(
          await formatSource(
            parseSource(
              `export class Cursor {
	  readonly id: BigInt | null = null;

	  constructor(private readonly response: MongoDBResponse) {
		this.id = this.response.get('id', BSONType.long, false);
	  }
	  }`
            )
          )
        );
      });

      it('one non-required lazy property', async function () {
        const models: Model[] = [
          {
            className: 'Cursor',
            properties: [{ type: 'int64', name: 'id', lazy: true, required: false }]
          }
        ];
        const output = generateModelClasses(models);
        expect(await formatSource(output)).to.deep.equal(
          await formatSource(
            parseSource(
              `export class Cursor {
	  get id() : BigInt | null {
		return this.response.get('id', BSONType.long, false);
	  }
	  constructor(private readonly response: MongoDBResponse) { }
	  }`
            )
          )
        );
      });

      describe('multiple properties', function () {
        it('two required eager property', async function () {
          const models: Model[] = [
            {
              className: 'Cursor',
              properties: [
                { type: 'int64', name: 'id', lazy: false, required: true },
                { type: 'array', name: 'batch', lazy: false, required: true }
              ]
            }
          ];
          const output = generateModelClasses(models);
          expect(await formatSource(output)).to.deep.equal(
            await formatSource(
              parseSource(
                `export class Cursor {
		  readonly id: BigInt;
		  readonly batch: OnDemandArray;
		  constructor(private readonly response: MongoDBResponse) {
			  this.id = this.response.get('id', BSONType.long, true);
			  this.batch = this.response.get('batch', BSONType.array, true);
		  }
		  }`
              )
            )
          );
        });

        it('a mixture of properties', async function () {
          const models: Model[] = [
            {
              className: 'Cursor',
              properties: [
                { type: 'int64', name: 'id', lazy: false, required: true },
                { type: 'array', name: 'batch', lazy: true, required: false }
              ]
            }
          ];
          const output = generateModelClasses(models);
          expect(await formatSource(output)).to.deep.equal(
            await formatSource(
              parseSource(
                `export class Cursor {
      get batch(): OnDemandArray | null {
        return this.response.get('batch', BSONType.array, false);
      }
			readonly id: BigInt;
			constructor(private readonly response: MongoDBResponse) {
				this.id = this.response.get('id', BSONType.long, true);
			}
			}`
              )
            )
          );
        });
      });

      it.skip('foo', function () {
        const source = parseSource(
          `
class Foo {
	constructor( response: MongoDBResponse ) {
		this.id = this.response.get('id', BSONType.long, true);
	}
}`
        );
        explore(source);
      });
    });

    describe('all allowed BSON types', function () {
      test('int64', async function () {
        const models: Model[] = [
          {
            className: 'Cursor',
            properties: [{ type: 'int64', name: 'id', lazy: false, required: true }]
          }
        ];
        const output = generateModelClasses(models);
        expect(await formatSource(output)).to.deep.equal(
          await formatSource(
            parseSource(
              `export class Cursor {
	  readonly id: BigInt;
	  constructor(private readonly response: MongoDBResponse) {
		  this.id = this.response.get('id', BSONType.long, true);
	  }
	  }`
            )
          )
        );
      });

      test('array', async function () {
        const models: Model[] = [
          {
            className: 'Cursor',
            properties: [{ type: 'array', name: 'id', lazy: false, required: true }]
          }
        ];
        const output = generateModelClasses(models);
        expect(await formatSource(output)).to.deep.equal(
          await formatSource(
            parseSource(
              `export class Cursor {
  readonly id: OnDemandArray;
  constructor(private readonly response: MongoDBResponse) {
    this.id = this.response.get('id', BSONType.array, true);
  }
  }`
            )
          )
        );
      });

      test('string', async function () {
        const models: Model[] = [
          {
            className: 'Cursor',
            properties: [{ type: 'string', name: 'id', lazy: false, required: true }]
          }
        ];
        const output = generateModelClasses(models);
        expect(await formatSource(output)).to.deep.equal(
          await formatSource(
            parseSource(
              `export class Cursor {
  readonly id: string;
  constructor(private readonly response: MongoDBResponse) {
    this.id = this.response.get('id', BSONType.string, true);
  }
  }`
            )
          )
        );
      });

      test('null', async function () {
        const models: Model[] = [
          {
            className: 'Cursor',
            properties: [{ type: 'null', name: 'id', lazy: false, required: true }]
          }
        ];
        const output = generateModelClasses(models);
        expect(await formatSource(output)).to.deep.equal(
          await formatSource(
            parseSource(
              `export class Cursor {
  readonly id: null;
  constructor(private readonly response: MongoDBResponse) {
    this.id = this.response.get('id', BSONType.null, true);
  }
  }`
            )
          )
        );
      });

      test('undefined', async function () {
        const models: Model[] = [
          {
            className: 'Cursor',
            properties: [{ type: 'undefined', name: 'id', lazy: false, required: true }]
          }
        ];
        const output = generateModelClasses(models);
        expect(await formatSource(output)).to.deep.equal(
          await formatSource(
            parseSource(
              `export class Cursor {
  readonly id: null;
  constructor(private readonly response: MongoDBResponse) {
    this.id = this.response.get('id', BSONType.undefined, true);
  }
  }`
            )
          )
        );
      });

      test('double', async function () {
        const models: Model[] = [
          {
            className: 'Cursor',
            properties: [{ type: 'double', name: 'id', lazy: false, required: true }]
          }
        ];
        const output = generateModelClasses(models);
        expect(await formatSource(output)).to.deep.equal(
          await formatSource(
            parseSource(
              `export class Cursor {
  readonly id: number;
  constructor(private readonly response: MongoDBResponse) {
    this.id = this.response.get('id', BSONType.double, true);
  }
  }`
            )
          )
        );
      });

      test('int32', async function () {
        const models: Model[] = [
          {
            className: 'Cursor',
            properties: [{ type: 'int32', name: 'id', lazy: false, required: true }]
          }
        ];
        const output = generateModelClasses(models);
        expect(await formatSource(output)).to.deep.equal(
          await formatSource(
            parseSource(
              `export class Cursor {
  readonly id: number;
  constructor(private readonly response: MongoDBResponse) {
    this.id = this.response.get('id', BSONType.int, true);
  }
  }`
            )
          )
        );
      });

      test('timestamp', async function () {
        const models: Model[] = [
          {
            className: 'Cursor',
            properties: [{ type: 'timestamp', name: 'id', lazy: false, required: true }]
          }
        ];
        const output = generateModelClasses(models);
        expect(await formatSource(output)).to.deep.equal(
          await formatSource(
            parseSource(
              `export class Cursor {
  readonly id: Timestamp;
  constructor(private readonly response: MongoDBResponse) {
    this.id = this.response.get('id', BSONType.timestamp, true);
  }
  }`
            )
          )
        );
      });

      test('binData', async function () {
        const models: Model[] = [
          {
            className: 'Cursor',
            properties: [{ type: 'binData', name: 'id', lazy: false, required: true }]
          }
        ];
        const output = generateModelClasses(models);
        expect(await formatSource(output)).to.deep.equal(
          await formatSource(
            parseSource(
              `export class Cursor {
  readonly id: Binary;
  constructor(private readonly response: MongoDBResponse) {
    this.id = this.response.get('id', BSONType.binData, true);
  }
  }`
            )
          )
        );
      });

      test('boolean', async function () {
        const models: Model[] = [
          {
            className: 'Cursor',
            properties: [{ type: 'boolean', name: 'id', lazy: false, required: true }]
          }
        ];
        const output = generateModelClasses(models);
        expect(await formatSource(output)).to.deep.equal(
          await formatSource(
            parseSource(
              `export class Cursor {
  readonly id: boolean;
  constructor(private readonly response: MongoDBResponse) {
    this.id = this.response.get('id', BSONType.bool, true);
  }
  }`
            )
          )
        );
      });

      test('ObjectId', async function () {
        const models: Model[] = [
          {
            className: 'Cursor',
            properties: [{ type: 'objectId', name: 'id', lazy: false, required: true }]
          }
        ];
        const output = generateModelClasses(models);
        expect(await formatSource(output)).to.deep.equal(
          await formatSource(
            parseSource(
              `export class Cursor {
  readonly id: ObjectId;
  constructor(private readonly response: MongoDBResponse) {
    this.id = this.response.get('id', BSONType.objectId, true);
  }
  }`
            )
          )
        );
      });

      test('date', async function () {
        const models: Model[] = [
          {
            className: 'Cursor',
            properties: [{ type: 'date', name: 'id', lazy: false, required: true }]
          }
        ];
        const output = generateModelClasses(models);
        expect(await formatSource(output)).to.deep.equal(
          await formatSource(
            parseSource(
              `export class Cursor {
  readonly id: Date;
  constructor(private readonly response: MongoDBResponse) {
    this.id = this.response.get('id', BSONType.date, true);
  }
  }`
            )
          )
        );
      });

      test('object', async function () {
        const models: Model[] = [
          {
            className: 'Cursor',
            properties: [{ type: 'object', name: 'id', lazy: false, required: true }]
          }
        ];
        const output = generateModelClasses(models);
        expect(await formatSource(output)).to.deep.equal(
          await formatSource(
            parseSource(
              `export class Cursor {
  readonly id: OnDemandDocument;
  constructor(private readonly response: MongoDBResponse) {
    this.id = this.response.get('id', BSONType.object, true);
  }
  }`
            )
          )
        );
      });
    });

    describe('composable generated documents', function () {
      it('allows composition of generated classes', async function () {
        const models: Model[] = [
          {
            className: 'Cursor',
            properties: [{ type: 'int64', name: 'id', lazy: false, required: true }]
          },
          {
            className: 'CursorWrapper',
            properties: [{ type: 'Cursor', name: 'cursor', lazy: false, required: true }]
          }
        ];
        const output = generateModelClasses(models);

        expect(await formatSource(output)).to.deep.equal(
          await formatSource(
            parseSource(
              `
export class Cursor {
  readonly id: BigInt;
  constructor(private readonly response: MongoDBResponse) {
    this.id = this.response.get('id', BSONType.long, true);
  }
}

export class CursorWrapper {
  readonly cursor: Cursor;
  constructor(private readonly response: MongoDBResponse) {
    this.cursor = new Cursor(this.response);
  }
}
`
            )
          )
        );
      });
    });
  });
});
