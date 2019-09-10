+++
date = "2015-03-19T12:53:30-04:00"
title = "Cursors"
[menu.main]
  parent = "Reference"
  identifier = "Cursors"
  weight = 100
  pre = "<i class='fa'></i>"
+++

# Cursors

When a driver executes a read that returns mutliple documents, the server does not immediately return all values that match the query. Instead, the driver creates a **Cursor** object which fetches the documents in batches.

## Where are cursors used in the driver?

The following functions directly return cursors to the user:

+ `Collection.prototype.find`
+ `Collection.prototype.aggregate`
+ `Collection.prototype.listIndexes`
+ `Db.prototype.aggregate`
+ `Db.prototype.listCollections`

In addition, many other methods, like `Collection.prototype.findOne` and `Collection.prototype.watch`, use cursors in order to return results.

## How do I use a cursor?

There are multiple ways to consume a cursor:

### Stream API

All cursors in the Node Driver are Node Readable Streams operating in Object Mode. Cursors will work with most Node stream APIs.

```js
// Using the stream API
const cursor = collection.find({});
cursor.pipe(new stream.Writable({
  write: function(doc, _, callback) {
    console.log(doc);
    callback();
  }
}));
```

### Event API

As Readable Streams, Cursors also support an Event API.

```js
// Using the event API
const cursor = collection.find({});
cursor.on('data', data => console.log(data));
```

### Get all documents at once

To get all documents at once, users can use the `toArray` method.

```js
// Get all values
const cursor = collection.find({});
const allValues = await cursor.toArray();
```

### Async Iterator

Cursors also implement the AsyncIterator interface, allowing them to be used in `for`...`await` loops.

```js
const cursor = collection.find({});
for await(const doc of cursor) {
  console.log(doc);
}
```

### For Each

If you want to perform an operation on each document, you can use the `forEach` method.

```js
// apply a callback to every item in a cursor
const cursor = collection.find({});
await cursor.forEach(doc => console.log(doc));
```

### Get a single document

If you wish to only get a single document, use `next` and `hasNext`.

```js
// get only one value
const cursor = collection.find({});
let firstValue, secondValue;
if (await cursor.hasNext()) {
  firstValue = await cursor.next();
  if (await cursor.hasNext()) {
    secondValue = await cursor.next();
  }
}
```

### Count

If you would like an estimated count of the number of documents the cursor will return, use `count`

```js
// Get an estimate of the number of documents in a cursor
const cursor = collection.find({});
const count = await cursor.count();
```

## Important design considerations

### Only use one API at a time

The cursor is designed with the assumption that users will only use one of the above methods to get data. Therefore, when interacting with a cursor, **it is very important to only use one method of interaction at a time**. Using more than one method of interacting with a cursor will lead to undefined behavior.

For example, the following:

```js
const cursor = collection.find({});

const countOfDocuments = await cursor.count();
const allDocument = await cursor.toArray();
```

is very likely to trigger an error, as it is attempting both `count` and a `toArray` on the same cursor.

Similarly, the following:

```js
const cursor = collection.find({});

cursor.on('data', data => callSomeLoggingFunction(data));

while (await cursor.hasNext()) {
  doSomethingWithDocument(await cursor.next());
}
```

is very likely to cause an error as it attempts to use both the `next`/`hasNext` API and the stream event API.

### Do not attempt multiple simultaneous cursor operations

The cursor is designed with the assumption that it will only be performing one asynchronous operation at a time. Because of this, attempting multiple async operations in parallel on a cursor can result in undefined behavior.

For example, the following loop is likely to produce an error:

```js
const promises = [];
const cursor = collection.find({});

for (let i = 0; i < 100; i++) {
  promises.push(cursor.next);
}

const results = await Promise.all(promises);
```
