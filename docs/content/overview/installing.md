---
aliases:
- /doc/installing/
date: 2013-07-01
menu:
  main:
    parent: getting started
next: /overview/quickstart
prev: /overview/introduction
title: Installing The Driver
weight: 15
---

## Installing MongoDB Node.js driver using NPM

Installing the MongoDB Node.js driver using NPM is very easy. First you need to ensure you have Node.js and NPM correctly set up and in your path. Installing the driver is as easy as.

```js
npm install mongodb
```

## Installing MongoDB Node.js driver as part of your project

Setting up the Node.js driver for your project is a simple as adding it to the **package.json** dependencies section. An example **package.json** file is shown below.

```json
{
  "name": "myproject",
  "version": "1.0.0",
  "description": "My first project",
  "main": "index.js",
  "repository": {
    "type": "git",
    "url": "git://github.com/christkv/myfirstproject.git"
  },
  "dependencies": {
    "mongodb": "~2.0"
  },
  "author": "Christian Kvalheim",
  "license": "Apache 2.0",
  "bugs": {
    "url": "https://github.com/christkv/myfirstproject/issues"
  },
  "homepage": "https://github.com/christkv/myfirstproject"
}
```

To install the dependency all you need is to open a shell or command line, move to the directory where the package.json file is located and type.

```js
npm install
```

This will download all the dependencies.