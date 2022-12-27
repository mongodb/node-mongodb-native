# Changes in v5

## TOC

- TODO

## About

The following is a detailed collection of the changes in the major v5 release of the mongodb package for Node.js.

<!--
1. a brief statement of what is breaking (brief as in "x will now return y instead of z", or "x is no longer supported, use y instead", etc
2. a brief statement of why we are breaking it (bug, not useful, inconsistent behavior, better alternative, etc)
3. if applicable, an example of suggested syntax change (can be included in (1) )
-->

## Changes

### Snappy v7.x.x or later and optional peerDependency

`snappy` compression has been added to the package.json as a peerDependency that is **optional**.
This means `npm` will let you know if the version of snappy you have installed is incompatible with the driver.

```sh
npm install --save snappy@7
```

### `.unref()` removed from `Db`

The `.unref()` method was a no-op and has now been removed from the Db class.


### @aws-sdk/credential-providers v3.201.0 or later and optional peerDependency

`@aws-sdk/credential-providers` has been added to the package.json as a peerDependency that is **optional**.
This means `npm` will let you know if the version of the sdk you have installed is incompatible with the driver.

```sh
npm install --save @aws-sdk/credential-providers@3.186.0
```

### Minimum supported Node version

The new minimum supported Node.js version is now 14.20.1.

### Custom Promise library support removed

The MongoClient option `promiseLibrary` along with the `Promise.set` export that allows specifying a custom promise library has been removed.
This allows the driver to adopt async/await syntax which has [performance benefits](https://v8.dev/blog/fast-async) over manual promise construction.

### Cursor closes on exit of for await of loops

Cursors will now automatically close when exiting a for await of loop on the cursor itself.

```js
const cursor = collection.find({});
for await (const doc of cursor) {
  console.log(doc);
  break;
}

cursor.closed // true
```
