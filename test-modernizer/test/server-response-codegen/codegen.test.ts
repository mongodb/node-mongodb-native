import { expect } from 'chai';

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
			  constructor(public readonly response: MongoDBResponse) {}
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
	  constructor(public readonly response: MongoDBResponse) {
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
	  constructor(public readonly response: MongoDBResponse) { }
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

	  constructor(public readonly response: MongoDBResponse) {
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
	  constructor(public readonly response: MongoDBResponse) { }
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
		  constructor(public readonly response: MongoDBResponse) {
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
			constructor(public readonly response: MongoDBResponse) {
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
  });
});
