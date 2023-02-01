cd ${DRIVERS_TOOLS}/.evergreen/csfle
. ./activate-kmstlsvenv.sh
# by default it always runs on port 5698
python -u kms_kmip_server.py &
python -u kms_http_server.py --ca_file ../x509gen/ca.pem --cert_file ../x509gen/expired.pem --port 8000  &
python -u kms_http_server.py --ca_file ../x509gen/ca.pem --cert_file ../x509gen/wrong-host.pem --port 8001  &
python -u kms_http_server.py --ca_file ../x509gen/ca.pem --cert_file ../x509gen/server.pem --port 8002 --require_client_cert &
