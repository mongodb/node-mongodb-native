#! /usr/bin/env bash

npm i
source secrets-export.sh

export ALPINE=true
npm run check:csfle
