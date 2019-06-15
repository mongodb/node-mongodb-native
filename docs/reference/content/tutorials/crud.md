+++
date = "2015-03-19T12:53:30-04:00"
title = "CRUD Operations"
[menu.main]
  parent = "Tutorials"
  identifier = "CRUD Operations"
  weight = 40
  pre = "<i class='fa'></i>"
+++

# CRUD Operations

For a walkthrough of the main CRUD operations please refer to the
[Quick Start guide]({{< ref "quick-start/quick-start.md" >}}).

Driver CRUD operations are defined as the operations performed to create, read, update, and delete documents.
This tutorial covers both the basic CRUD methods and the specialized ``findAndModify`` based methods
as well as the new Bulk API methods for efficient bulk write operations.

<div class="pull-right">
  <input type="checkbox" checked="" class="distroPicker" data-toggle="toggle" data-on="ES2015" data-off="ES2017" data-offstyle="success">
</div>


## Write Methods

Write methods are divided into those which insert documents into a collection, those which update
documents in a collection, and those which remove documents from a collection.

### Insert Documents

The ``insertOne`` and ``insertMany`` methods exist on the ``Collection`` class and are used to insert documents into MongoDB.



<section class="javascript5"><pre><code class="hljs">
{{% myproject-connect %}}

  // Insert a single document
  db.collection('inserts').insertOne({a:1}, function(err, r) {
    assert.equal(null, err);
    assert.equal(1, r.insertedCount);

    // Insert multiple documents
    db.collection('inserts').insertMany([{a:2}, {a:3}], function(err, r) {
      assert.equal(null, err);
      assert.equal(2, r.insertedCount);

      client.close();
    });
  });
});

</code></pre></section>
<section class="javascript6 hidden"><pre><code class="hljs">
{{% js6-connect %}}

    // Insert a single document
    let r = await db.collection('inserts').insertOne({a:1});
    assert.equal(1, r.insertedCount);

    // Insert multiple documents
    var r = await db.collection('inserts').insertMany([{a:2}, {a:3}]);
    assert.equal(2, r.insertedCount);

    // Close connection
    client.close();
  } catch(err) {
    console.log(err.stack);
  }
})();
</code></pre></section>

The first ``insert`` inserts a single document into the *inserts* collection. Notice that there's no need to
explicitly create a new *inserts* collection, as the server will create it implicitly when the first document
is inserted. The method `db.createIndex` is only necessary when creating non-standard collections,
such as [capped collections](https://docs.mongodb.org/manual/core/capped-collections/) or where parameters other
than the defaults are necessary.

The ``insertOne`` and ``insertMany`` methods also accept a second argument which can be an options object. This object can have the following fields:

| Parameter | Type | Description |
| :----------| :------------- | :------------- |
| `w` | {Number/String, > -1 \|\| 'majority'} | the write concern for the operation where < 1 returns an acknowledgment of the write with not results `{ok:1}` and w >= 1 or w = 'majority' acknowledges the write with full write results. |
| `wtimeout` | {Number, 0} | set the timeout for waiting for write concern to finish (combines with w option). |
| `j` | (Boolean, default:false) | write waits for journal sync. |
| `serializeFunctions` | (Boolean, default:false) | serialize functions on an object to mongodb, by default the driver does not serialize any functions on the passed in documents. |
| `forceServerObjectId` | (Boolean, default:false) | Force server to assign _id values instead of driver. |

The following example shows how to serialize a passed-in function when writing to a
[replica set](https://docs.mongodb.org/manual/core/replica-set-members/).

<section class="javascript5"><pre><code class="hljs">
{{% myproject-connect %}}

  // Insert a single document
  db.collection('inserts').insertOne({
        a:1
      , b: function() { return 'hello'; }
    }, {
        w: 'majority'
      , wtimeout: 10000
      , serializeFunctions: true
    }, function(err, r) {
    assert.equal(null, err);
    assert.equal(1, r.insertedCount);
    client.close();
  });
});
</code></pre></section>
<section class="javascript6 hidden"><pre><code class="hljs">
{{% js6-connect %}}

    // Insert a single document
    const r = await db.collection('inserts').insertOne({
          a:1
        , b: function() { return 'hello'; }
      }, {
          w: 'majority'
        , wtimeout: 10000
        , serializeFunctions: true
        , forceServerObjectId: true
      });

    assert.equal(1, r.insertedCount);
    client.close();
  } catch(err) {
    console.log(err.stack);
  }
})();
</code></pre></section>

