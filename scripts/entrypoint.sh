#!/bin/sh
set -eu

mkdir -p /data
exec python3 -m genpac_runner
