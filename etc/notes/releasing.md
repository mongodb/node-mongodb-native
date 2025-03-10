# Releasing MongoDB Node.js Packages

> [!NOTE]
> _Last updated: Thu Jun 6_

## Pre-requisites

- You must be an employee of MongoDB.
- You must have maintainer access to the repository you are publishing a release for.

## Branching and backport strategy

The Node team develops almost exclusively from the `main` branch.  Commits follow [conventional commit](https://www.conventionalcommits.org/en/v1.0.0/) formatting and the next release's version is determined automatically by [release-please](#release-please).

Fixes are usually released in either the next patch version or in the next minor version, depending on which of the two the next release is.  In rare cases, we will backport changes to certain minor versions.

### Backports

release-please automatically tags release commits with a tag in the format v<major>.<minor>.<patch>.  When backporting, first determine the target minor version and create a release branch for it by branching off of the release tag.  The release branch should follow the format `v<major>.<minor>.x`.  For example, to create a backport of bson's 6.5 release, create a release branch from the v6.5.0 tag with the name v6.5.x.  

Then, backport the release action to the target release branch.  First, create a copy of our current release action (release.yml).  Then, change any references to `main` to the target branch.  Double check that there isn't any release tooling on main that doesn't exist on the target branch.  If there is, make sure this is backported too.  Check if the target branch has a release-please config and manifest file.  If not, make sure to adopt changes for release-please v4 (see https://github.com/mongodb/js-bson/pull/682 as an example).  Backport all of the above changes to the target release branch.

Now, the release-please will work the same as `main`.  Any PRs that merge to the release branch trigger the release action and update release-pleases' release PR.  Proceed as normal from here.

## `release-please`

Every commit that lands on a release branch **MUST** follow [conventional commit](https://www.conventionalcommits.org/en/v1.0.0/) formatting.
The format of each commit message determines the next semantic version from that branch.
We use a CLI tool called [`release-please`](https://github.com/googleapis/release-please) via a [github action](https://github.com/googleapis/release-please-action) of the same name.
`release-please` maintains our `HISTORY.md` and automatically writes the new version to our `package.json` (etc.) files.
Every new commit to a release branch caused the action to update the history and version files in a pending release PR.
Merging the release PR will make the action create a Github Release and subsequently because a "release_created" flag is true, we run npm publish from within the same action.

> [!TIP]
> See the release workflow here: [.github/workflows/release.yml](.github/workflows/release.yml)

## Release Notes

The contents of the release PR's body becomes the contents of the Github Release.
This is used to prepare descriptive and colorful release notes using [Github Flavored Markdown](https://github.github.com/gfm/).
All of the PRs that are going into the next release should have **Release Highlight** sections describing the downstream impact of the fix or feat.
These sections **MUST** contain a level 3 markdown header.

```
<!-- RELEASE_HIGHLIGHT_START -->

### Enhanced compatibility with CoffeeScript

The MongoDB driver can now generate a cup of joe.

<!-- RELEASE_HIGHLIGHT_END -->`
```

> [!TIP]
> See the release notes workflow here: [.github/workflows/release_notes.yml](.github/workflows/release_notes.yml)
> The supporting scripts for parsing and building markdown are here: [.github/scripts](.github/scripts)

## Release Instructions

1. On slack notify `#node-driver-docs`, `#nodejs-devtools`, and `#mongoose` that we intend to publish a release.
    - You may skip this step if you are releasing a package other than the driver.
1. Comment "`run release_notes`" on the release PR.
    - This will kick off the action that reads the notes from each PR going into the release.
    - Double check the result looks logically organized
    - You may edit the PR body for any quick edits or re-orderings.
    - If there are a number of changes, edit the original PRs and post a new `run` comment
1. Merge the release PR
    - If this is a release to a previous major, navigate to the new release and reset "latest" to our latest release in our _current_ major.
1. If this is a new driver minor release, generate the new documentation
    - **Check out the git tag** and run `npm run build:docs  -- --tag=<version>`
    - `<version>` should be formatted MAJOR.MINOR (ex. `--tag=6.8`)
    - Check the changes with: `npm run preview:docs`
    - Post a PR with the generated docs targeting `main`
        - You may need to stash/rebase depending on where the tag was, see [etc/docs/README.md](etc/docs/README.md)
1. Announce it!
    - Post an update about the newly released versions to `#nodejs` channel in Slack
    - If releasing the driver, post to the community forums about the new release
    - [Example 6.0.0 post](https://www.mongodb.com/community/forums/t/mongodb-nodejs-driver-6-0-0-released/241691)
        - Copy what was in the release highlights section of your GitHub release post
        - Topic: node-js
        - Category: About the Community Product & Driver Announcements
1. Mark the [fix version as released in JIRA](https://jira.mongodb.org/projects/NODE?selectedItem=com.atlassian.jira.jira-projects-plugin%3Arelease-page&status=unreleased).

### Authentication

The github action is able to publish with the repository secret `NPM_TOKEN`.
This is a granular API key that is unique to each package and has to be rotated on a regular basis.
The `dbx-node@mongodb.com` npm account is the author of the automated release.

### Prebuilds

Our native packages offer pre built binaries using [`prebuild`](https://github.com/prebuild/prebuild).
prebuild uploads archives of the native dependency to the github release.
`prebuild-install` will handle downloading the correct binary when the package is installed by downstream projects.
Uploading binaries should happen automatically after the git tag/github release has been made.
It may take some time for the building and uploading to finish, but no more than a few hours at most.

## Packages

The following is a list of packages the Node.js team is responsible for and these release instructions apply to.

- https://github.com/mongodb/node-mongodb-native
- https://github.com/mongodb/js-bson
- https://github.com/mongodb-js/mongodb-client-encryption
- https://github.com/mongodb-js/kerberos
- https://github.com/mongodb-js/zstd
- https://github.com/mongodb-js/nodejs-mongodb-legacy
- https://github.com/mongodb-js/mongodb-connection-string-url
- https://github.com/mongodb-js/dbx-js-tools (Node.js team developer tools, not a product)