<a name='specify-data-type'></a>
#### Specify a Data Type

The following example specifies a numerical data type
when inserting documents with the ``insertMany`` method.

{{% note %}}
The Decimal128 data type requires MongoDB server version 3.4 or higher.
{{% /note %}}

<section class="javascript5"><pre><code class="hljs">
const Long = require('mongodb').Long;
const Decimal = require('mongodb').Decimal128;

{{% myproject-connect %}}

  const longValue = Long(1787);
  const decimalValue = Decimal.fromString("27.8892836");

  // Insert multiple documents
  db.collection('numbers').insertMany([ { a : longValue }, { b : decimalValue } ], function(err, r) {
    assert.equal(null, err);
    assert.equal(2, r.insertedCount);
    client.close();
  });
});

</code></pre></section>
<section class="javascript6 hidden"><pre><code class="hljs">
const Long = require('mongodb').Long;
const Decimal = require('mongodb').Decimal128;

{{% js6-connect %}}

    const longValue = Long(1787);
    const decimalValue = Decimal.fromString("27.8892836");

    // Insert multiple documents
    const r = await db.collection('numbers').insertMany([ { a : longValue }, { b : decimalValue } ]);
    assert.equal(2, r.insertedCount);

    // Close connection
    client.close();
  } catch(err) {
    console.log(err.stack);
  }
})();
</code></pre></section>

The above operation inserts the following documents into the
``numbers`` collection:

```js
{ "_id" : ObjectId("57d6f63a98724c65a5d7bd7a"), "a" : NumberLong(1787) }
{ "_id" : ObjectId("57d6f63a98724c65a5d7bd7b"), "b" : NumberDecimal("27.8892836") }
```

### Updating Documents

The ``updateOne`` and ``updateMany`` methods exist on the ``Collection`` class and are used to update and upsert documents.

<section class="javascript5"><pre><code class="hljs">
{{% myproject-connect %}}

  const col = db.collection('updates');
  // Insert multiple documents
  col.insertMany([{a:1}, {a:2}, {a:2}], function(err, r) {
    assert.equal(null, err);
    assert.equal(3, r.insertedCount);

    // Update a single document
    col.updateOne({a:1}, {$set: {b: 1}}, function(err, r) {
      assert.equal(null, err);
      assert.equal(1, r.matchedCount);
      assert.equal(1, r.modifiedCount);

      // Update multiple documents
      col.updateMany({a:2}, {$set: {b: 1}}, function(err, r) {
        assert.equal(null, err);
        assert.equal(2, r.matchedCount);
        assert.equal(2, r.modifiedCount);

        // Upsert a single document
        col.updateOne({a:3}, {$set: {b: 1}}, {
          upsert: true
        }, function(err, r) {
          assert.equal(null, err);
          assert.equal(0, r.matchedCount);
          assert.equal(1, r.upsertedCount);
          client.close();
        });
      });
    });
  });
});
</code></pre></section>
<section class="javascript6 hidden"><pre><code class="hljs">
{{% js6-connect %}}

    // Get the updates collection
    const col = db.collection('updates');
    // Insert multiple documents
    let r = await col.insertMany([{a:1}, {a:2}, {a:2}]);
    assert.equal(3, r.insertedCount);

    // Update a single document
    r = await col.updateOne({a:1}, {$set: {b: 1}});
    assert.equal(1, r.matchedCount);
    assert.equal(1, r.modifiedCount);

    // Update multiple documents
    r = await col.updateMany({a:2}, {$set: {b: 1}});
    assert.equal(2, r.matchedCount);
    assert.equal(2, r.modifiedCount);

    // Upsert a single document
    r = await col.updateOne({a:3}, {$set: {b: 1}}, {
      upsert: true
    });
    assert.equal(0, r.matchedCount);
    assert.equal(1, r.upsertedCount);

    // Close connection
    client.close();
  } catch(err) {
    console.log(err.stack);
  }
})();
</code></pre></section>

