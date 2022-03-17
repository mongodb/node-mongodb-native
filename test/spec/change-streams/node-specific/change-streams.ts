import { UnifiedSuite } from '../../../tools/unified-spec-runner/schema';

export const suite: UnifiedSuite = {
  description: 'change-streams',
  schemaVersion: '1.0',
  runOnRequirements: [
    {
      topologies: ['replicaset', 'sharded-replicaset']
    }
  ],
  createEntities: [
    {
      client: {
        id: 'client0',
        observeEvents: ['commandStartedEvent']
      }
    },
    {
      database: {
        id: 'database0',
        client: 'client0',
        databaseName: 'database0'
      }
    },
    {
      collection: {
        id: 'collection0',
        database: 'database0',
        collectionName: 'collection0'
      }
    }
  ],
  initialData: [
    {
      collectionName: 'collection0',
      databaseName: 'database0',
      documents: []
    }
  ],
  tests: [
    {
      description: 'Test with document comment',
      runOnRequirements: [
        {
          minServerVersion: '4.4'
        }
      ],
      operations: [
        {
          name: 'createChangeStream',
          object: 'collection0',
          arguments: {
            pipeline: [],
            comment: {
              name: 'test1'
            }
          },
          saveResultAsEntity: 'changeStream0'
        }
      ],
      expectEvents: [
        {
          client: 'client0',
          events: [
            {
              commandStartedEvent: {
                command: {
                  aggregate: 'collection0',
                  pipeline: [
                    {
                      $changeStream: {}
                    }
                  ],
                  comment: {
                    name: 'test1'
                  }
                }
              }
            },
            {
              commandStartedEvent: {
                command: {
                  getMore: {
                    $$type: ['int', 'long']
                  },
                  collection: 'collection0',
                  comment: {
                    name: 'test1'
                  }
                },
                commandName: 'getMore',
                databaseName: 'database0'
              }
            }
          ]
        }
      ]
    },
    {
      description: 'Test with document comment - pre 4.4',
      runOnRequirements: [
        {
          minServerVersion: '3.6.0',
          maxServerVersion: '4.2.99'
        }
      ],
      operations: [
        {
          name: 'createChangeStream',
          object: 'collection0',
          arguments: {
            pipeline: [],
            comment: {
              name: 'test1'
            }
          },
          expectError: {
            isClientError: false
          }
        }
      ],
      expectEvents: [
        {
          client: 'client0',
          events: [
            {
              commandStartedEvent: {
                command: {
                  aggregate: 'collection0',
                  pipeline: [
                    {
                      $changeStream: {}
                    }
                  ],
                  comment: {
                    name: 'test1'
                  }
                }
              }
            }
          ]
        }
      ]
    },
    {
      description: 'Test with string comment',
      runOnRequirements: [
        {
          minServerVersion: '3.6.0'
        }
      ],
      operations: [
        {
          name: 'createChangeStream',
          object: 'collection0',
          arguments: {
            pipeline: [],
            comment: 'comment'
          },
          saveResultAsEntity: 'changeStream0'
        }
      ],
      expectEvents: [
        {
          client: 'client0',
          events: [
            {
              commandStartedEvent: {
                command: {
                  aggregate: 'collection0',
                  pipeline: [
                    {
                      $changeStream: {}
                    }
                  ],
                  comment: 'comment'
                }
              }
            },
            {
              commandStartedEvent: {
                command: {
                  getMore: {
                    $$type: ['int', 'long']
                  },
                  collection: 'collection0',
                  comment: 'comment'
                },
                commandName: 'getMore',
                databaseName: 'database0'
              }
            }
          ]
        }
      ]
    },
    {
      description: 'Test that comment is set on getMore',
      runOnRequirements: [
        {
          minServerVersion: '4.4.0',
          topologies: ['single', 'replicaset']
        }
      ],
      operations: [
        {
          name: 'createChangeStream',
          object: 'collection0',
          arguments: {
            pipeline: [],
            comment: 'comment'
          },
          saveResultAsEntity: 'changeStream0'
        },
        {
          name: 'insertOne',
          object: 'collection0',
          arguments: {
            document: {
              _id: 1,
              a: 1
            }
          }
        },
        {
          name: 'iterateUntilDocumentOrError',
          object: 'changeStream0'
        }
      ],
      expectEvents: [
        {
          client: 'client0',
          events: [
            {
              commandStartedEvent: {
                command: {
                  aggregate: 'collection0',
                  pipeline: [
                    {
                      $changeStream: {}
                    }
                  ],
                  comment: 'comment'
                }
              }
            },
            {
              commandStartedEvent: {
                command: {
                  getMore: {
                    $$type: ['int', 'long']
                  },
                  collection: 'collection0',
                  comment: 'comment'
                },
                commandName: 'getMore',
                databaseName: 'database0'
              }
            },
            {
              commandStartedEvent: {
                command: {
                  insert: 'collection0',
                  documents: [
                    {
                      _id: 1,
                      a: 1
                    }
                  ]
                }
              }
            },
            {
              commandStartedEvent: {
                command: {
                  getMore: {
                    $$type: ['int', 'long']
                  },
                  collection: 'collection0',
                  comment: 'comment'
                },
                commandName: 'getMore',
                databaseName: 'database0'
              }
            }
          ]
        }
      ]
    }
  ]
};
