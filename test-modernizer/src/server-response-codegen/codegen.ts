import assert from 'assert';
import { readFile } from 'fs/promises';
import * as joi from 'joi';
import { load } from 'js-yaml';
import * as ts from 'typescript';

const BSON_TYPES = {
  int64: 'bigint',
  array: 'OnDemandArray',
  string: 'string',
  null: 'null',
  undefined: 'null',
  double: 'number',
  int32: 'number',
  timestamp: 'Timestamp',
  binData: 'Binary',
  boolean: 'boolean',
  objectId: 'ObjectId',
  date: 'Date',
  object: 'OnDemandDocument'
};

export function readInputSchema(input: Record<string, unknown>) {
  const classes: ReturnType<typeof Model>[] = [];

  function Model(className: string, object: any) {
    const result: {
      type: string;
      required: boolean;
      lazy: boolean;
      name: string;
      deserializeOptions?: Record<string, boolean>;
      cache: boolean;
    }[] = [];

    const fieldSchema = joi.object({
      type: joi.string().required(),
      required: joi.boolean().default(false),
      lazy: joi.boolean().default(false),
      deserializeOptions: joi.object(),
      cache: joi.boolean().default(false)
    });

    for (const [property, definition] of Object.entries(object)) {
      joi.assert(definition, fieldSchema);
      const { value: schema } = fieldSchema.validate(definition, { stripUnknown: true });

      if (!schema.lazy && schema.cache) {
        throw new Error(`property ${property} specifies cache: true and lazy: false`);
      }
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

function typeMetadata(property: ReturnType<typeof readInputSchema>[number]['properties'][number]) {
  if (property.type in BSON_TYPES) return 'bson type' as const;
  if (property.type === 'number') return 'flexible number';
  if (property.type === 'deserializedObject') return 'eagerly deserialized object';
  return 'custom class reference';
}

/**
 * Determines the typescript "type" of a property.  For example, an `int64` property will have
 * a type of `bigint`.
 */
function tsTypeRepresentationFactory() {
  const BSON_TYPES: {
    [key: string]: string;
  } = {
    int64: 'bigint',
    array: 'OnDemandArray',
    string: 'string',
    null: 'null',
    undefined: 'null',
    double: 'number',
    int32: 'number',
    timestamp: 'Timestamp',
    binData: 'Binary',
    boolean: 'boolean',
    objectId: 'ObjectId',
    date: 'Date',
    object: 'OnDemandDocument'
  };

  function getType(
    property: ReturnType<typeof readInputSchema>[number]['properties'][number]
  ): string {
    switch (typeMetadata(property)) {
      case 'bson type':
        return BSON_TYPES[property.type];
      case 'flexible number':
        return 'number';
      case 'eagerly deserialized object':
        return 'Document';
      case 'custom class reference':
        return property.type;
    }
  }

  return function (
    property: ReturnType<typeof readInputSchema>[number]['properties'][number]
  ): ts.TypeReferenceNode | ts.UnionTypeNode {
    const type = ts.factory.createTypeReferenceNode(getType(property));

    if (property.required) return type;

    return ts.factory.createUnionTypeNode([
      type,
      ts.factory.createLiteralTypeNode(ts.factory.createNull())
    ]);
  };
}

function getBSONTypeEnumForProperty() {
  const BSON_TYPES: {
    [key: string]: string;
  } = {
    int64: 'long',
    array: 'array',
    string: 'string',
    null: 'null',
    undefined: 'undefined',
    double: 'double',
    int32: 'int',
    timestamp: 'timestamp',
    binData: 'binData',
    boolean: 'bool',
    objectId: 'objectId',
    date: 'date',
    object: 'object'
  };

  function getType(property: ReturnType<typeof readInputSchema>[number]['properties'][number]) {
    switch (typeMetadata(property)) {
      case 'bson type':
        return BSON_TYPES[property.type];
      case 'flexible number':
        return 'number';
      case 'eagerly deserialized object':
        return 'object';
      case 'custom class reference':
        // in the else case, we support a reference to another generated class
        throw new Error(`attempted to get bson type enum for unknown type: ${property.type}`);
    }
  }

  return function (property: ReturnType<typeof readInputSchema>[number]['properties'][number]) {
    const type = getType(property);
    return ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('BSONType'), type);
  };
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
): ts.PropertyAccessExpression | ts.NewExpression {
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
    }
  }

  if (bsonType === 'deserializedObject') {
    switch (representation) {
      case 'on demand bson access type':
        return ts.factory.createPropertyAccessExpression(
          ts.factory.createIdentifier('BSONType'),
          'object'
        );
    }
  }
  // not a known BSON type - wrapper type.
  switch (representation) {
    case 'on demand bson access type':
      return ts.factory.createNewExpression(ts.factory.createIdentifier(bsonType), undefined, [
        ts.factory.createPropertyAccessExpression(ts.factory.createThis(), 'response')
      ]);
  }
}