The ``update`` method also accepts a third argument which can be an options object. This object can have the following fields:

| Parameter | Type | Description |
| :----------| :------------- | :------------- |
| `w` | {Number/String, > -1 \|\| 'majority'} | the write concern for the operation where < 1 returns an acknowledgment of the write with not results `{ok:1}` and w >= 1 or w = 'majority' acknowledges the write with full write results. |
| `wtimeout` | {Number, 0} | set the timeout for waiting for write concern to finish (combines with w option). |
| `j` | (Boolean, default:false) | write waits for journal sync. |
| `multi` | (Boolean, default:false) | Update one/all documents with operation. |
| `upsert` | (Boolean, default:false) | Update operation is an upsert. |

Just as for ``insert``, the ``update`` method allows you to specify a per operation write concern using the ``w``, ``wtimeout`` and ``fsync`` parameters.

### Removing Documents

The ``deleteOne`` and ``deleteMany`` methods exist on the ``Collection`` class and are used to remove documents from MongoDB.

<section class="javascript5"><pre><code class="hljs">
{{% myproject-connect %}}

  const col = db.collection('removes');
  // Insert multiple documents
  col.insertMany([{a:1}, {a:2}, {a:2}], function(err, r) {
    assert.equal(null, err);
    assert.equal(3, r.insertedCount);

    // Remove a single document
    col.deleteOne({a:1}, function(err, r) {
      assert.equal(null, err);
      assert.equal(1, r.deletedCount);

      // Update multiple documents
      col.deleteMany({a:2}, function(err, r) {
        assert.equal(null, err);
        assert.equal(2, r.deletedCount);
        client.close();
      });
    });
  });
});
</code></pre></section>
<section class="javascript6 hidden"><pre><code class="hljs">
{{% js6-connect %}}

    // Get the removes collection
    const col = db.collection('removes');
    // Insert multiple documents
    let r = await col.insertMany([{a:1}, {a:2}, {a:2}]);
    assert.equal(3, r.insertedCount);

    // Remove a single document
    r = await col.deleteOne({a:1});
    assert.equal(1, r.deletedCount);

    // Update multiple documents
    r = await col.deleteMany({a:2});
    assert.equal(2, r.deletedCount);

    // Close connection
    client.close();
  } catch(err) {
    console.log(err.stack);
  }
})();
</code></pre></section>

The ``deleteOne`` and ``deleteMany`` methods also accept a second argument which can be an options object. This object can have the following fields:

| Parameter | Type | Description |
| :----------| :------------- | :------------- |
| `w` | {Number/String, > -1 \|\| 'majority'} | the write concern for the operation where < 1 returns an acknowledgment of the write with not results `{ok:1}` and w >= 1 or w = 'majority' acknowledges the write with full write results. |
| `wtimeout` | {Number, 0} | set the timeout for waiting for write concern to finish (combines with w option). |
| `j` | (Boolean, default:false) | write waits for journal sync. |
| `single` | (Boolean, default:false) | Removes the first document found. |

Just as for ``updateOne/updateMany`` and ``insertOne/insertMany``, the ``deleteOne/deleteMany`` method allows you to specify a per operation write concern using the ``w``, ``wtimeout`` and ``fsync`` parameters.

### findOneAndUpdate, findOneAndDelete, and findOneAndReplace

