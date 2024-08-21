import { expect } from 'chai';

import {
  builderFor,
  ClientBulkWriteCommandBuilder,
  type ClientDeleteManyModel,
  type ClientDeleteOneModel,
  type ClientInsertOneModel,
  type ClientReplaceOneModel,
  type ClientUpdateManyModel,
  type ClientUpdateOneModel,
  DeleteManyOperationBuilder,
  DeleteOneOperationBuilder,
  DocumentSequence,
  InsertOneOperationBuilder,
  ReplaceOneOperationBuilder,
  UpdateManyOperationBuilder,
  UpdateOneOperationBuilder
} from '../../../mongodb';

describe('ClientBulkWriteCommandBuilder', function () {
  describe('#buildCommand', function () {
    context('when custom options are provided', function () {
      const model: ClientInsertOneModel = {
        name: 'insertOne',
        namespace: 'test.coll',
        document: { name: 1 }
      };
      const builder = new ClientBulkWriteCommandBuilder([model], {
        verboseResults: true,
        bypassDocumentValidation: true,
        ordered: false
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
        expect(commands[0].ops.documents[0]).to.deep.equal({ insert: 0, document: { name: 1 } });
      });

      it('sets the nsInfo document sequence', function () {
        expect(commands[0].nsInfo).to.be.instanceOf(DocumentSequence);
        expect(commands[0].nsInfo.documents[0]).to.deep.equal({ ns: 'test.coll' });
      });
    });

    context('when no options are provided', function () {
      context('when a single model is provided', function () {
        const model: ClientInsertOneModel = {
          name: 'insertOne',
          namespace: 'test.coll',
          document: { name: 1 }
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
          expect(commands[0].ops.documents[0]).to.deep.equal({ insert: 0, document: { name: 1 } });
        });

        it('sets the nsInfo document sequence', function () {
          expect(commands[0].nsInfo).to.be.instanceOf(DocumentSequence);
          expect(commands[0].nsInfo.documents[0]).to.deep.equal({ ns: 'test.coll' });
        });
      });

      context('when multiple models are provided', function () {
        context('when the namespace is the same', function () {
          const modelOne: ClientInsertOneModel = {
            name: 'insertOne',
            namespace: 'test.coll',
            document: { name: 1 }
          };
          const modelTwo: ClientInsertOneModel = {
            name: 'insertOne',
            namespace: 'test.coll',
            document: { name: 2 }
          };
          const builder = new ClientBulkWriteCommandBuilder([modelOne, modelTwo], {});
          const commands = builder.buildCommands();

          it('sets the bulkWrite command', function () {
            expect(commands[0].bulkWrite).to.equal(1);
          });

          it('sets the ops document sequence', function () {
            expect(commands[0].ops).to.be.instanceOf(DocumentSequence);
            expect(commands[0].ops.documents).to.deep.equal([
              { insert: 0, document: { name: 1 } },
              { insert: 0, document: { name: 2 } }
            ]);
          });

          it('sets the nsInfo document sequence', function () {
            expect(commands[0].nsInfo).to.be.instanceOf(DocumentSequence);
            expect(commands[0].nsInfo.documents).to.deep.equal([{ ns: 'test.coll' }]);
          });
        });

        context('when the namespace differs', function () {
          const modelOne: ClientInsertOneModel = {
            name: 'insertOne',
            namespace: 'test.coll',
            document: { name: 1 }
          };
          const modelTwo: ClientInsertOneModel = {
            name: 'insertOne',
            namespace: 'test.coll2',
            document: { name: 2 }
          };
          const builder = new ClientBulkWriteCommandBuilder([modelOne, modelTwo], {});
          const commands = builder.buildCommands();

          it('sets the bulkWrite command', function () {
            expect(commands[0].bulkWrite).to.equal(1);
          });

          it('sets the ops document sequence', function () {
            expect(commands[0].ops).to.be.instanceOf(DocumentSequence);
            expect(commands[0].ops.documents).to.deep.equal([
              { insert: 0, document: { name: 1 } },
              { insert: 1, document: { name: 2 } }
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
          const modelOne: ClientInsertOneModel = {
            name: 'insertOne',
            namespace: 'test.coll',
            document: { name: 1 }
          };
          const modelTwo: ClientInsertOneModel = {
            name: 'insertOne',
            namespace: 'test.coll2',
            document: { name: 2 }
          };
          const modelThree: ClientInsertOneModel = {
            name: 'insertOne',
            namespace: 'test.coll',
            document: { name: 2 }
          };
          const builder = new ClientBulkWriteCommandBuilder([modelOne, modelTwo, modelThree], {});
          const commands = builder.buildCommands();

          it('sets the bulkWrite command', function () {
            expect(commands[0].bulkWrite).to.equal(1);
          });

          it('sets the ops document sequence', function () {
            expect(commands[0].ops).to.be.instanceOf(DocumentSequence);
            expect(commands[0].ops.documents).to.deep.equal([
              { insert: 0, document: { name: 1 } },
              { insert: 1, document: { name: 2 } },
              { insert: 0, document: { name: 2 } }
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

  describe('.builderFor', function () {
    context('when the model is an insert one', function () {
      const model: ClientInsertOneModel = {
        name: 'insertOne',
        namespace: 'test.coll',
        document: { name: 1 }
      };

      it('returns an insert one operation builder', function () {
        expect(builderFor(model)).to.be.instanceOf(InsertOneOperationBuilder);
      });
    });

    context('when the model is an update one', function () {
      const model: ClientUpdateOneModel = {
        name: 'updateOne',
        namespace: 'test.coll',
        filter: { name: 1 },
        update: { $set: { name: 2 } }
      };

      it('returns an update one operation builder', function () {
        expect(builderFor(model)).to.be.instanceOf(UpdateOneOperationBuilder);
      });
    });

    context('when the model is an update many', function () {
      const model: ClientUpdateManyModel = {
        name: 'updateMany',
        namespace: 'test.coll',
        filter: { name: 1 },
        update: { $set: { name: 2 } }
      };

      it('returns an update many operation builder', function () {
        expect(builderFor(model)).to.be.instanceOf(UpdateManyOperationBuilder);
      });
    });

    context('when the model is a replace one', function () {
      const model: ClientReplaceOneModel = {
        name: 'replaceOne',
        namespace: 'test.coll',
        filter: { name: 1 },
        replacement: { name: 2 }
      };

      it('returns an replace one operation builder', function () {
        expect(builderFor(model)).to.be.instanceOf(ReplaceOneOperationBuilder);
      });
    });

    context('when the model is a delete one', function () {
      const model: ClientDeleteOneModel = {
        name: 'deleteOne',
        namespace: 'test.coll',
        filter: { name: 1 }
      };

      it('returns an delete one operation builder', function () {
        expect(builderFor(model)).to.be.instanceOf(DeleteOneOperationBuilder);
      });
    });

    context('when the model is a delete many', function () {
      const model: ClientDeleteManyModel = {
        name: 'deleteMany',
        namespace: 'test.coll',
        filter: { name: 1 }
      };

      it('returns an delete many operation builder', function () {
        expect(builderFor(model)).to.be.instanceOf(DeleteManyOperationBuilder);
      });
    });
  });

  describe('InsertOneOperationBuilder', function () {
    const model: ClientInsertOneModel = {
      name: 'insertOne',
      namespace: 'test.coll',
      document: { name: 1 }
    };

    describe('#buildOperation', function () {
      const builder = new InsertOneOperationBuilder(model);
      const operation = builder.buildOperation(5);

      it('generates the insert operation', function () {
        expect(operation).to.deep.equal({ insert: 5, document: { name: 1 } });
      });
    });
  });

  describe('DeleteOneOperationBuilder', function () {
    describe('#buildOperation', function () {
      context('with only required fields', function () {
        const model: ClientDeleteOneModel = {
          name: 'deleteOne',
          namespace: 'test.coll',
          filter: { name: 1 }
        };

        const builder = new DeleteOneOperationBuilder(model);
        const operation = builder.buildOperation(5);

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

        const builder = new DeleteOneOperationBuilder(model);
        const operation = builder.buildOperation(5);

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
  });

  describe('DeleteManyOperationBuilder', function () {
    describe('#buildOperation', function () {
      context('with only required fields', function () {
        const model: ClientDeleteManyModel = {
          name: 'deleteMany',
          namespace: 'test.coll',
          filter: { name: 1 }
        };

        const builder = new DeleteManyOperationBuilder(model);
        const operation = builder.buildOperation(5);

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

        const builder = new DeleteManyOperationBuilder(model);
        const operation = builder.buildOperation(5);

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
  });

  describe('UpdateOneOperationBuilder', function () {
    describe('#buildOperation', function () {
      context('with only required fields', function () {
        const model: ClientUpdateOneModel = {
          name: 'updateOne',
          namespace: 'test.coll',
          filter: { name: 1 },
          update: { $set: { name: 2 } }
        };

        const builder = new UpdateOneOperationBuilder(model);
        const operation = builder.buildOperation(5);

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
          arrayFilters: [{ test: 1 }]
        };

        const builder = new UpdateOneOperationBuilder(model);
        const operation = builder.buildOperation(5);

        it('generates the update operation', function () {
          expect(operation).to.deep.equal({
            update: 5,
            filter: { name: 1 },
            updateMods: { $set: { name: 2 } },
            multi: false,
            hint: 'test',
            upsert: true,
            arrayFilters: [{ test: 1 }]
          });
        });
      });
    });
  });

  describe('UpdateManyOperationBuilder', function () {
    describe('#buildOperation', function () {
      context('with only required fields', function () {
        const model: ClientUpdateManyModel = {
          name: 'updateMany',
          namespace: 'test.coll',
          filter: { name: 1 },
          update: { $set: { name: 2 } }
        };

        const builder = new UpdateManyOperationBuilder(model);
        const operation = builder.buildOperation(5);

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
          arrayFilters: [{ test: 1 }]
        };

        const builder = new UpdateManyOperationBuilder(model);
        const operation = builder.buildOperation(5);

        it('generates the update operation', function () {
          expect(operation).to.deep.equal({
            update: 5,
            filter: { name: 1 },
            updateMods: { $set: { name: 2 } },
            multi: true,
            hint: 'test',
            upsert: true,
            arrayFilters: [{ test: 1 }]
          });
        });
      });
    });
  });

  describe('ReplaceOneOperationBuilder', function () {
    describe('#buildOperation', function () {
      context('with only required fields', function () {
        const model: ClientReplaceOneModel = {
          name: 'replaceOne',
          namespace: 'test.coll',
          filter: { name: 1 },
          replacement: { name: 2 }
        };

        const builder = new ReplaceOneOperationBuilder(model);
        const operation = builder.buildOperation(5);

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
          upsert: true
        };

        const builder = new ReplaceOneOperationBuilder(model);
        const operation = builder.buildOperation(5);

        it('generates the update operation', function () {
          expect(operation).to.deep.equal({
            update: 5,
            filter: { name: 1 },
            updateMods: { name: 2 },
            multi: false,
            hint: 'test',
            upsert: true
          });
        });
      });
    });
  });
});
