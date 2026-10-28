# GridFS Tests

______________________________________________________________________

## Introduction

The YAML and JSON files in this directory are platform-independent tests meant to exercise a driver's implementation of
GridFS. These tests utilize the [Unified Test Format](../../unified-test-format/unified-test-format.md).

## Conventions for Expressing Binary Data

The unified test format allows binary stream data to be expressed and matched with `$$hexBytes` (for uploads) and
`$$matchesHexBytes` (for downloads), respectively; however, those operators are not supported in all contexts, such as
`insertData` and `outcome`. When binary data must be expressed as a base64-encoded string
([Extended JSON](../../extended-json/extended-json.md) for a BSON binary type), the test SHOULD include a comment noting
the equivalent value in hexadecimal for human-readability. For example:

```yaml
data: { $binary: { base64: "ESIzRA==", subType: "00" } } # hex 11223344
```

Creating the base64-encoded string for a sequence of hexadecimal bytes is left as an exercise to the developer. Consider
the following PHP one-liner:

```shell-session
$ php -r 'echo base64_encode(hex2bin('11223344')), "\n";'
ESIzRA==
```

## Prose Tests

### 1. Aborting an upload with an injected file ID does not delete other files' chunks

This test asserts that the delete command executed when a GridFS upload stream is aborted does not delete chunks
associated with other files.

This test MUST be skipped if a driver does not support opening an upload stream with a custom ID, accepting a document
as a file ID, or aborting an upload stream.

This test MUST be skipped on server versions older than 5.0. (These versions do not support document values with
"$"-prefixed keys.)

#### Test steps

1. Create a GridFS bucket (referred to as `bucket`). Drop `bucket` to clear its contents.

2. Construct a small, non-empty vector of bytes to upload to a GridFS file (referred to as `file1Bytes`). Upload
    `file1Bytes` to `bucket` with the filename of "file1".

3. Open an upload stream from `bucket` with a filename of "file2", a file ID of `{ "$gt": MinKey }`, and
    `chunkSizeBytes` set to 2 (referred to as `uploadStream`).

4. Write a vector containing 4 bytes to `uploadStream`. Then, abort `uploadStream`.

5. Download the contents of "file1" from `bucket`. Assert that the downloaded contents match `file1Bytes`.

6. Attempt to download the contents of "file2" from `bucket`. Assert that the download fails with a "FileNotFound"
    error.
