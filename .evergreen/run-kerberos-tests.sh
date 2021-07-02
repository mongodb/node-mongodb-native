#!/bin/bash

set -o errexit  # Exit the script with error if any of the commands fail

source "${PROJECT_DIRECTORY}/.evergreen/init-nvm.sh"

# set up keytab
mkdir -p "$(pwd)/.evergreen"
touch "$(pwd)/.evergreen/krb5.conf.empty"
export KRB5_CONFIG="$(pwd)/.evergreen/krb5.conf.empty"
echo "Writing keytab"
# DON'T PRINT KEYTAB TO STDOUT
set +o verbose
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo ${KRB5_KEYTAB} | base64 -D > "$(pwd)/.evergreen/drivers.keytab"
else
    echo ${KRB5_KEYTAB} | base64 -d > "$(pwd)/.evergreen/drivers.keytab"
fi
echo "Running kinit"
kinit -k -t "$(pwd)/.evergreen/drivers.keytab" -p ${KRB5_PRINCIPAL}

npm install kerberos
npm run check:kerberos

# destroy ticket
kdestroy
