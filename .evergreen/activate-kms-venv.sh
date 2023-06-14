#!/bin/bash
set -o errexit  # Exit the script with error if any of the commands fail

cd ${DRIVERS_TOOLS}/.evergreen/csfle
. ./activate-kmstlsvenv.sh

if [ "Windows_NT" = "$OS" ]; then
  echo "export PYTHON_EXEC='kmstlsvenv/Scripts/python.exe'" > prepare-kmsvenv.sh
else
  echo "export PYTHON_EXEC='./kmstlsvenv/bin/python3'" > prepare-kmsvenv.sh
fi
