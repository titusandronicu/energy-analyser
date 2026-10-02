#!/usr/bin/env bash
# PostToolUse (Write|Edit): lint the file the agent just edited.
# Exit 2 + stderr is the only combination Claude sees.
export NO_COLOR=1 FORCE_COLOR=0

FILE=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)

# Extensions come from eslint.config.js (typescript-eslint, react, eslint-plugin-astro, scripts/*.mjs).
case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.astro) ;;
  *) exit 0 ;;
esac
[ -f "$FILE" ] || exit 0

# Run in the checkout that owns the edited file: in a git worktree CLAUDE_PROJECT_DIR still names the main checkout.
cd "$(git -C "$(dirname "$FILE")" rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-.}")" || exit 0

if ! OUTPUT=$(npx eslint --quiet "$FILE" 2>&1); then
  echo "ESLint reported errors in $FILE:" >&2
  echo "$OUTPUT" >&2
  exit 2
fi
exit 0
