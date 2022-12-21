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

### Minimum supported Node version

The new minimum supported Node.js version is now 14.20.1.
