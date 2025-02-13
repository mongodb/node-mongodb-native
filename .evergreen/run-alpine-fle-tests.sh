#! /usr/bin/env bash

source secrets-export.sh

export ALPINE=true
npm run check:csfle
