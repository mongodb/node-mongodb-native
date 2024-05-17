import assert from 'assert';
import { readFile } from 'fs/promises';
import * as joi from 'joi';
import { load } from 'js-yaml';
import * as ts from 'typescript';

async function readYaml(filename: string): Promise<any> {
  const contents = await readFile(filename, 'utf-8');
  return load(contents);
}

export function readInputSchema(input: Record<string, unknown>) {
  const classes: ReturnType<typeof Model>[] = [];

  function Model(className: string, object: any) {
    const result: { type: string; required: boolean; lazy: boolean; name: string }[] = [];

    const fieldSchema = joi.object({
      type: joi.string().required(),
      required: joi.boolean().default(false),
      lazy: joi.boolean().default(false)
    });

    for (const [property, definition] of Object.entries(object)) {
      joi.assert(definition, fieldSchema);
      const { value: schema } = fieldSchema.validate(definition, { stripUnknown: true });

      result.push(
        Object.assign(Object.create(null), {
          ...schema,
          name: property
        })
      );
    }

    return {
      className,
      properties: result
    };
  }

  for (const [className, properties] of Object.entries(input)) {
    if (typeof properties !== 'object') throw new Error('definition must be an object');

    const model = Model(className, properties);
    classes.push(model);
  }

  return classes;
}

export async function readSpecification(filename: string) {
  return readInputSchema(await readYaml(filename));
}

function getType(bsonType: string) {
  const BSON_TYPES: {
    [key: string]: {
      typeLiteral: string;
      bsonType: string;
    };
  } = {
    int64: {
      typeLiteral: 'BigInt',
      bsonType: 'long'
    },
    array: {
      typeLiteral: 'OnDemandArray',
      bsonType: 'array'
    },
    string: {
      typeLiteral: 'string',
      bsonType: 'string'
    },
    null: {
      typeLiteral: 'null',
      bsonType: 'null'
    },
    undefined: {
      typeLiteral: 'null',
      bsonType: 'undefined'
    },
    double: {
      typeLiteral: 'number',
      bsonType: 'double'
    },
    int32: {
      typeLiteral: 'number',
      bsonType: 'int'
    },
    timestamp: {
      typeLiteral: 'Timestamp',
      bsonType: 'timestamp'
    },
    binData: {
      typeLiteral: 'Binary',
      bsonType: 'binData'
    },
    boolean: {
      typeLiteral: 'boolean',
      bsonType: 'bool'
    },
    objectId: {
      typeLiteral: 'ObjectId',
      bsonType: 'objectId'
    },
    date: {
      typeLiteral: 'Date',
      bsonType: 'date'
    },
    object: {
      typeLiteral: 'OnDemandDocument',
      bsonType: 'object'
    }
  };
  return bsonType in BSON_TYPES;
}

function getBSONType(
  bsonType: string,
  representation: 'on demand bson access type'
): ts.PropertyAccessExpression | ts.NewExpression;
function getBSONType(bsonType: string, representation: 'type literal node'): ts.TypeReferenceNode;
function getBSONType(
  bsonType: string,
  representation: 'on demand bson access type' | 'type literal node'
): ts.TypeReferenceNode | ts.PropertyAccessExpression | ts.NewExpression {
  const BSON_TYPES: {
    [key: string]: {
      typeLiteral: string;
      bsonType: string;
    };
  } = {
    int64: {
      typeLiteral: 'BigInt',
      bsonType: 'long'
    },
    array: {
      typeLiteral: 'OnDemandArray',
      bsonType: 'array'
    },
    string: {
      typeLiteral: 'string',
      bsonType: 'string'
    },
    null: {
      typeLiteral: 'null',
      bsonType: 'null'
    },
    undefined: {
      typeLiteral: 'null',
      bsonType: 'undefined'
    },
    double: {
      typeLiteral: 'number',
      bsonType: 'double'
    },
    int32: {
      typeLiteral: 'number',
      bsonType: 'int'
    },
    timestamp: {
      typeLiteral: 'Timestamp',
      bsonType: 'timestamp'
    },
    binData: {
      typeLiteral: 'Binary',
      bsonType: 'binData'
    },
    boolean: {
      typeLiteral: 'boolean',
      bsonType: 'bool'
    },
    objectId: {
      typeLiteral: 'ObjectId',
      bsonType: 'objectId'
    },
    date: {
      typeLiteral: 'Date',
      bsonType: 'date'
    },
    object: {
      typeLiteral: 'OnDemandDocument',
      bsonType: 'object'
    }
  };

  const type = BSON_TYPES[bsonType];
  if (type) {
    switch (representation) {
      case 'on demand bson access type':
        return ts.factory.createPropertyAccessExpression(
          ts.factory.createIdentifier('BSONType'),
          type.bsonType
        );
      case 'type literal node':
        return ts.factory.createTypeReferenceNode(type.typeLiteral);
    }
  }
  // not a known BSON type - wrapper type.
  switch (representation) {
    case 'on demand bson access type':
      return ts.factory.createNewExpression(ts.factory.createIdentifier(bsonType), undefined, [
        ts.factory.createPropertyAccessExpression(ts.factory.createThis(), 'response')
      ]);
    case 'type literal node':
      return ts.factory.createTypeReferenceNode(bsonType);
  }
}