The three methods ``findOneAndUpdate``, ``findOneAndDelete`` and ``findOneAndReplace`` are special commands which
allow the user to update or upsert a document and have the modified or existing document returned. When using these
methods, the operation takes a write lock for the duration of the operation in order to ensure the modification is
[atomic](https://docs.mongodb.org/manual/core/write-operations-atomicity/).

<section class="javascript5"><pre><code class="hljs">
{{% myproject-connect %}}

  const col = db.collection('findAndModify');
  // Insert multiple documents
  col.insert([{a:1}, {a:2}, {a:2}], function(err, r) {
    assert.equal(null, err);
    assert.equal(3, r.result.n);

    // Modify and return the modified document
    col.findOneAndUpdate({a:1}, {$set: {b: 1}}, {
        returnOriginal: false
      , sort: [[a,1]]
      , upsert: true
    }, function(err, r) {
      assert.equal(null, err);
      assert.equal(1, r.value.b);

      // Remove and return a document
      col.findOneAndDelete({a:2}, function(err, r) {
        assert.equal(null, err);
        assert.ok(r.value.b == null);
        client.close();
      });
    });
  });
});
</code></pre></section>
<section class="javascript6 hidden"><pre><code class="hljs">
{{% js6-connect %}}

    // Get the findAndModify collection
    const col = db.collection('findAndModify');
    // Insert multiple documents
    let r = await col.insert([{a:1}, {a:2}, {a:2}]);
    assert.equal(3, r.result.n);

    // Modify and return the modified document
    r = await col.findOneAndUpdate({a:1}, {$set: {b: 1}}, {
        returnOriginal: false
      , sort: [[a,1]]
      , upsert: true
    });
    assert.equal(1, r.value.b);

    // Remove and return a document
    r = await col.findOneAndDelete({a:2});
    assert.ok(r.value.b == null);

    // Close connection
    client.close();
  } catch(err) {
    console.log(err.stack);
  }
})();
</code></pre></section>

The ``findOneAndUpdate`` method also accepts a third argument which can be an options object. This object can have the following fields:

| Parameter | Type | Description |
| :----------| :------------- | :------------- |
| `w` | {Number/String, > -1 \|\| 'majority'} | the write concern for the operation where < 1 returns an acknowledgment of the write with not results `{ok:1}` and w >= 1 or w = 'majority' acknowledges the write with full write results. |
| `wtimeout` | {Number, 0} | set the timeout for waiting for write concern to finish (combines with w option). |
| `j` | (Boolean, default:false) | write waits for journal sync. |
| `upsert` | (Boolean, default:false) | Perform an upsert operation. |
| `sort` | (Object, default:null) | Sort for find operation. |
| `projection` | (Object, default:null) | Projection for returned result |
| `returnOriginal` | (Boolean, default:true) | Set to false if you want to return the modified object rather than the original. Ignored for remove. |

The ``findOneAndDelete`` function is designed to help remove a document.

<section class="javascript5"><pre><code class="hljs">
{{% myproject-connect %}}

  const col = db.collection('findAndModify');
  // Insert multiple documents
  col.insert([{a:1}, {a:2}, {a:2}], function(err, r) {
    assert.equal(null, err);
    assert.equal(3, r.result.n);

    // Remove a document from MongoDB and return it
    col.findOneAndDelete({a:1}, {
        sort: [[a,1]]
      }
      , function(err, r) {
        assert.equal(null, err);
        assert.ok(r.value.b == null);
        client.close();
    });
  });
});
</code></pre></section>
<section class="javascript6 hidden"><pre><code class="hljs">
{{% js6-connect %}}

    // Get the findAndModify collection
    const col = db.collection('findAndModify');
    // Insert multiple documents
    let r = await col.insert([{a:1}, {a:2}, {a:2}]);
    assert.equal(3, r.result.n);

    // Remove a document from MongoDB and return it
    r = await col.findOneAndDelete({a:1}, {
        sort: [[a,1]]
      });
    assert.ok(r.value.b == null);

    // Close connection
    client.close();
  } catch(err) {
    console.log(err.stack);
  }
})();
</code></pre></section>

Like ``findOneAndUpdate``, it allows an object of options to be passed in which can have the following fields:

| Parameter | Type | Description |
| :----------| :------------- | :------------- |
| `w` | {Number/String, > -1 \|\| 'majority'} | the write concern for the operation where < 1 returns an acknowledgment of the write with not results `{ok:1}` and w >= 1 or w = 'majority' acknowledges the write with full write results. |
| `wtimeout` | {Number, 0} | set the timeout for waiting for write concern to finish (combines with w option). |
| `j` | (Boolean, default:false) | write waits for journal sync. |
| `sort` | (Object, default:null) | Sort for find operation. |

### BulkWrite

