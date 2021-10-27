# MongoDB NodeJS Driver

The official [MongoDB](https://www.mongodb.com/) driver for Node.js.

**Upgrading to version 4? Take a look at our [upgrade guide here](https://github.com/mongodb/node-mongodb-native/blob/HEAD/docs/CHANGES_4.0.0.md)!**

## Quick Links

| what          | where                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| documentation | [docs.mongodb.com/drivers/node](https://docs.mongodb.com/drivers/node)                                  |
| api-doc       | [mongodb.github.io/node-mongodb-native/4.1/](https://mongodb.github.io/node-mongodb-native/4.1/)        |
| npm package   | [www.npmjs.com/package/mongodb](https://www.npmjs.com/package/mongodb)                                  |
| source        | [github.com/mongodb/node-mongodb-native](https://github.com/mongodb/node-mongodb-native)                |
| mongodb       | [www.mongodb.com](https://www.mongodb.com)                                                              |
| changelog     | [HISTORY.md](https://github.com/mongodb/node-mongodb-native/blob/HEAD/HISTORY.md)                       |
| upgrade to v4 | [docs/CHANGES_4.0.0.md](https://github.com/mongodb/node-mongodb-native/blob/HEAD/docs/CHANGES_4.0.0.md) |
| contributing  | [CONTRIBUTING.md](https://github.com/mongodb/node-mongodb-native/blob/HEAD/CONTRIBUTING.md)             |

### Bugs / Feature Requests

Think you’ve found a bug? Want to see a new feature in `node-mongodb-native`? Please open a
case in our issue management tool, JIRA:

- Create an account and login [jira.mongodb.org](https://jira.mongodb.org).
- Navigate to the NODE project [jira.mongodb.org/browse/NODE](https://jira.mongodb.org/browse/NODE).
- Click **Create Issue** - Please provide as much information as possible about the issue type and how to reproduce it.

Bug reports in JIRA for all driver projects (i.e. NODE, PYTHON, CSHARP, JAVA) and the
Core Server (i.e. SERVER) project are **public**.

### Support / Feedback

For issues with, questions about, or feedback for the Node.js driver, please look into our [support channels](https://docs.mongodb.com/manual/support). Please do not email any of the driver developers directly with issues or questions - you're more likely to get an answer on the [MongoDB Community Forums](https://community.mongodb.com/tags/c/drivers-odms-connectors/7/node-js-driver).

### Change Log

Change history can be found in [`HISTORY.md`](https://github.com/mongodb/node-mongodb-native/blob/HEAD/HISTORY.md).

### Compatibility

For version compatibility matrices, please refer to the following links:

- [MongoDB](https://docs.mongodb.com/drivers/node/current/compatibility/#mongodb-compatibility)
- [NodeJS](https://docs.mongodb.com/drivers/node/current/compatibility/#language-compatibility)

#### Typescript Version

We recommend using the latest version of typescript, however we do provide a [downleveled](https://github.com/sandersn/downlevel-dts#readme) version of the type definitions that we test compiling against `typescript@4.0.2`.
Since typescript [does not restrict breaking changes to major versions](https://github.com/Microsoft/TypeScript/wiki/Breaking-Changes) we consider this support best effort.
If you run into any unexpected compiler failures please let us know and we will do our best to correct it.

## Installation

The recommended way to get started using the Node.js 4.x driver is by using the `npm` (Node Package Manager) to install the dependency in your project.

After you've created your own project using `npm init`, you can run:

```bash
npm install mongodb
# or ...
yarn add mongodb
```

This will download the MongoDB driver and add a dependency entry in your `package.json` file.

If you are a Typescript user, you will need the Node.js type definitions to use the driver's definitions:

```sh
npm install -D @types/node
```

## Troubleshooting

The MongoDB driver depends on several other packages. These are:

- [bson](https://github.com/mongodb/js-bson)
- [bson-ext](https://github.com/mongodb-js/bson-ext)
- [kerberos](https://github.com/mongodb-js/kerberos)
- [mongodb-client-encryption](https://github.com/mongodb/libmongocrypt#readme)

Some of these packages include native C++ extensions. Consult the [trouble shooting guide here](https://github.com/mongodb/node-mongodb-native/blob/HEAD/docs/native-extensions.md) if you run into issues.

## Quick Start

This guide will show you how to set up a simple application using Node.js and MongoDB. Its scope is only how to set up the driver and perform the simple CRUD operations. For more in-depth coverage, see the [official documentation](https://docs.mongodb.com/drivers/node/).

### Create the `package.json` file

First, create a directory where your application will live.

```bash
mkdir myProject
cd myProject
```

Enter the following command and answer the questions to create the initial structure for your new project:

```bash
npm init -y
```

Next, install the driver as a dependency.

```bash
npm install mongodb
```

### Start a MongoDB Server

For complete MongoDB installation instructions, see [the manual](https://docs.mongodb.org/manual/installation/).

1. Download the right MongoDB version from [MongoDB](https://www.mongodb.org/downloads)
2. Create a database directory (in this case under **/data**).
3. Install and start a `mongod` process.

```bash
mongod --dbpath=/data
```

You should see the **mongod** process start up and print some status information.

### Connect to MongoDB

Create a new **app.js** file and add the following code to try out some basic CRUD
operations using the MongoDB driver.

Add code to connect to the server and the database **myProject**:

> **NOTE:** All the examples below use async/await syntax.
>
> However, all async API calls support an optional callback as the final argument,
> if a callback is provided a Promise will not be returned.

```js
const { MongoClient } = require('mongodb');
// or as an es module:
// import { MongoClient } from 'mongodb'

// Connection URL
const url = 'mongodb://localhost:27017';
const client = new MongoClient(url);

// Database Name
const dbName = 'myProject';

async function main() {
  // Use connect method to connect to the server
  await client.connect();
  console.log('Connected successfully to server');
  const db = client.db(dbName);
  const collection = db.collection('documents');

  // the following code examples can be pasted here...

  return 'done.';
}

main()
  .then(console.log)
  .catch(console.error)
  .finally(() => client.close());
```

Run your app from the command line with:

```bash
node app.js
```

The application should print **Connected successfully to server** to the console.

### Insert a Document

Add to **app.js** the following function which uses the **insertMany**
method to add three documents to the **documents** collection.

```js
const insertResult = await collection.insertMany([{ a: 1 }, { a: 2 }, { a: 3 }]);
console.log('Inserted documents =>', insertResult);
```

The **insertMany** command returns an object with information about the insert operations.

### Find All Documents

Add a query that returns all the documents.

```js
const findResult = await collection.find({}).toArray();
console.log('Found documents =>', findResult);
```

This query returns all the documents in the **documents** collection.
If you add this below the insertMany example you'll see the document's you've inserted.

### Find Documents with a Query Filter

Add a query filter to find only documents which meet the query criteria.

```js
const filteredDocs = await collection.find({ a: 3 }).toArray();
console.log('Found documents filtered by { a: 3 } =>', filteredDocs);
```

Only the documents which match `'a' : 3` should be returned.

### Update a document

The following operation updates a document in the **documents** collection.

```js
const updateResult = await collection.updateOne({ a: 3 }, { $set: { b: 1 } });
console.log('Updated documents =>', updateResult);
```

The method updates the first document where the field **a** is equal to **3** by adding a new field **b** to the document set to **1**. `updateResult` contains information about whether there was a matching document to update or not.

### Remove a document

Remove the document where the field **a** is equal to **3**.

```js
const deleteResult = await collection.deleteMany({ a: 3 });
console.log('Deleted documents =>', deleteResult);
```

### Index a Collection

[Indexes](https://docs.mongodb.org/manual/indexes/) can improve your application's
performance. The following function creates an index on the **a** field in the
**documents** collection.

```js
const indexName = await collection.createIndex({ a: 1 });
console.log('index name =', indexName);
```

For more detailed information, see the [indexing strategies page](https://docs.mongodb.com/manual/applications/indexes/).

## Error Handling

If you need to filter certain errors from our driver we have a helpful tree of errors described in [docs/errors.md](https://github.com/mongodb/node-mongodb-native/blob/HEAD/docs/errors.md).

It is our recommendation to use `instanceof` checks on errors and to avoid relying on parsing `error.message` and `error.name` strings in your code.
We guarantee `instanceof` checks will pass according to semver guidelines, but errors may be sub-classed or their messages may change at any time, even patch releases, as we see fit to increase the helpfulness of the errors.

Any new errors we add to the driver will directly extend an existing error class and no existing error will be moved to a different parent class outside of a major release.
This means `instanceof` will always be able to accurately capture the errors that our driver throws (or returns in a callback).

```typescript
const client = new MongoClient(url);
await client.connect();
const collection = client.db().collection('collection');

try {
  await collection.insertOne({ _id: 1 });
  await collection.insertOne({ _id: 1 }); // duplicate key error
} catch (error) {
  if (error instanceof MongoServerError) {
    console.log(`Error worth logging: ${error}`); // special case for some reason
  }
  throw error; // still want to crash
}
```

## Next Steps

- [MongoDB Documentation](https://docs.mongodb.com/manual/)
- [MongoDB Node Driver Documentation](https://docs.mongodb.com/drivers/node/)
- [Read about Schemas](https://docs.mongodb.com/manual/core/data-modeling-introduction/)
- [Star us on GitHub](https://github.com/mongodb/node-mongodb-native)

## License

[Apache 2.0](LICENSE.md)

© 2009-2012 Christian Amor Kvalheim
© 2012-present MongoDB [Contributors](https://github.com/mongodb/node-mongodb-native/blob/HEAD/CONTRIBUTORS.md)
