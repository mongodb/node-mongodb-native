#!/bin/bash
set -o errexit  # Exit the script with error if any of the commands fail
set -o xtrace   # Write all commands first to stderr

cd ${DRIVERS_TOOLS}/.evergreen/auth_oidc
. ./activate_venv.sh

# Install mongosh: TODO(NODE-5035): mongo-orchestrationn will be changed to do this.
curl -L https://github.com/mongodb-js/mongosh/releases/download/v1.6.2/mongodb-mongosh-shared-openssl3-1.6.2.x86_64.rpm -o mongosh.rpm

ls -la

sudo yum -y install mongosh.rpm

# Install mongosh: TODO(NODE-5035): script in drivers-evergreen-tools will be updated
# to be mongosh friendly.
cat <<EOF > setup_oidc_mongosh.js
(function() {
  const admin = Mongo().getDB('admin');
  admin.auth('bob', 'pwd123');
  admin.runCommand({createRole: 'test1/readWrite', roles:[{role: 'readWrite', db: 'test'}], privileges: []});
  admin.runCommand({createRole: 'test2/read', roles:[{role: 'read', db: 'test'}], privileges: []});
}());
EOF

mongosh setup_oidc_mongosh.js