The ``bulkWrite`` function allows a simple set of bulk operations to run in a non-fluent way, in comparison to the bulk API discussed next.

<section class="javascript5"><pre><code class="hljs">
{{% myproject-connect %}}

  // Get the collection
  const col = db.collection('bulk_write');
  col.bulkWrite([
      { insertOne: { document: { a: 1 } } }
    , { updateOne: { filter: {a:2}, update: {$set: {a:2}}, upsert:true } }
    , { updateMany: { filter: {a:2}, update: {$set: {a:2}}, upsert:true } }
    , { deleteOne: { filter: {c:1} } }
    , { deleteMany: { filter: {c:1} } }
    , { replaceOne: { filter: {c:3}, replacement: {c:4}, upsert:true}}]
  , {ordered:true, w:1}, function(err, r) {
    assert.equal(null, err);
    assert.equal(1, r.insertedCount);
    assert.equal(1, Object.keys(r.insertedIds).length);
    assert.equal(1, r.matchedCount);
    assert.equal(0, r.modifiedCount);
    assert.equal(0, r.deletedCount);
    assert.equal(2, r.upsertedCount);
    assert.equal(2, Object.keys(r.upsertedIds).length);

    // Ordered bulk operation
    client.close();
  });
});
</code></pre></section>
<section class="javascript6 hidden"><pre><code class="hljs">
{{% js6-connect %}}

    // Get the collection
    const col = db.collection('bulk_write');
    const r = await col.bulkWrite([
        { insertOne: { document: { a: 1 } } }
      , { updateOne: { filter: {a:2}, update: {$set: {a:2}}, upsert:true } }
      , { updateMany: { filter: {a:2}, update: {$set: {a:2}}, upsert:true } }
      , { deleteOne: { filter: {c:1} } }
      , { deleteMany: { filter: {c:1} } }
      , { replaceOne: { filter: {c:3}, replacement: {c:4}, upsert:true}}]
    , {ordered:true, w:1});
    assert.equal(1, r.insertedCount);
    assert.equal(1, Object.keys(r.insertedIds).length);
    assert.equal(1, r.matchedCount);
    assert.equal(0, r.modifiedCount);
    assert.equal(0, r.deletedCount);
    assert.equal(2, r.upsertedCount);
    assert.equal(2, Object.keys(r.upsertedIds).length);

    // Close connection
    client.close();
  } catch(err) {
    console.log(err.stack);
  }
})();
</code></pre></section>

The ``bulkWrite`` function takes an array of operations which can be objects of either ``insertOne``, ``updateOne``, ``updateMany``, ``deleteOne``, ``deleteMany``, or ``replaceOne``. It also takes a second parameter which takes the following options:

| Parameter | Type | Description |
| :----------| :------------- | :------------- |
| `ordered` | (Boolean, default:true) | Execute in order or out of order. |
| `w` | {Number/String, > -1 \|\| 'majority'} | the write concern for the operation where < 1 returns an acknowledgment of the write with not results `{ok:1}` and w >= 1 or w = 'majority' acknowledges the write with full write results. |
| `wtimeout` | {Number, 0} | set the timeout for waiting for write concern to finish (combines with w option). |
| `j` | (Boolean, default:false) | write waits for journal sync. |

## Bulk Write Operations

Bulk write operations make it easy to write groups of operations together to MongoDB. There are some caveats and to get the best performance you need to be running against MongoDB version 2.6 or higher, which supports the new write commands. Bulk operations are split into *ordered* and *unordered* bulk operations. An *ordered* bulk operation guarantees the order of execution of writes while the *unordered* bulk operation makes no assumptions about the order of execution. In the Node.js driver the *unordered* bulk operations will group operations according to type and write them in parallel.

