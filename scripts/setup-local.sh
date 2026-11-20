#!/usr/bin/env bash
# Sets up WatchNext for local development:
#   1. checks Node, 2. installs dependencies, 3. logs in to Vercel and links the project,
#   4. pulls the environment variables (database, API keys) into .env.local, 5. checks them.
#
# Run from anywhere in the repo:  npm run setup
# You need access to the Vercel project. Without it, the script falls back to .env.example
# and tells you which values to ask for.

set -euo pipefail

VERCEL_SCOPE="hugh-nolans-projects"
VERCEL_PROJECT="watchnext"
MIN_NODE_MAJOR=20
REQUIRED_VARS=(DATABASE_URL TMDB_API_KEY)
OPTIONAL_VARS=(OMDB_API_KEY DEFAULT_REGION)

cd "$(dirname "$0")/.."

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$*"; exit 1; }

# ---- 1. Node ----
bold "Checking Node"
command -v node >/dev/null || fail "Node isn't installed. Install Node $MIN_NODE_MAJOR or newer from https://nodejs.org"
node_major=$(node -p 'process.versions.node.split(".")[0]')
[ "$node_major" -ge "$MIN_NODE_MAJOR" ] || fail "Node $(node -v) is too old. Install Node $MIN_NODE_MAJOR or newer."
ok "Node $(node -v)"

# ---- 2. Dependencies ----
bold "Installing dependencies"
npm install --no-fund --no-audit
ok "Dependencies installed"

# ---- 3. Vercel CLI, login and link ----
bold "Connecting to Vercel"
if command -v vercel >/dev/null; then
  VERCEL=(vercel)
else
  warn "Vercel CLI not found, using npx (install it with: npm i -g vercel)"
  VERCEL=(npx --yes vercel@latest)
fi

if ! "${VERCEL[@]}" whoami >/dev/null 2>&1; then
  echo "  Log in to Vercel in the browser window that opens..."
  "${VERCEL[@]}" login
fi
ok "Logged in to Vercel as $("${VERCEL[@]}" whoami 2>/dev/null | tail -1)"

pulled=false
had_env=false; [ -f .env.local ] && had_env=true   # `vercel link` can write .env.local itself
if [ -f .vercel/project.json ] || [ -f .vercel/repo.json ]; then
  ok "Project already linked"
  linked=true
elif "${VERCEL[@]}" link --yes --project "$VERCEL_PROJECT" --scope "$VERCEL_SCOPE" >/dev/null 2>&1; then
  ok "Linked to $VERCEL_SCOPE/$VERCEL_PROJECT"
  linked=true
else
  warn "Couldn't link to $VERCEL_SCOPE/$VERCEL_PROJECT. Ask the project owner to add you to the Vercel team."
  linked=false
fi

# ---- 4. Environment variables ----
bold "Setting up .env.local"
if [ "$linked" = true ]; then
  if [ "$had_env" = true ]; then
    backup=".env.local.backup-$(date +%Y%m%d%H%M%S)"
    cp .env.local "$backup"
    ok "Backed up your existing .env.local to $backup"
  fi
  if "${VERCEL[@]}" env pull .env.local --yes --environment=development >/dev/null 2>&1; then
    ok "Pulled development variables from Vercel"
    pulled=true
  else
    warn "Couldn't pull variables from Vercel"
  fi
fi
if [ "$pulled" = false ] && [ ! -f .env.local ]; then
  cp .env.example .env.local
  warn "Created .env.local from .env.example. Fill in the values below by hand."
fi

# ---- 5. Check the values ----
bold "Checking variables"
value_of() { grep -E "^$1=" .env.local | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'"; }
missing=()
for v in "${REQUIRED_VARS[@]}"; do
  if [ -n "$(value_of "$v")" ]; then ok "$v is set"; else missing+=("$v"); warn "$v is missing (required)"; fi
done
for v in "${OPTIONAL_VARS[@]}"; do
  if [ -n "$(value_of "$v")" ]; then ok "$v is set"; else warn "$v is not set (optional)"; fi
done

if [ ${#missing[@]} -gt 0 ]; then
  echo
  echo "  Add the missing values to .env.local, then run: npm run dev"
  echo "  These come from the Vercel project's Development environment. If one is missing there,"
  echo "  ask the project owner to add it for Development (Sensitive variables can't be pulled),"
  echo "  or get the value yourself: DATABASE_URL from the Neon dashboard, TMDB_API_KEY from"
  echo "  https://www.themoviedb.org/settings/api (see README)."
  exit 1
fi

bold "All set. Start the app with: npm run dev  (http://localhost:3000)"
