#!/bin/bash

set -o errexit  # Exit the script with error if any of the commands fail

export PROJECT_DIRECTORY="$(pwd)"
NODE_ARTIFACTS_PATH="${PROJECT_DIRECTORY}/node-artifacts"
export NVM_DIR="${NODE_ARTIFACTS_PATH}/nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"


# set up keytab
mkdir -p "$(pwd)/.evergreen"
touch "$(pwd)/.evergreen/krb5.conf.empty"
export KRB5_CONFIG="$(pwd)/.evergreen/krb5.conf.empty"
echo "Writing keytab"
# DON'T PRINT KEYTAB TO STDOUT
set +o verbose
DECODE='-d'
OS=`uname`
if [[ $OS == "Darwin" ]]; then
  echo "OSX detected, using -D flag for base64 decode"
  DECODE='-D'
fi
echo $KEYTAB | base64 $DECODE > "$(pwd)/.evergreen/drivers.keytab"
ls -la "$(pwd)/.evergreen/drivers.keytab"
echo "Running kinit"
kinit -k -t "$(pwd)/.evergreen/drivers.keytab" -p drivers@LDAPTEST.10GEN.CC

npm install kerberos
npm run check:kerberos

# destroy ticket
kdestroy
