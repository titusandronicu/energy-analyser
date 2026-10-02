#!/usr/bin/env bash
# PostToolUse (Write|Edit): run the unit tests related to the edited file.
# vitest.config.ts collects src/**/*.test.ts only; integration tests need the local stack and stay out.
export NO_COLOR=1 FORCE_COLOR=0

FILE=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)

case "$FILE" in
  */src/*.ts|*/src/*.tsx) ;;
  *) exit 0 ;;
esac
[ -f "$FILE" ] || exit 0

# Run in the checkout that owns the edited file: in a git worktree CLAUDE_PROJECT_DIR still names the main checkout.
cd "$(git -C "$(dirname "$FILE")" rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-.}")" || exit 0

if ! OUTPUT=$(npx vitest related "$FILE" --run 2>&1); then
  echo "Tests related to $FILE fail:" >&2
  echo "$OUTPUT" >&2
  exit 2
fi
exit 0
