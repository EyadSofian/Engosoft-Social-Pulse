#!/bin/zsh
# Asks headless Claude Code one representative question per project skill and reports which skill it invoked.
# Uses your Claude plan's usage (nine short sessions). Run from the repository root: zsh scripts/skills/probe-triggers.sh
set -u
out=$(mktemp -d)
while IFS=$'\t' read -r skill prompt; do
  claude -p "$prompt" --output-format stream-json --verbose --max-turns 6 --allowedTools "Skill Read Grep Glob" --strict-mcp-config > "$out/$skill.jsonl" 2>&1 &
done < scripts/skills/trigger-prompts.tsv
wait
fail=0
for f in "$out"/*.jsonl; do
  expected=$(basename "$f" .jsonl)
  got=$(grep -o '"name":"Skill","input":{"skill":"[^"]*"' "$f" | sed 's/.*"skill":"//;s/"//' | sort -u | tr '\n' ' ')
  if grep -q '"api_error"' "$f"; then echo "ERROR    $expected: $(grep -o '"result":"[^"]*"' "$f" | head -1)"; fail=1
  elif [[ " $got " == *" $expected "* ]]; then echo "OK       $expected"
  else echo "MISSED   $expected (invoked: ${got:-none})"; fail=1; fi
done
exit $fail
