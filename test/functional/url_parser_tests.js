'use strict';

/*!
 * Module dependencies.
 */
var parse = require('../../lib/url_parser');
var expect = require('chai').expect;

describe('Url Parser', function() {
  /**
   * @ignore
   */
  it('should correctly parse mongodb://localhost', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      parse('mongodb://localhost/', {}, function(err, object) {
        expect(err).to.be.null;
        expect(object.servers).to.have.length(1);
        expect(object.servers[0].host).to.equal('localhost');
        expect(object.servers[0].port).to.equal(27017);
        expect(object.dbName).to.equal('admin');
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly parse mongodb://localhost:27017', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      parse('mongodb://localhost:27017/', {}, function(err, object) {
        expect(err).to.be.null;
        expect(object.servers).to.have.length(1);
        expect(object.servers[0].host).to.equal('localhost');
        expect(object.servers[0].port).to.equal(27017);
        expect(object.dbName).to.equal('admin');
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly parse mongodb://localhost:27017test?appname=hello%20world', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      parse('mongodb://localhost:27017/test?appname=hello%20world', {}, function(err, object) {
        expect(err).to.be.null;
        expect(object.appname).to.equal('hello world');
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly parse mongodb://localhost/?safe=true&readPreference=secondary', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      parse('mongodb://localhost/?safe=true&readPreference=secondary', {}, function(err, object) {
        expect(err).to.be.null;
        expect(object.servers).to.have.length(1);
        expect(object.servers[0].host).to.equal('localhost');
        expect(object.servers[0].port).to.equal(27017);
        expect(object.dbName).to.equal('admin');
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly parse mongodb://localhost:28101/', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      parse('mongodb://localhost:28101/', {}, function(err, object) {
        expect(err).to.be.null;
        expect(object.servers).to.have.length(1);
        expect(object.servers[0].host).to.equal('localhost');
        expect(object.servers[0].port).to.equal(28101);
        expect(object.dbName).to.equal('admin');
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly parse mongodb://fred:foobar@localhost/baz', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      parse('mongodb://fred:foobar@localhost/baz', {}, function(err, object) {
        expect(err).to.be.null;
        expect(object.servers).to.have.length(1);
        expect(object.servers[0].host).to.equal('localhost');
        expect(object.servers[0].port).to.equal(27017);
        expect(object.dbName).to.equal('baz');
        expect(object.auth.user).to.equal('fred');
        expect(object.auth.password).to.equal('foobar');
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly parse mongodb://fred:foo%20bar@localhost/baz', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      parse('mongodb://fred:foo%20bar@localhost/baz', {}, function(err, object) {
        expect(err).to.be.null;
        expect(object.servers).to.have.length(1);
        expect(object.servers[0].host).to.equal('localhost');
        expect(object.servers[0].port).to.equal(27017);
        expect(object.dbName).to.equal('baz');
        expect(object.auth.user).to.equal('fred');
        expect(object.auth.password).to.equal('foo bar');
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly parse mongodb://%2Ftmp%2Fmongodb-27017.sock', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      parse('mongodb://%2Ftmp%2Fmongodb-27017.sock', {}, function(err, object) {
        expect(err).to.be.null;
        expect(object.servers).to.have.length(1);
        expect(object.servers[0].domain_socket).to.equal('/tmp/mongodb-27017.sock');
        expect(object.dbName).to.equal('admin');
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly parse mongodb://fred:foo@%2Ftmp%2Fmongodb-27017.sock', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      parse('mongodb://fred:foo@%2Ftmp%2Fmongodb-27017.sock', {}, function(err, object) {
        expect(err).to.be.null;
        expect(object.servers).to.have.length(1);
        expect(object.servers[0].domain_socket).to.equal('/tmp/mongodb-27017.sock');
        expect(object.dbName).to.equal('admin');
        expect(object.auth.user).to.equal('fred');
        expect(object.auth.password).to.equal('foo');
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly parse mongodb://fred:foo@%2Ftmp%2Fmongodb-27017.sock/somedb', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      parse('mongodb://fred:foo@%2Ftmp%2Fmongodb-27017.sock/somedb', {}, function(err, object) {
        expect(err).to.be.null;
        expect(object.servers).to.have.length(1);
        expect(object.servers[0].domain_socket).to.equal('/tmp/mongodb-27017.sock');
        expect(object.dbName).to.equal('somedb');
        expect(object.auth.user).to.equal('fred');
        expect(object.auth.password).to.equal('foo');
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly parse mongodb://fred:foo@%2Ftmp%2Fmongodb-27017.sock/somedb?safe=true', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      parse('mongodb://fred:foo@%2Ftmp%2Fmongodb-27017.sock/somedb?safe=true', {}, function(
        err,
        object
      ) {
        expect(err).to.be.null;
        expect(object.servers).to.have.length(1);
        expect(object.servers[0].domain_socket).to.equal('/tmp/mongodb-27017.sock');
        expect(object.dbName).to.equal('somedb');
        expect(object.auth.user).to.equal('fred');
        expect(object.auth.password).to.equal('foo');
        expect(object.db_options.safe).to.be.true;
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly parse mongodb://example1.com:27017,example2.com:27018', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      parse('mongodb://example1.com:27017,example2.com:27018', {}, function(err, object) {
        expect(err).to.be.null;
        expect(object.servers).to.have.length(2);
        expect(object.servers[0].host).to.equal('example1.com');
        expect(object.servers[0].port).to.equal(27017);
        expect(object.servers[1].host).to.equal('example2.com');
        expect(object.servers[1].port).to.equal(27018);
        expect(object.dbName).to.equal('admin');
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly parse mongodb://localhost,localhost:27018,localhost:27019', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      parse('mongodb://localhost,localhost:27018,localhost:27019', {}, function(err, object) {
        expect(err).to.be.null;
        expect(object.servers).to.have.length(3);
        expect(object.servers[0].host).to.equal('localhost');
        expect(object.servers[0].port).to.equal(27017);
        expect(object.servers[1].host).to.equal('localhost');
        expect(object.servers[1].port).to.equal(27018);
        expect(object.servers[2].host).to.equal('localhost');
        expect(object.servers[2].port).to.equal(27019);
        expect(object.dbName).to.equal('admin');
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly parse mongodb://host1,host2,host3/?slaveOk=true', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      parse('mongodb://host1,host2,host3/?slaveOk=true', {}, function(err, object) {
        expect(err).to.be.null;
        expect(object.servers).to.have.length(3);
        expect(object.servers[0].host).to.equal('host1');
        expect(object.servers[0].port).to.equal(27017);
        expect(object.servers[1].host).to.equal('host2');
        expect(object.servers[1].port).to.equal(27017);
        expect(object.servers[2].host).to.equal('host3');
        expect(object.servers[2].port).to.equal(27017);
        expect(object.dbName).to.equal('admin');
        expect(object.server_options.slave_ok).to.be.true;
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it(
    'should correctly parse mongodb://host1,host2,host3,host1/?slaveOk=true and de-duplicate names',
    {
      metadata: {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },

      test: function(done) {
        parse('mongodb://host1,host2,host3,host1/?slaveOk=true', {}, function(err, object) {
          expect(err).to.be.null;
          expect(object.servers).to.have.length(3);
          expect(object.servers[0].host).to.equal('host1');
          expect(object.servers[0].port).to.equal(27017);
          expect(object.servers[1].host).to.equal('host2');
          expect(object.servers[1].port).to.equal(27017);
          expect(object.servers[2].host).to.equal('host3');
          expect(object.servers[2].port).to.equal(27017);
          expect(object.dbName).to.equal('admin');
          expect(object.server_options.slave_ok).to.be.true;
          done();
        });
      }
    }
  );

  /**
   * @ignore
   */
  it('should correctly parse mongodb://localhost/?safe=true', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      parse('mongodb://localhost/?safe=true', {}, function(err, object) {
        expect(err).to.be.null;
        expect(object.servers).to.have.length(1);
        expect(object.servers[0].host).to.equal('localhost');
        expect(object.servers[0].port).to.equal(27017);
        expect(object.dbName).to.equal('admin');
        expect(object.db_options.safe).to.be.true;
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly parse mongodb://host1,host2,host3/?safe=true;w=2;wtimeoutMS=2000', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      parse('mongodb://host1,host2,host3/?safe=true;w=2;wtimeoutMS=2000', {}, function(
        err,
        object
      ) {
        expect(err).to.be.null;
        expect(object.servers).to.have.length(3);
        expect(object.servers[0].host).to.equal('host1');
        expect(object.servers[0].port).to.equal(27017);
        expect(object.servers[1].host).to.equal('host2');
        expect(object.servers[1].port).to.equal(27017);
        expect(object.servers[2].host).to.equal('host3');
        expect(object.servers[2].port).to.equal(27017);
        expect(object.dbName).to.equal('admin');
        expect(object.db_options.safe).to.be.true;
        expect(object.db_options.w).to.equal(2);
        expect(object.db_options.wtimeout).to.equal(2000);
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it(
    'should parse mongodb://localhost/db?replicaSet=hello&ssl=prefer&connectTimeoutMS=1000&socketTimeoutMS=2000',
    {
      metadata: {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },

      test: function(done) {
        parse(
          'mongodb://localhost/db?replicaSet=hello&ssl=prefer&connectTimeoutMS=1000&socketTimeoutMS=2000',
          {},
          function(err, object) {
            expect(err).to.be.null;
            expect(object.servers).to.have.length(1);
            expect(object.servers[0].host).to.equal('localhost');
            expect(object.servers[0].port).to.equal(27017);
            expect(object.dbName).to.equal('db');
            expect(object.rs_options.rs_name).to.equal('hello');
            expect(object.server_options.socketOptions.connectTimeoutMS).to.equal(1000);
            expect(object.server_options.socketOptions.socketTimeoutMS).to.equal(2000);
            expect(object.rs_options.socketOptions.connectTimeoutMS).to.equal(1000);
            expect(object.rs_options.socketOptions.socketTimeoutMS).to.equal(2000);
            expect(object.rs_options.ssl).to.equal('prefer');
            expect(object.server_options.ssl).to.equal('prefer');
            done();
          }
        );
      }
    }
  );

  /**
   * @ignore
   */
  it('should parse mongodb://localhost/db?ssl=true', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      parse('mongodb://localhost/db?ssl=true', {}, function(err, object) {
        expect(err).to.be.null;
        expect(object.servers).to.have.length(1);
        expect(object.servers[0].host).to.equal('localhost');
        expect(object.servers[0].port).to.equal(27017);
        expect(object.dbName).to.equal('db');
        expect(object.rs_options.ssl).to.be.true;
        expect(object.server_options.ssl).to.be.true;
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('should parse mongodb://localhost/db?maxPoolSize=100', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      parse('mongodb://localhost/db?maxPoolSize=100', {}, function(err, object) {
        expect(err).to.be.null;
        expect(object.servers).to.have.length(1);
        expect(object.servers[0].host).to.equal('localhost');
        expect(object.servers[0].port).to.equal(27017);
        expect(object.dbName).to.equal('db');
        expect(object.rs_options.poolSize).to.equal(100);
        expect(object.server_options.poolSize).to.equal(100);
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('should parse mongodb://localhost/db?w=-1', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      parse('mongodb://localhost/db?w=-1', {}, function(err, object) {
        expect(err).to.be.null;
        expect(object.servers).to.have.length(1);
        expect(object.servers[0].host).to.equal('localhost');
        expect(object.servers[0].port).to.equal(27017);
        expect(object.dbName).to.equal('db');
        expect(object.db_options.w).to.equal(-1);
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it(
    'should be able to parse mongodb://localhost/?compressors=snappy, with one compressor specified',
    {
      metadata: {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },

      test: function(done) {
        parse('mongodb://localhost/?compressors=snappy', {}, function(err, object) {
          expect(err).to.be.null;
          expect(object.servers).to.have.length(1);
          expect(object.servers[0].host).to.equal('localhost');
          expect(object.servers[0].port).to.equal(27017);
          expect(object.dbName).to.equal('admin');
          expect(object.server_options.compression.compressors[0]).to.equal('snappy');
          done();
        });
      }
    }
  );

  /**
   * @ignore
   */
  it(
    'should be able to parse mongodb://localhost/?zlibCompressionLevel=-1 without issuing a warning',
    {
      metadata: {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },

      test: function(done) {
        parse('mongodb://localhost/?zlibCompressionLevel=-1 ', {}, function(err, object) {
          expect(err).to.be.null;
          expect(object.servers).to.have.length(1);
          expect(object.servers[0].host).to.equal('localhost');
          expect(object.servers[0].port).to.equal(27017);
          expect(object.dbName).to.equal('admin');
          expect(object.server_options.compression.zlibCompressionLevel).to.equal(-1);
          done();
        });
      }
    }
  );

  /**
   * @ignore
   */
  it(
    'should be able to parse mongodb://localhost/?compressors=snappy&zlibCompressionLevel=3 without issuing a warning',
    {
      metadata: {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },

      test: function(done) {
        parse('mongodb://localhost/?compressors=snappy&zlibCompressionLevel=3', {}, function(
          err,
          object
        ) {
          expect(err).to.be.null;
          expect(object.servers).to.have.length(1);
          expect(object.servers[0].host).to.equal('localhost');
          expect(object.servers[0].port).to.equal(27017);
          expect(object.dbName).to.equal('admin');
          expect(object.server_options.compression.compressors[0]).to.equal('snappy');
          expect(object.server_options.compression.zlibCompressionLevel).to.equal(3);
          done();
        });
      }
    }
  );

  /**
   * @ignore
   */
  it(
    'should be able to parse mongodb://localhost/?compressors=snappy,zlib&zlibCompressionLevel=-1',
    {
      metadata: {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },

      test: function(done) {
        parse('mongodb://localhost/?compressors=snappy,zlib&zlibCompressionLevel=-1', {}, function(
          err,
          object
        ) {
          expect(err).to.be.null;
          expect(object.servers).to.have.length(1);
          expect(object.servers[0].host).to.equal('localhost');
          expect(object.servers[0].port).to.equal(27017);
          expect(object.dbName).to.equal('admin');
          expect(object.server_options.compression.compressors[0]).to.equal('snappy');
          expect(object.server_options.compression.compressors[1]).to.equal('zlib');
          expect(object.server_options.compression.zlibCompressionLevel).to.equal(-1);
          done();
        });
      }
    }
  );

  /**
   * @ignore
   */
  it(
    'should throw an error when parsing mongodb://localhost/?compressors=foo, where foo is an unsuported compressor',
    {
      metadata: {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },

      test: function(done) {
        // Should throw due to unsupported compressor
        parse('mongodb://localhost/?compressors=foo', {}, function(err) {
          expect(err).to.exist;
          expect(err.message).to.equal('compressors must be at least one of snappy or zlib');
          done();
        });
      }
    }
  );

  /**
   * @ignore
   */
  it(
    'should throw an error when parsing mongodb://localhost/?zlibCompressionLevel=10, where the integer is out of the specified bounds',
    {
      metadata: {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },

      test: function(done) {
        // Should throw due to unsupported compressor
        parse('mongodb://localhost/?zlibCompressionLevel=10', {}, function(err) {
          expect(err).to.exist;
          expect(err.message).to.equal('zlibCompressionLevel must be an integer between -1 and 9');
          done();
        });
      }
    }
  );

  /**
   * @ignore
   */
  it('should log when unsuported options are used in url', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      var self = this,
        Logger = self.configuration.require.Logger,
        logged = false;

      Logger.setCurrentLogger(function(msg, context) {
        expect(msg).to.exist;
        expect(msg).to.contain('not supported');
        expect(context.type).to.equal('warn');
        expect(context.className).to.equal('URL Parser');
        logged = true;
      });

      Logger.setLevel('warn');

      parse('mongodb://localhost/db?minPoolSize=100', {}, function() {
        expect(logged).to.be.true;
        parse('mongodb://localhost/db?maxIdleTimeMS=100', {}, function() {
          expect(logged).to.be.true;
          parse('mongodb://localhost/db?waitQueueMultiple=100', {}, function() {
            expect(logged).to.be.true;
            parse('mongodb://localhost/db?waitQueueTimeoutMS=100', {}, function() {
              expect(logged).to.be.true;
              parse('mongodb://localhost/db?uuidRepresentation=1', {}, function() {
                expect(logged).to.be.true;
                done();
              });
            });
          });
        });
      });

      Logger.reset();
    }
  });

  /**
   * @ignore
   */
  it('should write concerns parsing', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      parse('mongodb://localhost/db?safe=true&w=1', {}, function(err, object) {
        expect(err).to.be.null;
        expect(object.db_options.safe).to.be.true;
        parse('mongodb://localhost/db?safe=false&w=1', {}, function(err, object) {
          expect(err).to.be.null;
          expect(object.db_options.safe).to.be.false;
          // should throw as fireAndForget is set aswell as safe or any other
          // write concerns
          parse('mongodb://localhost/db?safe=true&w=0', {}, function(err) {
            expect(err).to.exist;
            expect(err.message).to.equal(
              'w set to -1 or 0 cannot be combined with safe/w/journal/fsync'
            );
            parse('mongodb://localhost/db?fsync=true&w=-1', {}, function(err) {
              expect(err).to.exist;
              expect(err.message).to.equal(
                'w set to -1 or 0 cannot be combined with safe/w/journal/fsync'
              );
              done();
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should parse GSSAPI', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      parse('mongodb://dev1%4010GEN.ME@kdc.10gen.com/test?authMechanism=GSSAPI', {}, function(
        err,
        object
      ) {
        expect(err).to.be.null;
        expect(object.auth).to.eql({ user: 'dev1@10GEN.ME', password: null });
        expect(object.db_options.authMechanism).to.equal('GSSAPI');
        // Should throw due to missing principal
        parse('mongodb://kdc.10gen.com/test?authMechanism=GSSAPI', {}, function(err) {
          expect(err).to.exist;
          expect(err.message).to.equal('GSSAPI requires a provided principal');
          // Should throw due to unsupported mechanism
          parse('mongodb://kdc.10gen.com/test?authMechanism=NONE', {}, function(err) {
            expect(err).to.exist;
            expect(err.message).to.equal(
              'only DEFAULT, GSSAPI, PLAIN, MONGODB-X509, SCRAM-SHA-1 or MONGODB-CR is supported by authMechanism'
            );
            parse(
              'mongodb://dev1%4010GEN.ME:test@kdc.10gen.com/test?authMechanism=GSSAPI',
              {},
              function(err, object) {
                expect(err).to.be.null;
                expect(object.auth).to.eql({ user: 'dev1@10GEN.ME', password: 'test' });
                expect(object.db_options.authMechanism).to.equal('GSSAPI');
                done();
              }
            );
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Read preferences parsing', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      parse('mongodb://localhost/db?slaveOk=true', {}, function(err, object) {
        expect(object.server_options.slave_ok).to.be.true;
        parse('mongodb://localhost/db?readPreference=primary', {}, function(err, object) {
          expect(object.db_options.readPreference).to.equal('primary');
          parse('mongodb://localhost/db?readPreference=primaryPreferred', {}, function(
            err,
            object
          ) {
            expect(object.db_options.readPreference).to.equal('primaryPreferred');
            parse('mongodb://localhost/db?readPreference=secondary', {}, function(err, object) {
              expect(object.db_options.readPreference).to.equal('secondary');
              parse('mongodb://localhost/db?readPreference=secondaryPreferred', {}, function(
                err,
                object
              ) {
                expect(object.db_options.readPreference).to.equal('secondaryPreferred');
                parse('mongodb://localhost/db?readPreference=nearest', {}, function(err, object) {
                  expect(object.db_options.readPreference).to.equal('nearest');
                  parse('mongodb://localhost/db', {}, function(err, object) {
                    expect(object.db_options.readPreference).to.equal('primary');
                    parse('mongodb://localhost/db?readPreference=blah', {}, function(err) {
                      expect(err).to.exist;
                      expect(err.message).to.equal(
                        'readPreference must be either primary/primaryPreferred/secondary/secondaryPreferred/nearest'
                      );
                      done();
                    });
                  });
                });
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Read preferences tag parsing', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      parse('mongodb://localhost/db', {}, function(err, object) {
        expect(object.db_options.read_preference_tags).to.be.null;
        parse('mongodb://localhost/db?readPreferenceTags=dc:ny', {}, function(err, object) {
          expect(object.db_options.read_preference_tags).to.eql([{ dc: 'ny' }]);
          parse('mongodb://localhost/db?readPreferenceTags=dc:ny,rack:1', {}, function(
            err,
            object
          ) {
            expect(object.db_options.read_preference_tags).to.eql([{ dc: 'ny', rack: '1' }]);
            parse(
              'mongodb://localhost/db?readPreferenceTags=dc:ny,rack:1&readPreferenceTags=dc:sf,rack:2',
              {},
              function(err, object) {
                expect(object.db_options.read_preference_tags).to.eql([
                  { dc: 'ny', rack: '1' },
                  { dc: 'sf', rack: '2' }
                ]);
                parse(
                  'mongodb://localhost/db?readPreferenceTags=dc:ny,rack:1&readPreferenceTags=dc:sf,rack:2&readPreferenceTags=',
                  {},
                  function(err, object) {
                    expect(object.db_options.read_preference_tags).to.eql([
                      { dc: 'ny', rack: '1' },
                      { dc: 'sf', rack: '2' },
                      {}
                    ]);
                    done();
                  }
                );
              }
            );
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly parse mongodb://[::1]:1234', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      parse('mongodb://[::1]:1234', {}, function(err, object) {
        expect(err).to.be.null;
        expect(object.servers).to.have.length(1);
        expect(object.servers[0].host).to.equal('::1');
        expect(object.servers[0].port).to.equal(1234);
        expect(object.dbName).to.equal('admin');
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly parse mongodb://[::1]', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      parse('mongodb://[::1]', {}, function(err, object) {
        expect(err).to.be.null;
        expect(object.servers).to.have.length(1);
        expect(object.servers[0].host).to.equal('::1');
        expect(object.servers[0].port).to.equal(27017);
        expect(object.dbName).to.equal('admin');
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly parse mongodb://localhost,[::1]:27018,[2607:f0d0:1002:51::41]', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      parse('mongodb://localhost,[::1]:27018,[2607:f0d0:1002:51::41]', {}, function(err, object) {
        expect(err).to.be.null;
        expect(object.servers).to.have.length(3);
        expect(object.servers[0].host).to.equal('localhost');
        expect(object.servers[0].port).to.equal(27017);
        expect(object.servers[1].host).to.equal('::1');
        expect(object.servers[1].port).to.equal(27018);
        expect(object.servers[2].host).to.equal('2607:f0d0:1002:51::41');
        expect(object.servers[2].port).to.equal(27017);
        expect(object.dbName).to.equal('admin');
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly parse mongodb://k?y:foo@%2Ftmp%2Fmongodb-27017.sock/somedb?safe=true', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      parse('mongodb://k%3Fy:foo@%2Ftmp%2Fmongodb-27017.sock/somedb?safe=true', {}, function(
        err,
        object
      ) {
        expect(err).to.be.null;
        expect(object.auth.user).to.equal('k?y');
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it(
    'should correctly parse uriencoded k?y mongodb://k%3Fy:foo@%2Ftmp%2Fmongodb-27017.sock/somedb?safe=true',
    {
      metadata: {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },

      test: function(done) {
        parse('mongodb://k%3Fy:foo@%2Ftmp%2Fmongodb-27017.sock/somedb?safe=true', {}, function(
          err,
          object
        ) {
          expect(err).to.be.null;
          expect(object.auth.user).to.equal('k?y');
          done();
        });
      }
    }
  );

  /**
   * @ignore
   */
  it(
    'should correctly parse username kay:kay mongodb://kay%3Akay:foo@%2Ftmp%2Fmongodb-27017.sock/somedb?safe=true',
    {
      metadata: {
        requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
      },

      test: function(done) {
        parse('mongodb://kay%3Akay:foo@%2Ftmp%2Fmongodb-27017.sock/somedb?safe=true', {}, function(
          err,
          object
        ) {
          expect(err).to.be.null;
          expect(object.auth.user).to.equal('kay:kay');
          done();
        });
      }
    }
  );

  /**
   * @ignore
   */
  it('should use options passed into url parsing', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },
    test: function(done) {
      parse('mongodb://localhost/', { readPreference: 'secondary' }, function(err, object) {
        expect(err).to.be.null;
        expect(object.db_options.readPreference).to.equal('secondary');
        done();
      });
    }
  });
});

describe('Url SRV Parser', function() {
  /**
   * @ignore
   */
  it('should allow for multiple SRV records', {
    metadata: {
      requires: { topology: ['single'] }
    },
    test: function(done) {
      // This url has 2 srv records, no txt records
      // mongodb://localhost.build.10gen.cc:27018,localhost.build.10gen.cc:27017
      parse('mongodb+srv://test1.test.build.10gen.cc', {}, function(err, object) {
        var servers = [
          { host: 'localhost.build.10gen.cc', port: 27017 },
          { host: 'localhost.build.10gen.cc', port: 27018 }
        ];

        expect(err).to.be.null;
        expect(object).to.exist;
        expect(object.servers).to.have.deep.members(servers);
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('should handle srv records with non standard ports', {
    metadata: {
      requires: { topology: ['single'] }
    },
    test: function(done) {
      // This url has 2 srv records, no txt records
      // mongodb://localhost.build.10gen.cc:27018,localhost.build.10gen.cc:27017
      parse('mongodb+srv://test2.test.build.10gen.cc', {}, function(err, object) {
        var servers = [
          { host: 'localhost.build.10gen.cc', port: 27018 },
          { host: 'localhost.build.10gen.cc', port: 27019 }
        ];
        expect(err).to.be.null;
        expect(object).to.exist;
        expect(object.servers).to.have.deep.members(servers);
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('should handle one srv result with default port', {
    metadata: {
      requires: { topology: ['single'] }
    },
    test: function(done) {
      // This url has no txt records
      parse('mongodb+srv://test3.test.build.10gen.cc', {}, function(err, object) {
        expect(err).to.be.null;
        expect(object).to.exist;
        expect(object.servers[0].host).to.equal('localhost.build.10gen.cc');
        expect(object.servers[0].port).to.equal(27017);
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('should error because no srv records for this uri', {
    metadata: {
      requires: { topology: ['single'] }
    },
    test: function(done) {
      // This url has no srv records
      parse('mongodb+srv://test4.test.build.10gen.cc', {}, function(err) {
        expect(err).to.exist;
        expect(err.code).to.equal('ENOTFOUND');
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('should error if port is included in SRV URL', {
    metadata: {
      requires: { topology: ['single'] }
    },
    test: function(done) {
      parse('mongodb+srv://test5.test.build.10gen.cc:27017', {}, function(err) {
        expect(err).to.exist;
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('should fail with uri with two host names', {
    metadata: {
      requires: { topology: ['single'] }
    },
    test: function(done) {
      parse('mongodb+srv://test5.test.build.10gen.cc,test6.test.build.10gen.cc', {}, function(err) {
        expect(err).to.exist;
        expect(err.message).to.equal('invalid uri, cannot contain multiple hostnames');
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('should handle a single text record with multiple options', {
    metadata: {
      requires: { topology: ['single'] }
    },
    test: function(done) {
      // This text record contains two options
      // connectTimeoutMS=300000&socketTimeoutMS=300000
      parse('mongodb+srv://test5.test.build.10gen.cc', {}, function(err, object) {
        var serverOptions = {
          socketOptions: { connectTimeoutMS: 300000, socketTimeoutMS: 300000 }
        };
        expect(err).to.be.null;
        expect(object.server_options).to.deep.equal(serverOptions);
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('should build a connection string based on SRV and TXT records', {
    metadata: {
      requires: { topology: ['single'] }
    },
    test: function(done) {
      // This url has txt and srv records
      // mongodb://localhost.build.10gen.cc:27017/?connectTimeoutMS=200000&socketTimeoutMS=200000
      parse('mongodb+srv://test6.test.build.10gen.cc', {}, function(err, object) {
        expect(err).to.be.null;
        expect(object).to.exist;
        expect(object.servers[0].host).to.equal('localhost.build.10gen.cc');
        expect(object.servers[0].port).to.equal(27017);
        expect(object.server_options.socketOptions.connectTimeoutMS).to.equal(200000);
        expect(object.server_options.socketOptions.socketTimeoutMS).to.equal(200000);
        done();
      });
    }
  });

  // /**
  //  * @ignore
  //  */
  // it('should handle text record with listable option override', {
  //   metadata: {
  //     requires: { topology: ['single'] }
  //   },
  //   test: function(done) {
  //     // TODO Test server has not been updated
  //     // mongodb+srv://test7.test.build.10gen.cc/?replicaSet=repl0&readPreferenceTags=dc:fr,item:cheese&readPreferenceTags=dc:de,item:hotdog
  //     parse('mongodb+srv://test7.test.build.10gen.cc', {}, function(err, object) {
  //       console.dir(object, { depth: 5 });
  //       expect(err).to.exist;
  //       done();
  //     });
  //   }
  // });

  /**
   * @ignore
   */
  it('should error when a key with no value', {
    metadata: {
      requires: { topology: ['single'] }
    },
    test: function(done) {
      // This text record key contains no value
      // readPreference
      parse('mongodb+srv://test8.test.build.10gen.cc', {}, function(err) {
        expect(err).to.exist;
        expect(err.message).to.equal('query parameter readPreference is an incomplete value pair');
        done();
      });
    }
  });
});
