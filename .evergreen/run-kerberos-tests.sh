#!/bin/bash

set -o errexit # Exit the script with error if any of the commands fail

source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

bash $DRIVERS_TOOLS/.evergreen/secrets_handling/setup-secrets.sh drivers/enterprise_auth
source secrets-export.sh

# set up keytab
mkdir -p "$(pwd)/.evergreen"
export KRB5_CONFIG="$(pwd)/.evergreen/krb5.conf.empty"
echo "Writing keytab"
# DON'T PRINT KEYTAB TO STDOUT
set +o verbose
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo ${KEYTAB_BASE64_BUILD} | base64 -D >"$(pwd)/.evergreen/drivers.keytab"
else
    echo ${KEYTAB_BASE64_BUILD} | base64 -d >"$(pwd)/.evergreen/drivers.keytab"
fi
echo "Running kdestroy"
kdestroy -A
echo "Running kinit"
kinit -k -t "$(pwd)/.evergreen/drivers.keytab" -p ${PRINCIPAL_BUILD}

USER=$(node -p "encodeURIComponent(process.env.PRINCIPAL_BUILD)")
export MONGODB_URI="mongodb://${USER}@${SASL_HOST_BUILD}/${GSSAPI_DB}?authMechanism=GSSAPI"

set -o xtrace

npm i -D kerberos@latest
npm run check:kerberos

set +o xtrace

# destroy ticket
kdestroy
