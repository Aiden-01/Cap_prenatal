#!/usr/bin/env bash
set -euo pipefail
[[ "$GITHUB_ACTIONS" == true && "$RUNNER_ENVIRONMENT" == github-hosted ]]
[[ "$GITHUB_REPOSITORY" == Aiden-01/Cap_prenatal ]]
[[ "$GITHUB_REF" == refs/heads/feature/cpren-120-editor-pdf-notas-clinicas ]]
[[ "$(uname -s)" == Linux ]]
[[ "$(node --version)" == v20.20.2 ]]
[[ "$("$PREDEPLOY_NODE24_BIN/node" --version)" == v24.* ]]
# No se cargan archivos de entorno, claves o configuración CAP.
for target in backend frontend; do
  if find "$target" -maxdepth 1 -name '.env*' ! -name '.env.example' -print -quit | grep -q .; then
    echo 'Unexpected environment file in checkout'; exit 1
  fi
done
test -x /usr/lib/postgresql/16/bin/pg_dump
test -x /usr/lib/postgresql/16/bin/pg_restore
test -n "$POSTGRES_SERVICE_ID"
docker inspect "$POSTGRES_SERVICE_ID" --format '{{.Config.Image}}' | grep -Fx 'postgres:16.15-bookworm@sha256:cf5d353f55240ecc2f811827a15c7d1f2d562f08019b49dca12b5a59f4ab5962'
docker exec "$POSTGRES_SERVICE_ID" psql -U predeploy02 -d cap_predeploy02_control \
  -v ON_ERROR_STOP=1 -c "ALTER DATABASE cap_predeploy02_control SET cap.predeploy02 = 'synthetic-only'"
printf 'PREDEPLOY_POSTGRES_IMAGE=%s\n' "$(docker inspect "$POSTGRES_SERVICE_ID" --format '{{.Image}}')" >> "$GITHUB_ENV"

# Descarga explícita desde Chrome for Testing solo en la VM remota.
export PUPPETEER_CACHE_DIR="$RUNNER_TEMP/predeploy02-chrome"
(cd backend && node node_modules/puppeteer/lib/cjs/puppeteer/node/cli.js browsers install chrome@148.0.7778.97)
chrome="$PUPPETEER_CACHE_DIR/chrome/linux-148.0.7778.97/chrome-linux64/chrome"
test -x "$chrome"
"$chrome" --version | grep -F '148.0.7778.97'
printf 'PREDEPLOY_CHROME=%s\n' "$chrome" >> "$GITHUB_ENV"

# Excepción AppArmor para un solo ejecutable, sin desactivar sandbox/userns globales.
# Ver documentación Chromium citada en el informe.
if [[ -f /proc/sys/kernel/apparmor_restrict_unprivileged_userns ]] && \
   [[ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns)" == 1 ]]; then
  [[ "$chrome" =~ ^/[a-zA-Z0-9_./-]+$ ]]
  sudo tee /etc/apparmor.d/cap-predeploy02-chrome >/dev/null <<EOF
abi <abi/4.0>,
include <tunables/global>
profile cap-predeploy02-chrome "$chrome" flags=(unconfined) {
  userns,
}
EOF
  sudo apparmor_parser -r /etc/apparmor.d/cap-predeploy02-chrome
fi

# El usuario de pruebas carece de sudo, credenciales de Actions y red exterior.
sudo useradd --system --create-home --shell /bin/bash clinical-ci
sudo chown -R clinical-ci:clinical-ci "$GITHUB_WORKSPACE" "$RUNNER_TEMP/predeploy02-chrome" "$RUNNER_TEMP/predeploy02-python"
# Primer run: chown del checkout no garantiza atravesar sus directorios padre.
# Conceder solo búsqueda (--x) al UID de pruebas, sin lectura/listado ni escritura
# en los ancestros; sin chmod global, sudo para clinical-ci ni cambios de sandbox.
grant_parent_traversal() {
  local parent current_acl current_mask
  parent=$(dirname "$(realpath "$1")")
  while [[ "$parent" != / ]]; do
    current_acl=$(getfacl -cp "$parent")
    current_mask=$(awk -F: '$1 == "mask" { print substr($3,1,3) }' <<< "$current_acl")
    if [[ -n "$current_mask" && "$current_mask" != *x ]]; then
      echo "Existing restrictive ACL mask requires review: $parent"; exit 1
    fi
    if [[ -z "$current_mask" ]]; then
      current_mask=$(awk -F: '$1 == "group" && $2 == "" { print substr($3,1,3) }' <<< "$current_acl")
      [[ "$current_mask" =~ ^[r-][w-][x-]$ ]]
      current_mask="${current_mask:0:2}x"
    fi
    # No recalcular la máscara ni ampliar permisos efectivos de entradas previas.
    sudo setfacl -n -m "u:clinical-ci:--x,m::$current_mask" "$parent"
    parent=$(dirname "$parent")
  done
}
command -v setfacl >/dev/null
grant_parent_traversal "$GITHUB_WORKSPACE"
grant_parent_traversal "$RUNNER_TEMP/predeploy02-chrome"
grant_parent_traversal "$RUNNER_TEMP/predeploy02-python"
namei -l "$GITHUB_WORKSPACE"
sudo -H -u clinical-ci test -r "$GITHUB_WORKSPACE/.github/clinical/run-predeploy02.cjs"
sudo -H -u clinical-ci test -x "$chrome"
sudo -H -u clinical-ci "$PREDEPLOY_NODE24_BIN/node" --version
sudo -H -u clinical-ci "$(command -v node)" --version
sudo -H -u clinical-ci "$RUNNER_TEMP/predeploy02-python/bin/python" --version
sudo -H -u clinical-ci /usr/lib/postgresql/16/bin/pg_dump --version
sudo -H -u clinical-ci /usr/lib/postgresql/16/bin/pg_restore --version
sudo -H -u clinical-ci git -C "$GITHUB_WORKSPACE" rev-parse --is-inside-work-tree
echo 'clinical-ci checkout and executable access: verified'
sudo -H -u clinical-ci git config --global --add safe.directory "$GITHUB_WORKSPACE"
uid=$(id -u clinical-ci)
pg_ip=$(docker inspect "$POSTGRES_SERVICE_ID" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
[[ "$pg_ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]
sudo iptables -N CPREN02
sudo iptables -A CPREN02 -d 127.0.0.0/8 -j ACCEPT
# Docker aplica DNAT antes de filter OUTPUT: permitir exclusivamente el service PG.
sudo iptables -A CPREN02 -d "$pg_ip" -p tcp --dport 5432 -j ACCEPT
sudo iptables -A CPREN02 -j REJECT
sudo iptables -I OUTPUT 1 -m owner --uid-owner "$uid" -j CPREN02
sudo ip6tables -N CPREN02
sudo ip6tables -A CPREN02 -d ::1/128 -j ACCEPT
sudo ip6tables -A CPREN02 -j REJECT
sudo ip6tables -I OUTPUT 1 -m owner --uid-owner "$uid" -j CPREN02
# El agente GitHub conserva su UID/red para poder subir evidencia al terminar.
