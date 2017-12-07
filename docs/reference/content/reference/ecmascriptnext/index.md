+++
date = "2015-03-19T12:53:30-04:00"
title = "ECMAScript Next"
[menu.main]
  parent = "Reference"
  identifier = "ECMAScript Next"
  weight = 70
  pre = "<i class='fa'></i>"
+++

# ECMAScript Next

ECMAScript Next (also know as ESNext, ES2015, ES6, and many other names) is the new future of the Javascript language. It introduces fundamental changes in JavaScript while maintaining backward compatibility with ECMAScript 5.

The MongoDB Node.js driver embraces the new JavaScript version to provide the end user with much improved functionality. We do this primarily by exposing Promises for all `async` methods without breaking backward compatibility with existing code using the driver.

This section exposes how to use the MongoDB Node.js driver with ESNext6, leveraging all the productivity gains you get from the new Generators.

{{% note %}}
For more information about ECMAScript Next see the [ECMAScript 6 features](http://es6-features.org/).
{{% /note %}}

- [Connecting]({{<relref "reference/ecmascriptnext/connecting.md">}}): how to connect leveraging ESNext.
- [CRUD]({{<relref "reference/ecmascriptnext/crud.md">}}): perform CRUD operations leveraging ESNext.
