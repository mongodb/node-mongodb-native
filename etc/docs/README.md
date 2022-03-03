# docs_utils

This directory contains scripts to generate api docs as well our the Hugo site template used for the MongoDB node driver documentation.

There are two scripts contained in this folder.

- `legacy-generate.sh` was used to generate API documentation before the driver's docs
were moved into the main repository.  This script has the ability to generate api docs for older versions of the driver (in case it becomes
necessary to backport a feature).

- `build.ts` is used to generate API docs for a major or minor release.

### Dependencies

`build.ts` requires the following in addition to dependencies installed with `npm i`:

* Hugo static web generator `v0.30.2`
  * You can download the right version [here](https://github.com/gohugoio/hugo/releases/tag/v0.30.2)
* ts-node

Note: `typedoc` is also a dependency but it is downloaded by the docs generation script automatically.

`legacy-generate.sh` requires the following (in addition to Hugo):

* jsdoc v3
* node (v6.x or v8.x) and npm (>= 3.x). Note: worked for me with 8.17.0, but not 8.0.0.
* python sphinx

### Usage

To generate API documentation for a new major or minor version:

`npm run build:docs -- --tag <version>`

You can optionally specify the following options:

- `--yes` if set, this will silence any prompts in the script. useful for running in CI
- `--status <status>` set the status of the version.

Run `npm run build:docs -- --help` for more information.

The generated docs can be previewed using `npm run docs:preview`.

Once everything looks correct, open a PR against `main`.  Our docs are hosted out of the `docs` folder on the
main branch, and once the PR is merged Github will automatically update the hosted documentation.