function generateClassDefinition(
  model: ReturnType<typeof readInputSchema>[number]
): ts.ClassDeclaration {
  const { properties: modelProperties } = model;
  const properties: ts.ClassElement[] = [];

  const getterProperties = modelProperties.filter(property => property.lazy);
  const constructorProperties = modelProperties.filter(property => !property.lazy);

  function makePropertyGetters() {
    return getterProperties.map(property => {
      assert(property.lazy);

      const literal = getBSONType(property.type, 'type literal node');

      const typeNode = property.required
        ? literal
        : ts.factory.createUnionTypeNode([
            literal,
            ts.factory.createLiteralTypeNode(ts.factory.createNull())
          ]);

      return ts.factory.createGetAccessorDeclaration(
        [],
        property.name,
        [],
        typeNode,
        ts.factory.createBlock([ts.factory.createReturnStatement(makeOnDemandBSONAccess(property))])
      );
    });
  }

  function makeOnDemandBSONAccess(property: (typeof model)['properties'][number]): ts.Expression {
    const required = property.required ? ts.factory.createTrue() : ts.factory.createFalse();
    return ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(
        ts.factory.createPropertyAccessExpression(ts.factory.createThis(), 'response'),
        'get'
      ),
      [] /** type arguments */,
      [
        ts.factory.createStringLiteral(property.name),
        getBSONType(property.type, 'on demand bson access type'),
        required
      ]
    );
  }

  function makeConstructor(): ts.ConstructorDeclaration {
    const constructorAssignedProperties = constructorProperties.map(property => {
      const initializer = getType(property.type)
        ? makeOnDemandBSONAccess(property)
        : getBSONType(property.type, 'on demand bson access type');
      return ts.factory.createExpressionStatement(
        ts.factory.createAssignment(
          ts.factory.createPropertyAccessChain(
            ts.factory.createIdentifier('this'),
            undefined,
            property.name
          ),
          initializer
        )
      );
    });

    return ts.factory.createConstructorDeclaration(
      [] /** modifiers */,
      [
        ts.factory.createParameterDeclaration(
          [
            ts.factory.createModifier(ts.SyntaxKind.PrivateKeyword),
            ts.factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)
          ],
          undefined,
          'response',
          undefined,
          ts.factory.createTypeReferenceNode('MongoDBResponse')
        )
      ],
      ts.factory.createBlock([...constructorAssignedProperties]) /** body */
    );
  }

  function makeConstructedFieldPropertyDeclarations() {
    return constructorProperties.map(property => {
      const literal = getBSONType(property.type, 'type literal node');
      const typeNode = property.required
        ? literal
        : ts.factory.createUnionTypeNode([
            literal,
            ts.factory.createLiteralTypeNode(ts.factory.createNull())
          ]);

      const initializer = property.required ? undefined : ts.factory.createNull();

      return ts.factory.createPropertyDeclaration(
        [ts.factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)],
        property.name,
        undefined,
        typeNode,
        initializer
      );
    });
  }

  properties.push(
    ...makePropertyGetters(),
    ...makeConstructedFieldPropertyDeclarations(),
    makeConstructor()
  );

  return ts.factory.createClassDeclaration(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    model.className,
    [] /** type parameters  */,
    [] /** heritige clauses */,
    properties
  );
}

export function generateModelClasses(schema: ReturnType<typeof readInputSchema>): ts.SourceFile {
  const statements: ts.Statement[] = [];

  for (const model of schema) {
    statements.push(generateClassDefinition(model));
  }

  const sourceFile = ts.factory.createSourceFile(
    statements,
    ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
    ts.NodeFlags.None
  );

  return sourceFile;
}

// function onDemandBSONGet(name: string, bsonType: string, required: boolean) {
//   const _bsonType = getBSONType(bsonType);
//   const _required = required ? ts.factory.createTrue() : ts.factory.createFalse();
//   const call = ts.factory.createCallExpression(
//     ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('response'), 'get'),
//     undefined,
//     [ts.factory.createStringLiteral(name), _bsonType, _required]
//   );

//   const assignment = ts.factory.createAssignment(
//     ts.factory.createPropertyAccessExpression(ts.factory.createThis(), name),
//     call
//   );

//   return assignment;
// }

// class ClassDefinitionBuilder {
//   exported?: boolean;
//   private members: ts.ClassElement[] = [];
//   private constructorInitilizers: ts.Statement[] = [];

//   constructor(private name: string) {
//     this.name = name;
//   }

//   addMember(member: ts.ClassElement) {
//     this.members.push(member);
//   }

//   addInit(init: ts.Statement) {
//     this.constructorInitilizers.push(init);
//   }

//   build() {
//     const exported = this.exported ? [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)] : [];
//     const constructor_ = ts.factory.createConstructorDeclaration(
//       undefined,
//       [
//         ts.factory.createParameterDeclaration(
//           undefined,
//           undefined,
//           'response',
//           undefined,
//           ts.factory.createTypeReferenceNode('MongoDBResponse'),
//           undefined /** initializer */
//         )
//       ],
//       ts.factory.createBlock(this.constructorInitilizers, true /** multiline */)
//     );
//     return ts.factory.createClassDeclaration(exported, this.name, undefined, undefined, [
//       ...this.members,
//       constructor_
//     ]);
//   }
// }

