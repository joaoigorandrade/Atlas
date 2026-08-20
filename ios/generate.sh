#!/bin/sh
# Tuist forwards only TUIST_-prefixed variables into the manifest, so the three
# values the app is built with are lifted out of the web app's .env.local here
# rather than duplicated in a second dotfile.
set -e
cd "$(dirname "$0")"
set -a; . ../.env.local; set +a
env $(env | grep -E '^(ATLAS_BASE_URL|SUPABASE_URL|SUPABASE_PUBLISHABLE_KEY)=' | sed 's/^/TUIST_/') tuist generate "$@"
