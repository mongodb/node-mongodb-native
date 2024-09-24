import { expect } from 'chai';

import {
  buildDeleteManyOperation,
  buildDeleteOneOperation,
  buildInsertOneOperation,
  buildReplaceOneOperation,
  buildUpdateManyOperation,
  buildUpdateOneOperation,
  ClientBulkWriteCommandBuilder,
  type ClientDeleteManyModel,
  type ClientDeleteOneModel,
  type ClientInsertOneModel,
  type ClientReplaceOneModel,
  type ClientUpdateManyModel,
  type ClientUpdateOneModel,
  DEFAULT_PK_FACTORY,
  DocumentSequence,
  ObjectId
} from '../../../mongodb';

describe('ClientBulkWriteCommandBuilder', function () {
  describe('#buildCommand', function () {
    context('when custom options are provided', function () {
      const id = new ObjectId();
      const model: ClientInsertOneModel = {
        name: 'insertOne',
        namespace: 'test.coll',
        document: { _id: id, name: 1 }
      };
      const builder = new ClientBulkWriteCommandBuilder([model], {
        verboseResults: true,
        bypassDocumentValidation: true,
        ordered: false,
        comment: { bulk: 'write' }
      });
      const commands = builder.buildCommands();

      it('sets the bulkWrite command', function () {
        expect(commands[0].bulkWrite).to.equal(1);
      });

      it('sets the errorsOnly field to the inverse of verboseResults', function () {
        expect(commands[0].errorsOnly).to.be.false;
      });

      it('sets the ordered field', function () {
        expect(commands[0].ordered).to.be.false;
      });

      it('sets the bypassDocumentValidation field', function () {
        expect(commands[0].bypassDocumentValidation).to.be.true;
      });

      it('sets the ops document sequence', function () {
        expect(commands[0].ops).to.be.instanceOf(DocumentSequence);
        expect(commands[0].ops.documents[0]).to.deep.equal({
          insert: 0,
          document: { _id: id, name: 1 }
        });
      });

      it('sets the nsInfo document sequence', function () {
        expect(commands[0].nsInfo).to.be.instanceOf(DocumentSequence);
        expect(commands[0].nsInfo.documents[0]).to.deep.equal({ ns: 'test.coll' });
      });

      it('passes comment options into the commands', function () {
        expect(commands[0].comment).to.deep.equal({ bulk: 'write' });
      });
    });

    context('when no options are provided', function () {
      context('when a single model is provided', function () {
        const id = new ObjectId();
        const model: ClientInsertOneModel = {
          name: 'insertOne',
          namespace: 'test.coll',
          document: { _id: id, name: 1 }
        };
        const builder = new ClientBulkWriteCommandBuilder([model], {});
        const commands = builder.buildCommands();

        it('sets the bulkWrite command', function () {
          expect(commands[0].bulkWrite).to.equal(1);
        });

        it('sets the default errorsOnly field', function () {
          expect(commands[0].errorsOnly).to.be.true;
        });

        it('sets the default ordered field', function () {
          expect(commands[0].ordered).to.be.true;
        });

        it('sets the ops document sequence', function () {
          expect(commands[0].ops).to.be.instanceOf(DocumentSequence);
          expect(commands[0].ops.documents[0]).to.deep.equal({
            insert: 0,
            document: { _id: id, name: 1 }
          });
        });

        it('sets the nsInfo document sequence', function () {
          expect(commands[0].nsInfo).to.be.instanceOf(DocumentSequence);
          expect(commands[0].nsInfo.documents[0]).to.deep.equal({ ns: 'test.coll' });
        });
      });

      context('when multiple models are provided', function () {
        context('when the namespace is the same', function () {
          const idOne = new ObjectId();
          const idTwo = new ObjectId();
          const modelOne: ClientInsertOneModel = {
            name: 'insertOne',
            namespace: 'test.coll',
            document: { _id: idOne, name: 1 }
          };
          const modelTwo: ClientInsertOneModel = {
            name: 'insertOne',
            namespace: 'test.coll',
            document: { _id: idTwo, name: 2 }
          };
          const builder = new ClientBulkWriteCommandBuilder([modelOne, modelTwo], {});
          const commands = builder.buildCommands();

          it('sets the bulkWrite command', function () {
            expect(commands[0].bulkWrite).to.equal(1);
          });

          it('sets the ops document sequence', function () {
            expect(commands[0].ops).to.be.instanceOf(DocumentSequence);
            expect(commands[0].ops.documents).to.deep.equal([
              { insert: 0, document: { _id: idOne, name: 1 } },
              { insert: 0, document: { _id: idTwo, name: 2 } }
            ]);
          });

          it('sets the nsInfo document sequence', function () {
            expect(commands[0].nsInfo).to.be.instanceOf(DocumentSequence);
            expect(commands[0].nsInfo.documents).to.deep.equal([{ ns: 'test.coll' }]);
          });
        });

        context('when the namespace differs', function () {
          const idOne = new ObjectId();
          const idTwo = new ObjectId();
          const modelOne: ClientInsertOneModel = {
            name: 'insertOne',
            namespace: 'test.coll',
            document: { _id: idOne, name: 1 }
          };
          const modelTwo: ClientInsertOneModel = {
            name: 'insertOne',
            namespace: 'test.coll2',
            document: { _id: idTwo, name: 2 }
          };
          const builder = new ClientBulkWriteCommandBuilder([modelOne, modelTwo], {});
          const commands = builder.buildCommands();

          it('sets the bulkWrite command', function () {
            expect(commands[0].bulkWrite).to.equal(1);
          });

          it('sets the ops document sequence', function () {
            expect(commands[0].ops).to.be.instanceOf(DocumentSequence);
            expect(commands[0].ops.documents).to.deep.equal([
              { insert: 0, document: { _id: idOne, name: 1 } },
              { insert: 1, document: { _id: idTwo, name: 2 } }
            ]);
          });

          it('sets the nsInfo document sequence', function () {
            expect(commands[0].nsInfo).to.be.instanceOf(DocumentSequence);
            expect(commands[0].nsInfo.documents).to.deep.equal([
              { ns: 'test.coll' },
              { ns: 'test.coll2' }
            ]);
          });
        });

        context('when the namespaces are intermixed', function () {
          const idOne = new ObjectId();
          const idTwo = new ObjectId();
          const idThree = new ObjectId();
          const modelOne: ClientInsertOneModel = {
            name: 'insertOne',
            namespace: 'test.coll',
            document: { _id: idOne, name: 1 }
          };
          const modelTwo: ClientInsertOneModel = {
            name: 'insertOne',
            namespace: 'test.coll2',
            document: { _id: idTwo, name: 2 }
          };
          const modelThree: ClientInsertOneModel = {
            name: 'insertOne',
            namespace: 'test.coll',
            document: { _id: idThree, name: 2 }
          };
          const builder = new ClientBulkWriteCommandBuilder([modelOne, modelTwo, modelThree], {});
          const commands = builder.buildCommands();

          it('sets the bulkWrite command', function () {
            expect(commands[0].bulkWrite).to.equal(1);
          });

          it('sets the ops document sequence', function () {
            expect(commands[0].ops).to.be.instanceOf(DocumentSequence);
            expect(commands[0].ops.documents).to.deep.equal([
              { insert: 0, document: { _id: idOne, name: 1 } },
              { insert: 1, document: { _id: idTwo, name: 2 } },
              { insert: 0, document: { _id: idThree, name: 2 } }
            ]);
          });

          it('sets the nsInfo document sequence', function () {
            expect(commands[0].nsInfo).to.be.instanceOf(DocumentSequence);
            expect(commands[0].nsInfo.documents).to.deep.equal([
              { ns: 'test.coll' },
              { ns: 'test.coll2' }
            ]);
          });
        });
      });
    });
  });

  describe('#buildInsertOneOperation', function () {
    context('when no _id exists on the document', function () {
      const model: ClientInsertOneModel = {
        name: 'insertOne',
        namespace: 'test.coll',
        document: { name: 1 }
      };
      const operation = buildInsertOneOperation(model, 5, DEFAULT_PK_FACTORY);

      it('generates the insert operation with an _id', function () {
        expect(operation.insert).to.equal(5);
        expect(operation.document.name).to.equal(1);
        expect(operation.document).to.have.property('_id');
      });
    });

    context('when an _id exists on the document', function () {
      const id = new ObjectId();
      const model: ClientInsertOneModel = {
        name: 'insertOne',
        namespace: 'test.coll',
        document: { _id: id, name: 1 }
      };
      const operation = buildInsertOneOperation(model, 5, DEFAULT_PK_FACTORY);

      it('generates the insert operation with an _id', function () {
        expect(operation).to.deep.equal({ insert: 5, document: { _id: id, name: 1 } });
      });
    });
  });

  describe('#buildDeleteOneOperation', function () {
    context('with only required fields', function () {
      const model: ClientDeleteOneModel = {
        name: 'deleteOne',
        namespace: 'test.coll',
        filter: { name: 1 }
      };
      const operation = buildDeleteOneOperation(model, 5);

      it('generates the delete operation', function () {
        expect(operation).to.deep.equal({ delete: 5, filter: { name: 1 }, multi: false });
      });
    });

    context('with optional fields', function () {
      const model: ClientDeleteOneModel = {
        name: 'deleteOne',
        namespace: 'test.coll',
        filter: { name: 1 },
        hint: 'test',
        collation: { locale: 'de' }
      };
      const operation = buildDeleteOneOperation(model, 5);

      it('generates the delete operation', function () {
        expect(operation).to.deep.equal({
          delete: 5,
          filter: { name: 1 },
          multi: false,
          hint: 'test',
          collation: { locale: 'de' }
        });
      });
    });
  });

  describe('#buildDeleteManyOperation', function () {
    context('with only required fields', function () {
      const model: ClientDeleteManyModel = {
        name: 'deleteMany',
        namespace: 'test.coll',
        filter: { name: 1 }
      };
      const operation = buildDeleteManyOperation(model, 5);

      it('generates the delete operation', function () {
        expect(operation).to.deep.equal({ delete: 5, filter: { name: 1 }, multi: true });
      });
    });

    context('with optional fields', function () {
      const model: ClientDeleteManyModel = {
        name: 'deleteMany',
        namespace: 'test.coll',
        filter: { name: 1 },
        hint: 'test',
        collation: { locale: 'de' }
      };
      const operation = buildDeleteManyOperation(model, 5);

      it('generates the delete operation', function () {
        expect(operation).to.deep.equal({
          delete: 5,
          filter: { name: 1 },
          multi: true,
          hint: 'test',
          collation: { locale: 'de' }
        });
      });
    });
  });

  describe('#buildUpdateOneOperation', function () {
    context('with only required fields', function () {
      const model: ClientUpdateOneModel = {
        name: 'updateOne',
        namespace: 'test.coll',
        filter: { name: 1 },
        update: { $set: { name: 2 } }
      };
      const operation = buildUpdateOneOperation(model, 5);

      it('generates the update operation', function () {
        expect(operation).to.deep.equal({
          update: 5,
          filter: { name: 1 },
          updateMods: { $set: { name: 2 } },
          multi: false
        });
      });
    });

    context('with optional fields', function () {
      const model: ClientUpdateOneModel = {
        name: 'updateOne',
        namespace: 'test.coll',
        filter: { name: 1 },
        update: { $set: { name: 2 } },
        hint: 'test',
        upsert: true,
        arrayFilters: [{ test: 1 }],
        collation: { locale: 'de' }
      };
      const operation = buildUpdateOneOperation(model, 5);

      it('generates the update operation', function () {
        expect(operation).to.deep.equal({
          update: 5,
          filter: { name: 1 },
          updateMods: { $set: { name: 2 } },
          multi: false,
          hint: 'test',
          upsert: true,
          arrayFilters: [{ test: 1 }],
          collation: { locale: 'de' }
        });
      });
    });
  });

  describe('#buildUpdateManyOperation', function () {
    context('with only required fields', function () {
      const model: ClientUpdateManyModel = {
        name: 'updateMany',
        namespace: 'test.coll',
        filter: { name: 1 },
        update: { $set: { name: 2 } }
      };
      const operation = buildUpdateManyOperation(model, 5);

      it('generates the update operation', function () {
        expect(operation).to.deep.equal({
          update: 5,
          filter: { name: 1 },
          updateMods: { $set: { name: 2 } },
          multi: true
        });
      });
    });

    context('with optional fields', function () {
      const model: ClientUpdateManyModel = {
        name: 'updateMany',
        namespace: 'test.coll',
        filter: { name: 1 },
        update: { $set: { name: 2 } },
        hint: 'test',
        upsert: true,
        arrayFilters: [{ test: 1 }],
        collation: { locale: 'de' }
      };
      const operation = buildUpdateManyOperation(model, 5);

      it('generates the update operation', function () {
        expect(operation).to.deep.equal({
          update: 5,
          filter: { name: 1 },
          updateMods: { $set: { name: 2 } },
          multi: true,
          hint: 'test',
          upsert: true,
          arrayFilters: [{ test: 1 }],
          collation: { locale: 'de' }
        });
      });
    });
  });

  describe('#buildReplaceOneOperation', function () {
    context('with only required fields', function () {
      const model: ClientReplaceOneModel = {
        name: 'replaceOne',
        namespace: 'test.coll',
        filter: { name: 1 },
        replacement: { name: 2 }
      };
      const operation = buildReplaceOneOperation(model, 5);

      it('generates the update operation', function () {
        expect(operation).to.deep.equal({
          update: 5,
          filter: { name: 1 },
          updateMods: { name: 2 },
          multi: false
        });
      });
    });

    context('with optional fields', function () {
      const model: ClientReplaceOneModel = {
        name: 'replaceOne',
        namespace: 'test.coll',
        filter: { name: 1 },
        replacement: { name: 2 },
        hint: 'test',
        upsert: true,
        collation: { locale: 'de' }
      };
      const operation = buildReplaceOneOperation(model, 5);

      it('generates the update operation', function () {
        expect(operation).to.deep.equal({
          update: 5,
          filter: { name: 1 },
          updateMods: { name: 2 },
          multi: false,
          hint: 'test',
          upsert: true,
          collation: { locale: 'de' }
        });
      });
    });
  });
});