// async function main(sourceFile: string, destination: string) {
//   const contents = await readYaml(sourceFile);

//   const classDef = {
//     name: 'Cursor',
//     fields: {
//       id: {
//         type: 'int64',
//         required: true
//       },
//       namespace: {
//         type: 'string',
//         required: false
//       },
//       firstBatch: {
//         type: 'array',
//         required: false
//       },
//       nextBatch: {
//         type: 'array',
//         required: false
//       }
//     }
//   };

//   const { name, fields } = classDef;
//   const builder = new ClassDefinitionBuilder(name);
//   builder.exported = true;
//   for (const [field, definition] of Object.entries(fields)) {
//     const node = ts.factory.createPropertyDeclaration(
//       /** modifiers */ undefined,
//       field,
//       /** required? */ undefined,
//       ts.factory.createKeywordTypeNode(ts.SyntaxKind.BigIntKeyword),
//       undefined
//     );

//     const _initStatement = onDemandBSONGet(field, definition.type, definition.required);

//     builder.addMember(node);
//     builder.addInit(ts.factory.createExpressionStatement(_initStatement));
//   }

//   const _class = builder.build();

//   //   await write(_class, destination);
//   //   log(await write(onDemandBSONGet('id', 'int64', true), 'out.txt'));
//   //   log(await write(_class, 'methods.txt'));
//   console.log(await formatSource(_class));
// }

`
function _throw(e: Error): never {
  throw e;
}

class Cursor {
  id: bigint;
  namespace: string | null;
  batch: OnDemandDocument;
  constructor(response: OnDemandDocument) {
    this.id = response.get('id', BSONType.long, true);
    this.namespace = response.get('namespace', BSONType.string);
    this.batch =
      response.get('firstBatch', BSONType.array) ??
      response.get('nextBatch', BSONType.array) ??
      _throw(new Error('ahhh'));
  }
}

export class CursorResponse2<T> implements ICursorIterable<T> {
  private cursor: Cursor;
  batchSize: number;
  private iterated = 0;

  get ns() {
    return this.cursor.namespace ? ns(this.cursor.namespace) : null;
  }

  constructor(response: MongoDBResponse) {
    this.cursor = new Cursor(response.get('cursor', BSONType.object, true));
    this.batchSize = this.cursor.batch.size();
  }

  shift(options?: BSONSerializeOptions): any {
    if (this.iterated >= this.batchSize) {
      return null;
    }

    const result = this.cursor.batch.get(this.iterated, BSONType.object, true) ?? null;
    this.iterated += 1;

    if (options?.raw) {
      return result.toBytes();
    } else {
      return result.toObject(options);
    }
  }

  get length() {
    return Math.max(this.batchSize - this.iterated, 0);
  }

  clear() {
    this.iterated = this.batchSize;
  }

  pushMany() {
    throw new Error('pushMany Unsupported method');
  }

  push() {
    throw new Error('push Unsupported method');
  }
}


class Hello {
  isWriteablePrimary: boolean;
  connectionId: bigint;
  reply: Document;
  hosts: OnDemandArray | null;
  passives: OnDemandArray | null;
  arbiters: OnDemandArray | null;
  tags: OnDemandDocument | null;

  minWireVersion: number;
  maxWireVersion: number;

  lastWrite: number | null;

  topologyVersion: unknown;

  setName: string | null;
  setVersion: OnDemandDocument | null;
  electionId: ObjectId | null;
  logicalSessionTimeoutMinutes: number | null;
  primary: string | null;
  me: string | null;

  $clusterTime: ClusterTime | null;

  constructor(response: MongoDBResponse) {
    this.isWriteablePrimary = response.get('isWriteablePrimary', BSONType.bool, true);
    this.connectionId = response.get('connectionId', BSONType.long, true);
    this.reply = response.get('reply', BSONType.object, true);
    this.hosts = response.get('hosts', BSONType.array);
    this.passives = response.get('passives', BSONType.array);
    this.arbiters = response.get('arbiters', BSONType.array);

    // TODO - figure out how to make this have optional defaults
    this.tags = response.get('tags', BSONType.object);
    this.minWireVersion = response.getNumber('minWireVersion', true);
    this.maxWireVersion = response.getNumber('maxWireVersion', true);

    this.lastWrite = response.get('lastWrite', BSONType.object)?.getNumber('lastWriteDate') ?? null;
    this.setName = response.get('setName', BSONType.string);
    this.setVersion = response.get('setVersion', BSONType.object);
    this.electionId = response.get('electionId', BSONType.objectId);

    this.logicalSessionTimeoutMinutes = response.getNumber('logicalSessionTimeoutMinutes');
    this.primary = response.get('primary', BSONType.string);
    this.me = response.get('me', BSONType.string);

    this.$clusterTime = response.$clusterTime;
  }
}

`;
