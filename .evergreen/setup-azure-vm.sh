#! /usr/bin/env bash

echo "${testazurekms_publickey}" > /tmp/testazurekms_publickey
echo "${testazurekms_privatekey}" > /tmp/testazurekms_privatekey

# Set 600 permissions on private key file. Otherwise ssh / scp may error with permissions "are too open".
chmod 600 /tmp/testazurekms_privatekey
export AZUREKMS_CLIENTID=${AZUREKMS_CLIENTID}
export AZUREKMS_TENANTID=${AZUREKMS_TENANTID}
export AZUREKMS_SECRET=${AZUREKMS_SECRET}
export AZUREKMS_DRIVERS_TOOLS=$DRIVERS_TOOLS
export AZUREKMS_RESOURCEGROUP=${AZUREKMS_RESOURCEGROUP}
export AZUREKMS_PUBLICKEYPATH=/tmp/testazurekms_publickey
export AZUREKMS_PRIVATEKEYPATH=/tmp/testazurekms_privatekey
export AZUREKMS_SCOPE=${AZUREKMS_SCOPE}
export AZUREKMS_VMNAME_PREFIX=NODEDRIVER

$DRIVERS_TOOLS/.evergreen/csfle/azurekms/create-and-setup-vm.sh

echo "AZUREKMS_PRIVATEKEYPATH: /tmp/testazurekms_privatekey" >> testazurekms-expansions.yml
