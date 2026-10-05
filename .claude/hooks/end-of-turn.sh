#!/usr/bin/env bash
# Stop: sweep everything this turn changed before the agent finishes, one retry.
export NO_COLOR=1 FORCE_COLOR=0

INPUT=$(cat)

# Sweep the checkout the session works in: in a git worktree CLAUDE_PROJECT_DIR still names the main checkout.
SESSION_CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
ROOT=$(git -C "${SESSION_CWD:-.}" rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-.}")
cd "$ROOT" || exit 0

# Already sent back once by this hook: let it finish. The commit gate (husky + lint-staged) and CI catch the rest.
ACTIVE=$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)
LOOPS=$(printf '%s' "$INPUT" | jq -r '.loop_count // 0' 2>/dev/null)
if [ "$ACTIVE" = "true" ] || [ "${LOOPS:-0}" != "0" ]; then
  exit 0
fi

# Changed and new files. Nothing changed (a Q&A turn): nothing to check.
CHANGED=$({ git diff --name-only HEAD; git ls-files -o --exclude-standard; } 2>/dev/null | sort -u)
[ -n "$CHANGED" ] || exit 0

# Changed files ESLint covers that still exist. Also catches files rewritten through a shell command.
FILES=()
while IFS= read -r f; do
  case "$f" in *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.astro) [ -f "$f" ] && FILES+=("$f") ;; esac
done <<LIST
$CHANGED
LIST

# Nothing the gates cover (docs, SQL, config only): nothing to check.
HEAVY=0
[ "${#FILES[@]}" -gt 0 ] && HEAVY=1
printf '%s\n' "$CHANGED" | grep --color=never -qE '^(package\.json|package-lock\.json|tsconfig\.json|vitest\.config\.ts)$' && HEAVY=1
[ "$HEAVY" = 1 ] || exit 0

REPORT=""
if [ "${#FILES[@]}" -gt 0 ]; then
  OUT=$(npx eslint --quiet "${FILES[@]}" 2>&1) || REPORT="$REPORT
ESLint errors in changed files:
$OUT
"
fi

# Whole unit suite (a couple of seconds), so it also catches a red test in a module only imported.
OUT=$(npx vitest run 2>&1) || REPORT="$REPORT
Unit tests fail:
$(printf '%s\n' "$OUT" | tail -n 80)
"

# Same command as CI. It syncs .astro/ types itself.
# astro check ignores NO_COLOR, so strip ANSI escapes for the model.
OUT=$(npx astro check --minimumSeverity error 2>&1) || REPORT="$REPORT
Typecheck (astro check) fails:
$(printf '%s\n' "$OUT" | sed $'s/\x1b\\[[0-9;]*m//g' | tail -n 80)
"

if [ -n "$REPORT" ]; then
  echo "Fix these before you finish:$REPORT" >&2
  exit 2
fi
exit 0