function accessThis(
  property: string | ts.Identifier,
  initializer: ts.Expression
): ts.ExpressionStatement {
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

  function makePropertyGetters(): (ts.GetAccessorDeclaration | ts.PropertyDeclaration)[] {
    return getterProperties.flatMap(property => {
      assert(property.lazy);

      const typeNode = tsTypeRepresentationFactory()(property);

      const statement = (() => {
        if (property.type === 'deserializedObject') {
          return makeOpaqueObjectInitializationExpression(property);
        }
        if (property.type === 'number') {
          return [ts.factory.createReturnStatement(makeGetNumber(property))];
        }
        const initializer = getType(property.type)
          ? makeOnDemandBSONAccess(property)
          : getBSONTypeEnumForProperty()(property);

        return [ts.factory.createReturnStatement(initializer)];
      })();

      if (property.cache && !property.required) {
        // private ___<property name>?: <type>;
        const cacheProperty = ts.factory.createIdentifier(`___${property.name}`);
        const cache = ts.factory.createPropertyDeclaration(
          [ts.factory.createModifier(ts.SyntaxKind.PrivateKeyword)],
          cacheProperty,
          ts.factory.createToken(ts.SyntaxKind.QuestionToken),
          typeNode,
          undefined
        );

        // eslint-disable-next-line no-inner-declarations
        function makeDeserializedObject() {
          // this.response.get(<name>, BSONType.object, false);
          const initializer = makeOnDemandBSONAccess({ ...property, type: 'object' });

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
          const toObjectCall = ts.factory.createCallChain(
            ts.factory.createPropertyAccessChain(
              initializer,
              ts.factory.createToken(ts.SyntaxKind.QuestionDotToken),
              'toObject'
            ),
            undefined,
            [],
            deserializationOptions ? [deserializationOptions] : []
          );

          return ts.factory.createBinaryExpression(
            toObjectCall,
            ts.SyntaxKind.QuestionQuestionToken,
            ts.factory.createNull()
          );
        }
        const initializer =
          property.type === 'number'
            ? makeGetNumber(property)
            : property.type === 'deserializedObject'
            ? makeDeserializedObject()
            : getType(property.type)
            ? makeOnDemandBSONAccess(property)
            : getBSONType(property.type, 'on demand bson access type');

        // this.<cache> = ....
        const cacheAssignment = accessThis(cacheProperty, initializer);

        const cacheGuardCondition = ts.factory.createPrefixUnaryExpression(
          ts.SyntaxKind.ExclamationToken,
          ts.factory.createBinaryExpression(
            ts.factory.createStringLiteral(`___${property.name}`),
            ts.SyntaxKind.InKeyword,
            ts.factory.createThis()
          )
        );
        // if (!(cache name> in this)) { ... }
        const ifStatement = ts.factory.createIfStatement(cacheGuardCondition, cacheAssignment);

        const getter = ts.factory.createGetAccessorDeclaration(
          [],
          property.name,
          [],
          typeNode,
          ts.factory.createBlock([
            ifStatement,
            ts.factory.createReturnStatement(
              ts.factory.createBinaryExpression(
                ts.factory.createPropertyAccessExpression(ts.factory.createThis(), cacheProperty),
                ts.SyntaxKind.QuestionQuestionToken,
                ts.factory.createNull()
              )
            )
          ])
        );

        return [cache, getter];
      }

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
      // this.response.get
      ts.factory.createPropertyAccessExpression(
        ts.factory.createPropertyAccessExpression(ts.factory.createThis(), 'response'),
        'get'
      ),
      [] /** type arguments */,
      [
        ts.factory.createStringLiteral(property.name),
        getBSONTypeEnumForProperty()(property),
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
      const typeNode = tsTypeRepresentationFactory()(property);

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
