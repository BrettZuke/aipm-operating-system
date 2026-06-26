#!/usr/bin/env bash
#
# Fails if a live secret is committed to tracked files. Added after a real Stripe
# restricted key (rk_live_…) was pasted into a vitest fixture and pushed (2026-06-18).
# Use env vars or obviously-fake fixtures in tests, never real keys.
#
# Runs in CI (.github/workflows/ci.yml) and can be wired as a local pre-commit hook:
#   ln -sf ../../scripts/check-no-secrets.sh .git/hooks/pre-commit
#
# Patterns are targeted (long real-key runs) so fake fixtures like "sk_live_short"
# or "example-fake-token-…" do NOT trip it.
set -euo pipefail

PATTERN='(sk|rk)_live_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN ([A-Z]+ )?PRIVATE KEY-----|sk-[A-Za-z0-9]{32,}|xox[baprs]-[A-Za-z0-9-]{10,}'

# Exclude this scanner (it contains the patterns) and the CI workflow that calls it.
if git grep -nIE "$PATTERN" -- . ':(exclude)scripts/check-no-secrets.sh' ':(exclude).github/workflows/**'; then
  echo ""
  echo "::error::Potential LIVE secret detected in tracked files (matches above)."
  echo "Never commit real keys. Use process.env.* or an obviously-fake fixture."
  exit 1
fi

echo "secret-scan: clean (no live keys in tracked files)"
