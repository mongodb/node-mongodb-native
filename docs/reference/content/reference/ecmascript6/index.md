+++
date = "2015-03-19T12:53:30-04:00"
title = "ECMAScript 6"
[menu.main]
  parent = "Reference"
  identifier = "ECMAScript 6"
  weight = 70
  pre = "<i class='fa'></i>"
+++

# ECMAScript 6

ECMAScript 6 or JavaScript 6 as it's more commonly known is the new future of the Javascript language. It introduces fundamental changes in JavaScript while maintaining backward compatibility with ECMAScript 5.

The MongoDB Node.js driver embraces the new JavaScript version to provide the end user with much improved functionality. We do this primarily by exposing Promises for all `async` methods without breaking backward compatibility with existing code using the driver.

This section exposes how to use the MongoDB Node.js driver with ECMAScript 6, leveraging all the productivity gains you get from the new Generators.

{{% note %}}
For more information about ECMAScript 6 see the [ECMAScript 6 features](http://es6-features.org/).
{{% /note %}}

- [Connecting]({{<relref "reference/ecmascript6/connecting.md">}}): how to connect leveraging ECMAScript 6.
- [CRUD]({{<relref "reference/ecmascript6/crud.md">}}): perform CRUD operations leveraging ECMAScript 6.
