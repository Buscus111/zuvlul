#!/usr/bin/env bash
# First boot of a fresh Ubuntu 24.04 server on Timeweb Cloud.
# Connect as root, then:
#   bash scripts/bootstrap-vm.sh
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "Run this on the Ubuntu server."
  exit 1
fi

run() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

if ! swapon --show | grep -q /swapfile; then
  run dd if=/dev/zero of=/swapfile bs=1M count=2048 status=progress
  run chmod 600 /swapfile
  run mkswap /swapfile
  run swapon /swapfile
  echo '/swapfile none swap sw 0 0' | run tee -a /etc/fstab >/dev/null
fi

run apt-get update
run apt-get install -y ca-certificates curl git

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | run sh
  if [[ "${EUID}" -ne 0 ]]; then
    sudo usermod -aG docker "${USER}"
  fi
fi

install_dir=/opt/zuvlul
run mkdir -p "${install_dir}"
if [[ "${EUID}" -ne 0 ]]; then
  sudo chown "${USER}:${USER}" "${install_dir}"
fi

if [[ ! -d ${install_dir}/.git ]]; then
  git clone https://github.com/Buscus111/zuvlul.git "${install_dir}"
fi

cd "${install_dir}"
git pull --ff-only
run docker compose up -d --build
run docker compose ps
