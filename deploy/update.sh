#!/bin/bash
# =====================================================================
# Archivo: deploy/update.sh
# Descripción: Publica la última versión de GitHub en el servidor de AWS.
#   Uso (en el servidor):  bash /opt/bitnami/projects/calculadora/deploy/update.sh
#   Desde Windows:         ssh -i ~/.ssh/calculadora-lightsail.pem bitnami@<IP> \
#                              "bash /opt/bitnami/projects/calculadora/deploy/update.sh"
# =====================================================================
set -euo pipefail

APP=/opt/bitnami/projects/calculadora
VHOST=/opt/bitnami/apache/conf/vhosts/calculadora-vhost.conf

cd "$APP"
git pull --ff-only

# Carpeta de GPX: escribible por Apache/PHP (usuario "daemon")
mkdir -p api/storage/gpx
sudo chgrp -R daemon api/storage
sudo chmod -R g+rwX api/storage

# Configuración de Apache: solo se recarga si cambió
if ! sudo cmp -s deploy/apache-vhost.conf "$VHOST"; then
    sudo cp deploy/apache-vhost.conf "$VHOST"
    sudo /opt/bitnami/apache/bin/apachectl configtest
    sudo /opt/bitnami/ctlscript.sh restart apache
fi

echo "Listo: $(git log --oneline -1)"