<section class="javascript5"><pre><code class="hljs">
{{% myproject-connect %}}

  const col = db.collection('bulkops');
  // Create ordered bulk, for unordered initializeUnorderedBulkOp()
  var bulk = col.initializeOrderedBulkOp();
  // Insert 10 documents
  for(var i = 0; i < 10; i++) {
    bulk.insert({a: i});
  }

  // Next perform some upserts
  for(var i = 0; i < 10; i++) {
    bulk.find({b:i}).upsert().updateOne({b:1});
  }

  // Finally perform a remove operation
  bulk.find({b:1}).deleteOne();

  // Execute the bulk with a journal write concern
  bulk.execute(function(err, result) {
    assert.equal(null, err);
    client.close();
  });
});
</code></pre></section>
<section class="javascript6 hidden"><pre><code class="hljs">
{{% js6-connect %}}

    // Get the collection
    const col = db.collection('bulkops');
    // Create ordered bulk, for unordered initializeUnorderedBulkOp()
    const bulk = col.initializeOrderedBulkOp();
    // Insert 10 documents
    for(let i = 0; i < 10; i++) {
      bulk.insert({a: i});
    }

    // Next perform some upserts
    for(let i = 0; i < 10; i++) {
      bulk.find({b:i}).upsert().updateOne({b:1});
    }

    // Finally perform a remove operation
    bulk.find({b:1}).deleteOne();

    // Execute the bulk with a journal write concern
    const result = await bulk.execute();

    // Close connection
    client.close();
  } catch(err) {
    console.log(err.stack);
  }
})();
</code></pre></section>

The Bulk API handles all the splitting of operations into multiple writes and also emulates 2.6 and higher write commands for 2.4 and earlier servers.

There are some important things to keep in mind when using the bulk API and especially the *ordered* bulk API mode. The write commands are single operation type. That means they can only do insert/update and remove. If you f.ex do the following combination of operations:

    Insert {a:1}
    Update {a:1} to {a:1, b:1}
    Insert {a:2}
    Remove {b:1}
    Insert {a:3}

This will result in the driver issuing four write commands to the server:

    Insert Command with {a:1}
    Update Command {a:1} to {a:1, b:1}
    Insert Command with {a:2}
    Remove Command with {b:1}
    Insert Command with {a:3}

If you instead organize your *ordered* in the following manner:

    Insert {a:1}
    Insert {a:2}
    Insert {a:3}
    Update {a:1} to {a:1, b:1}
    Remove {b:1}

The number of write commands issued by the driver will be:

    Insert Command with {a:1}, {a:2}, {a:3}
    Update Command {a:1} to {a:1, b:1}
    Remove Command with {b:1}

Attention to the order of operations results in more efficient and faster bulk write operation.

For *unordered* bulk operations this is not important, as the driver sorts operations by type and executes them in parallel.

## Read Methods

The main method for querying the database is the ``find`` method.

``find`` returns a cursor which allows the user to operate on the data. The *cursor* also implements the Node.js 0.10.x or higher stream interface, allowing the user to pipe the results to other streams.

The following example materializes all the documents from a query using the ``toArray`` method, but limits the number of returned results to two documents.

<section class="javascript5"><pre><code class="hljs">
{{% myproject-connect %}}

  const col = db.collection('find');
  // Insert multiple documents
  col.insertMany([{a:1}, {a:1}, {a:1}], function(err, r) {
    assert.equal(null, err);
    assert.equal(3, r.insertedCount);

    // Get first two documents that match the query
    col.find({a:1}).limit(2).toArray(function(err, docs) {
      assert.equal(null, err);
      assert.equal(2, docs.length);
      client.close();
    });
  });
});
</code></pre></section>
<section class="javascript6 hidden"><pre><code class="hljs">
{{% js6-connect %}}

    // Get the collection
    const col = db.collection('find');
    // Insert multiple documents
    const r = await col.insertMany([{a:1}, {a:1}, {a:1}]);
    assert.equal(3, r.insertedCount);

    // Get first two documents that match the query
    const docs = await col.find({a:1}).limit(2).toArray();
    assert.equal(2, docs.length);

    // Close connection
    client.close();
  } catch(err) {
    console.log(err.stack);
  }
})();
</code></pre></section>

The cursor returned by the ``find`` method has several methods that allow for chaining of options for a query. Once the query is ready to be executed you can retrieve the documents using the ``next``, ``each`` and ``toArray`` methods. If the query returns many documents it's preferable to use the ``next`` or ``each`` methods, as the ``toArray`` method will materialize all the documents into memory before calling the callback function, potentially using a lot of memory if the query returns many documents.

