# GridFS Tests

______________________________________________________________________

## Introduction

The YAML and JSON files in this directory are platform-independent tests meant to exercise a driver's implementation of
GridFS. These tests utilize the [Unified Test Format](../../unified-test-format/unified-test-format.md).

## Conventions for Expressing Binary Data

The unified test format allows binary stream data to be expressed and matched with `$$hexBytes` (for uploads) and
`$$matchesHexBytes` (for downloads), respectively; however, those operators are not supported in all contexts, such as
`insertData` and `outcome`. When binary data must be expressed as a base64-encoded string
([Extended JSON](../../extended-json.md) for a BSON binary type), the test SHOULD include a comment noting the
equivalent value in hexadecimal for human-readability. For example:

```yaml
data: { $binary: { base64: "ESIzRA==", subType: "00" } } # hex 11223344
```

Creating the base64-encoded string for a sequence of hexadecimal bytes is left as an exercise to the developer. Consider
the following PHP one-liner:

```shell-session
$ php -r 'echo base64_encode(hex2bin('11223344')), "\n";'
ESIzRA==
```
