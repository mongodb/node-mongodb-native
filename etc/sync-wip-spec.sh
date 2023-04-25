#! /usr/bin/env bash

set -o xtrace
set -o errexit

pushd "$HOME/code/drivers/specifications/source"
make
popd

SOURCE="$HOME/code/drivers/specifications/source/run-command/tests/unified"

for file in $SOURCE/*; do
  cp "$file" "test/spec/run-command/$(basename "$file")"
done

# cp "$HOME/code/drivers/specifications/source/unified-test-format/tests/invalid/entity-createRunCursorCommand.yml" test/spec/unified-test-format/invalid/entity-createRunCursorCommand.yml
# cp "$HOME/code/drivers/specifications/source/unified-test-format/tests/invalid/entity-createRunCursorCommand.json" test/spec/unified-test-format/invalid/entity-createRunCursorCommand.json

cp "$HOME/code/drivers/specifications/source/unified-test-format/tests/valid-pass/entity-commandCursor.yml"  test/spec/unified-test-format/valid-pass/entity-commandCursor.yml
cp "$HOME/code/drivers/specifications/source/unified-test-format/tests/valid-pass/entity-commandCursor.json" test/spec/unified-test-format/valid-pass/entity-commandCursor.json


if [ -z "$MONGODB_URI" ]; then echo "must set uri" && exit 1; fi
export MONGODB_URI=$MONGODB_URI
npm run check:test -- -g '(RunCommand spec)|(Unified test format runner runCursorCommand)'
