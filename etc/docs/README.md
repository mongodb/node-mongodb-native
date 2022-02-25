# docs_utils

This directory contains scripts to generate api docs as well our the Hugo site template used for the MongoDB node driver documentation.

There are two scripts contained in this folder.

- `legacy-generate.sh` was used to generate API documentation before the driver's docs
were moved into the main repository.  This script has the ability to generate api docs for older versions of the driver (in case it becomes
necessary to backport a feature).

- `generate-docs.ts` is used to generate API docs for a major or minor release.

### Dependencies

`generate-docs.ts` requires the following in addition to dependencies installed with `npm i`:

* Hugo static web generator `v0.30.2`
  * You can download the right version [here](https://github.com/gohugoio/hugo/releases/tag/v0.30.2)
* typedoc 
* ts-node

`legacy-generate.sh` requires the following (in addition to Hugo):

* jsdoc v3
* node (v6.x or v8.x) and npm (>= 3.x). Note: worked for me with 8.17.0, but not 8.0.0.
* python sphinx

### Usage

To generate API documentation for a new major or minor version:

#### Generate Documentation for the new Version

First, generate the API docs for the new version.  To do this, run `npm run build:docs` on main.  This will output the documentation in the docs_utils/build folder.

#### Update the Node Driver Docs

After generating the API docs for a particular version, the next step is to update the static site to include the new docs.  Open the `generate-docs.ts` 
script and update the `NEW_VERSION` object with information for the new version.

Run the `generate-docs.ts` script from the `docs_utils` directory.

#### Push the changes to Github

Finally, push the new documentation to Github and confirm that the site builds as expected.

### Doc Generation Overview

API docs are stored in the top level `docs` folder in the `node-mongodb-driver` Github repository and are hosted on Github Pages.  Each major or minor release,
a new set of API docs are generated and added to our Hugo static site.  This is a three step process:

1. Generate the new API docs using type doc
2. Run the generate docs script to create the new version of the Hugo site, copy in the new documentation and move the newly generated site into the `docs` folder.
3. Push the changes to main