```js
collection.find({}).project({a:1})                             // Create a projection of field a
collection.find({}).skip(1).limit(10)                          // Skip 1 and limit 10
collection.find({}).batchSize(5)                               // Set batchSize on cursor to 5
collection.find({}).filter({a:1})                              // Set query on the cursor
collection.find({}).comment('add a comment')                   // Add a comment to the query, allowing to correlate queries
collection.find({}).addCursorFlag('tailable', true)            // Set cursor as tailable
collection.find({}).addCursorFlag('oplogReplay', true)         // Set cursor as oplogReplay
collection.find({}).addCursorFlag('noCursorTimeout', true)     // Set cursor as noCursorTimeout
collection.find({}).addCursorFlag('awaitData', true)           // Set cursor as awaitData
collection.find({}).addCursorFlag('exhaust', true)             // Set cursor as exhaust
collection.find({}).addCursorFlag('partial', true)             // Set cursor as partial
collection.find({}).addQueryModifier('$orderby', {a:1})        // Set $orderby {a:1}
collection.find({}).max(10)                                    // Set the cursor max
collection.find({}).maxTimeMS(1000)                            // Set the cursor maxTimeMS
collection.find({}).min(100)                                   // Set the cursor min
collection.find({}).returnKey(10)                              // Set the cursor returnKey
collection.find({}).setReadPreference(ReadPreference.PRIMARY)  // Set the cursor readPreference
collection.find({}).showRecordId(true)                         // Set the cursor showRecordId
collection.find({}).sort([['a', 1]])                           // Sets the sort order of the cursor query
collection.find({}).hint('a_1')                                // Set the cursor hint
```

All options are chainable, so you can combine settings in the following way:

```js
collection.find({}).maxTimeMS(1000).skip(1).toArray(..)
```

More information can be found in the [Cursor API documentation](/node-mongodb-native/2.0/api/Cursor.html).

The following example uses the ``next`` method.

<section class="javascript5"><pre><code class="hljs">
{{% myproject-connect %}}

  const col = db.collection('find');
  // Insert multiple documents
  col.insertMany([{a:1}, {a:1}, {a:1}], function(err, r) {
    assert.equal(null, err);
    assert.equal(3, r.insertedCount);

    // Get first documents from cursor
    col.find({a:1}).limit(2).next(function(err, doc) {
      assert.equal(null, err);
      assert.ok(doc != null);
      client.close();
    });
  });
});
</code></pre></section>
<section class="javascript6 hidden">
In ECMAScript 6, The new `generator` functions allow for what is arguably a
much cleaner and easier way to read iteration code.

<pre><code class="hljs">
{{% js6-connect %}}

    // Get the collection
    const col = db.collection('find');
    // Insert multiple documents
    const r = await col.insertMany([{a:1}, {a:1}, {a:1}]);
    assert.equal(3, r.insertedCount);

    // Get the cursor
    const cursor = col.find({a:1}).limit(2);

    // Iterate over the cursor
    while(await cursor.hasNext()) {
      const doc = await cursor.next();
      console.dir(doc);
    }

    // Close connection
    client.close();
  } catch(err) {
    console.log(err.stack);
  }
})();
</code></pre></section>

The ``next`` method allows the application to read one document at a time using callbacks.

The following example uses the ``each`` method.

```js
{{% myproject-connect %}}

  const col = db.collection('find');
  // Insert multiple documents
  col.insertMany([{a:1}, {a:1}, {a:1}], function(err, r) {
    assert.equal(null, err);
    assert.equal(3, r.insertedCount);

    // Get first documents from cursor using each
    col.find({a:1}).limit(2).each(function(err, doc) {
      if(doc) {
        // Got a document
      } else {
        client.close();
        return false;
      }
    });
  });
});
```

The ``each`` method calls the supplied callback until there are no more documents available that satisfy the query. Once the available documents are exhausted it will return ``null`` for the second parameter in the callback. If you wish to terminate the ``each`` early you should return false in your ``each`` callback. This will stop the cursor from returning documents.
