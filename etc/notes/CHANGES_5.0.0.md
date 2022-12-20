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

### `.unref()` removed from `Db`

The `.unref()` method was a no-op and has now been removed from the Db class.
