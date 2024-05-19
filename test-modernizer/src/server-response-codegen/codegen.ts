import assert from 'assert';
import * as joi from 'joi';
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

export type Model = ReturnType<typeof readInputSchema>;
export type ModelProperty = Model[number]['properties'][number];

function typeMetadata(property: ModelProperty) {
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

  function getType(property: ModelProperty): string {
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

  return function (property: ModelProperty): ts.TypeReferenceNode | ts.UnionTypeNode {
    const type = ts.factory.createTypeReferenceNode(getType(property));

    if (property.required) return type;

    return ts.factory.createUnionTypeNode([
      type,
      ts.factory.createLiteralTypeNode(ts.factory.createNull())
    ]);
  };
}

function getInitializationForClassReference(property: ModelProperty) {
  const className = property.type;
  return ts.factory.createNewExpression(ts.factory.createIdentifier(className), undefined, [
    ts.factory.createPropertyAccessExpression(ts.factory.createThis(), 'response')
  ]);
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

  function getType(property: ModelProperty) {
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

  return function (property: ModelProperty) {
    const type = getType(property);
    return ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('BSONType'), type);
  };
}

function assignPropertyOntoThis(
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

/**
 * Constructs a call to OnDemandDocument's `getNumber` method, if the property has specified a
 * general type of "number".
 *
 * i.e.,
 *
 * ```typescript
 * this.response.getNumber(<property name>, <required?>)
 * ```
 */
function makeGetNumber(property: ModelProperty): ts.Expression {
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

function makeForcedDeserializationExpression(property: ModelProperty): ts.Expression {
  /**
   * constructs an AST object literal containing the BSON deserialization options for the property.
   */
  function makeDeserializationOptions(): ts.ObjectLiteralExpression {
    return (
      property.deserializeOptions &&
      ts.factory.createObjectLiteralExpression(
        Object.entries(property.deserializeOptions).map(([option, value]) => {
          return ts.factory.createPropertyAssignment(
            option,
            value ? ts.factory.createTrue() : ts.factory.createFalse()
          );
        })
      )
    );
  }
  // this.response.get(<name>, BSONType.object, required?);
  const onDemandAccessExpression = makeOnDemandBSONAccess(property);
  const deserializationOptions = makeDeserializationOptions();

  if (property.required) {
    // <onDemandAccessExpression>.toObject(...);
    const callExpression = ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(onDemandAccessExpression, 'toObject'),
      [],
      deserializationOptions ? [deserializationOptions] : []
    );
    return callExpression;
  }

  // <onDemandAccessExpression>()?.toObject();
  const toObjectCall = ts.factory.createCallChain(
    ts.factory.createPropertyAccessChain(
      onDemandAccessExpression,
      ts.factory.createToken(ts.SyntaxKind.QuestionDotToken),
      'toObject'
    ),
    undefined,
    [],
    deserializationOptions ? [deserializationOptions] : []
  );

  // <onDemandAccessExpression>()?.toObject() ?? null;
  return ts.factory.createBinaryExpression(
    toObjectCall,
    ts.SyntaxKind.QuestionQuestionToken,
    ts.factory.createNull()
  );
}

/**
 * Given a property, constructs a getter AST Node that gets the property.
 *
 * the general structure for a required property is:
 * get <propertyName>(): <type node> {
 *   return this.response.get(<property name>, <bson enum access type>, true);
 * }
 *
 * the general structure for an optional property is:
 * get <propertyName>(): <type node> {
 *   return this.response.get(<property name>, <bson enum access type>, false) ?? null;
 * }
 */
function makeGetterProperty(property: ModelProperty) {
  assert(property.lazy);

  const typeNode = tsTypeRepresentationFactory()(property);

  function getterBody(): ts.Statement[] {
    switch (typeMetadata(property)) {
      case 'bson type':
        return [ts.factory.createReturnStatement(makeOnDemandBSONAccess(property))];
      case 'flexible number':
        return [ts.factory.createReturnStatement(makeGetNumber(property))];
      case 'eagerly deserialized object':
        return [ts.factory.createReturnStatement(makeForcedDeserializationExpression(property))];
      case 'custom class reference':
        return [ts.factory.createReturnStatement(getInitializationForClassReference(property))];
    }
  }

  // TODO: Add caching logic in second pass of AST
  // if (property.cache && !property.required) {
  //   // private ___<property name>?: <type>;
  //   const cacheProperty = ts.factory.createIdentifier(`___${property.name}`);
  //   const cache = ts.factory.createPropertyDeclaration(
  //     [ts.factory.createModifier(ts.SyntaxKind.PrivateKeyword)],
  //     cacheProperty,
  //     ts.factory.createToken(ts.SyntaxKind.QuestionToken),
  //     typeNode,
  //     undefined
  //   );

  //   // eslint-disable-next-line no-inner-declarations
  //   function makeDeserializedObject() {
  //     // this.response.get(<name>, BSONType.object, false);
  //     const initializer = makeOnDemandBSONAccess({ ...property, type: 'object' });

  //     const deserializationOptions =
  //       property.deserializeOptions &&
  //       ts.factory.createObjectLiteralExpression(
  //         Object.entries(property.deserializeOptions).map(([option, value]) => {
  //           return ts.factory.createPropertyAssignment(
  //             option,
  //             value ? ts.factory.createTrue() : ts.factory.createFalse()
  //           );
  //         })
  //       );
  //     const toObjectCall = ts.factory.createCallChain(
  //       ts.factory.createPropertyAccessChain(
  //         initializer,
  //         ts.factory.createToken(ts.SyntaxKind.QuestionDotToken),
  //         'toObject'
  //       ),
  //       undefined,
  //       [],
  //       deserializationOptions ? [deserializationOptions] : []
  //     );

  //     return ts.factory.createBinaryExpression(
  //       toObjectCall,
  //       ts.SyntaxKind.QuestionQuestionToken,
  //       ts.factory.createNull()
  //     );
  //   }
  //   const initializer =
  //     property.type === 'number'
  //       ? makeGetNumber(property)
  //       : property.type === 'deserializedObject'
  //       ? makeDeserializedObject()
  //       : getType(property.type)
  //       ? makeOnDemandBSONAccess(property)
  //       : getBSONType(property.type, 'on demand bson access type');

  //   // this.<cache> = ....
  //   const cacheAssignment = accessThis(cacheProperty, initializer);

  //   const cacheGuardCondition = ts.factory.createPrefixUnaryExpression(
  //     ts.SyntaxKind.ExclamationToken,
  //     ts.factory.createBinaryExpression(
  //       ts.factory.createStringLiteral(`___${property.name}`),
  //       ts.SyntaxKind.InKeyword,
  //       ts.factory.createThis()
  //     )
  //   );
  //   // if (!(cache name> in this)) { ... }
  //   const ifStatement = ts.factory.createIfStatement(cacheGuardCondition, cacheAssignment);

  //   const getter = ts.factory.createGetAccessorDeclaration(
  //     [],
  //     property.name,
  //     [],
  //     typeNode,
  //     ts.factory.createBlock([
  //       ifStatement,
  //       ts.factory.createReturnStatement(
  //         ts.factory.createBinaryExpression(
  //           ts.factory.createPropertyAccessExpression(ts.factory.createThis(), cacheProperty),
  //           ts.SyntaxKind.QuestionQuestionToken,
  //           ts.factory.createNull()
  //         )
  //       )
  //     ])
  //   );

  //   return [cache, getter];
  // }

  return ts.factory.createGetAccessorDeclaration(
    [],
    property.name,
    [],
    typeNode,
    ts.factory.createBlock(getterBody())
  );
}

function makeOnDemandBSONAccess(property: ModelProperty): ts.Expression {
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

function makeConstructor(properties: Model[number]['properties']): ts.ConstructorDeclaration {
  const constructorAssignedProperties = properties.flatMap(property => {
    assert(!property.lazy, 'cannot create a constructor initializer for a non-lazy property.');
    switch (typeMetadata(property)) {
      case 'bson type':
        return [assignPropertyOntoThis(property.name, makeOnDemandBSONAccess(property))];
      case 'flexible number':
        return [assignPropertyOntoThis(property.name, makeGetNumber(property))];

      case 'eagerly deserialized object':
        return [
          assignPropertyOntoThis(property.name, makeForcedDeserializationExpression(property))
        ];

      case 'custom class reference':
        return [
          assignPropertyOntoThis(property.name, getInitializationForClassReference(property))
        ];
    }
  });

  // `private readonly response: MongoDBResponse`
  const mongodbResponseParameter = ts.factory.createParameterDeclaration(
    [
      ts.factory.createModifier(ts.SyntaxKind.PrivateKeyword),
      ts.factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)
    ],
    undefined,
    'response',
    undefined,
    ts.factory.createTypeReferenceNode('MongoDBResponse')
  );
  return ts.factory.createConstructorDeclaration(
    [] /** modifiers */,
    [mongodbResponseParameter],
    ts.factory.createBlock(constructorAssignedProperties) /** body */
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
    return getterProperties.flatMap(makeGetterProperty);
  }

  function makeConstructorDeclaration() {
    return makeConstructor(constructorProperties);
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
    makeConstructorDeclaration()
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
