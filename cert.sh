#!/bin/bash

# set Cloudflare credentials
export CF_Token="fVdX1HyDvvx-DA3WnYkpYfEvuSYqP2MxRnquA2mk"
export CF_Zone_ID="eff22d7c480d5cf4d18700f316d73e46"

# issue DNS-01 cert (including wildcard)
~/.acme.sh/acme.sh --force --log-level 1 --issue --dns dns_cf -d 'chat.main.tsnet.jxh.io' -d '*.chat.main.tsnet.jxh.io' --server https://acme-v02.api.letsencrypt.org/directory
