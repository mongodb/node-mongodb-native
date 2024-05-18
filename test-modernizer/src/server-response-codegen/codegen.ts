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
    const result: {
      type: string;
      required: boolean;
      lazy: boolean;
      name: string;
      deserializeOptions?: Record<string, boolean>;
    }[] = [];

    const fieldSchema = joi.object({
      type: joi.string().required(),
      required: joi.boolean().default(false),
      lazy: joi.boolean().default(false),
      deserializeOptions: joi.object()
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
      typeLiteral: 'bigint',
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
      typeLiteral: 'bigint',
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

  if (bsonType === 'deserializedObject') {
    switch (representation) {
      case 'on demand bson access type':
        return ts.factory.createPropertyAccessExpression(
          ts.factory.createIdentifier('BSONType'),
          'object'
        );
      case 'type literal node':
        return ts.factory.createTypeReferenceNode('Document');
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

function accessThis(property: string, initializer: ts.Expression): ts.ExpressionStatement {
  return ts.factory.createExpressionStatement(
    ts.factory.createAssignment(
      ts.factory.createPropertyAccessChain(
        ts.factory.createIdentifier('this'),
        undefined,
        property
      ),
      initializer
    )
  );
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

      const statement = (() => {
        if (property.type === 'deserializedObject') {
          return makeOpaqueObjectInitializationExpression(property);
        }
        if (property.type === 'number') {
          return [ts.factory.createReturnStatement(makeGetNumber(property))];
        }
        const initializer = getType(property.type)
          ? makeOnDemandBSONAccess(property)
          : getBSONType(property.type, 'on demand bson access type');

        return [ts.factory.createReturnStatement(initializer)];
      })();

      return ts.factory.createGetAccessorDeclaration(
        [],
        property.name,
        [],
        typeNode,
        ts.factory.createBlock([...statement])
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

  function makeGetNumber(property: (typeof model)['properties'][number]): ts.Expression {
    const required = property.required ? ts.factory.createTrue() : ts.factory.createFalse();
    return ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(
        ts.factory.createPropertyAccessExpression(ts.factory.createThis(), 'response'),
        'getNumber'
      ),
      [] /** type arguments */,
      [ts.factory.createStringLiteral(property.name), required]
    );
  }
  function makeOpaqueObjectInitializationExpression(
    property: (typeof model)['properties'][number]
  ): ts.Statement[] {
    // this.response.get(<name>, BSONType.object, required?);
    const onDemandAccessExpression = makeOnDemandBSONAccess(property);
    const deserializationOptions =
      property.deserializeOptions &&
      ts.factory.createObjectLiteralExpression(
        Object.entries(property.deserializeOptions).map(([option, value]) => {
          return ts.factory.createPropertyAssignment(
            option,
            value ? ts.factory.createTrue() : ts.factory.createFalse()
          );
        })
      );
    if (property.required) {
      // <onDemandAccessExpression>.toObject(...);
      if (property.lazy) {
        return [
          ts.factory.createReturnStatement(
            ts.factory.createCallExpression(
              ts.factory.createPropertyAccessExpression(onDemandAccessExpression, 'toObject'),
              [],
              deserializationOptions ? [deserializationOptions] : []
            )
          )
        ];
      }
      return [
        accessThis(
          property.name,
          ts.factory.createCallExpression(
            ts.factory.createPropertyAccessExpression(onDemandAccessExpression, 'toObject'),
            [],
            deserializationOptions ? [deserializationOptions] : []
          )
        )
      ];
    }

    const assignment = ts.factory.createVariableStatement(
      [],
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            property.name,
            undefined,
            undefined,
            onDemandAccessExpression
          )
        ],
        ts.NodeFlags.Const
      )
    );

    const callExpression = ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(
        ts.factory.createIdentifier(property.name),
        'toObject'
      ),
      [],
      deserializationOptions ? [deserializationOptions] : []
    );

    const ifStatement = ts.factory.createIfStatement(
      ts.factory.createBinaryExpression(
        ts.factory.createIdentifier(property.name),
        ts.SyntaxKind.ExclamationEqualsToken,
        ts.factory.createNull()
      ),
      ts.factory.createBlock([
        property.lazy
          ? ts.factory.createReturnStatement(callExpression)
          : accessThis(property.name, callExpression)
      ])
    );

    return property.lazy
      ? [assignment, ifStatement, ts.factory.createReturnStatement(ts.factory.createNull())]
      : [assignment, ifStatement];
  }

  function makeConstructor(): ts.ConstructorDeclaration {
    const constructorAssignedProperties = constructorProperties.flatMap(property => {
      if (property.type === 'deserializedObject') {
        return makeOpaqueObjectInitializationExpression(property);
      }
      if (property.type === 'number') {
        return [accessThis(property.name, makeGetNumber(property))];
      }
      const initializer = getType(property.type)
        ? makeOnDemandBSONAccess(property)
        : getBSONType(property.type, 'on demand bson access type');

      return [accessThis(property.name, initializer)];
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
