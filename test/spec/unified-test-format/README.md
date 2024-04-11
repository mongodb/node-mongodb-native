# Unified Test Format Tests

______________________________________________________________________

## Introduction

This directory contains tests for the Unified Test Format's schema and test runner implementation(s). Tests are
organized in the following directories:

- `invalid`: These files do not validate against the schema and are used to test the schema itself.
- `valid-pass`: These files validate against the schema and should pass when executed with a test runner.
- `valid-fail`: These files validate against the schema but should produce runtime errors or failures when executed with
  a test runner. Some do so by violating the "SHOULD" and "SHOULD NOT" guidance in the spec (e.g. referencing an
  undefined entity).

## Validating Test Files

JSON and YAML test files can be validated using [Ajv](https://ajv.js.org/) and a schema from the parent directory (e.g.
`schema-1.0.json`).

Test files can be validated individually like so:

```bash
ajv -s ../schema-1.0.json -d path/to/test.yml
```

Ajv can also be used to assert the validity of test files:

```bash
ajv test -s ../schema-1.0.json -d "invalid/*.yml" --invalid
ajv test -s ../schema-1.0.json -d "valid-*/*.yml" --valid
```
