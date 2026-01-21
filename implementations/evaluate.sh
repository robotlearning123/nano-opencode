#!/bin/bash
# Evaluate all nano-opencode implementations
# Usage: ANTHROPIC_API_KEY=sk-... ./evaluate.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check API key
if [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$ANTHROPIC_AUTH_TOKEN" ]; then
    echo -e "${RED}Error: Set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN${NC}"
    exit 1
fi

# Export for subprocesses
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-$ANTHROPIC_AUTH_TOKEN}"
export ANTHROPIC_BASE_URL="${ANTHROPIC_BASE_URL:-https://api.anthropic.com}"

cd "$(dirname "$0")"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        nano-opencode Multi-Language Evaluation             ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Results array
declare -A RESULTS
declare -A TIMES

# Test function
test_impl() {
    local name=$1
    local cmd=$2
    local prompt=$3

    echo -e "${YELLOW}Testing: ${name}${NC}"

    local start=$(date +%s.%N)
    local output
    output=$(timeout 60 bash -c "$cmd \"$prompt\"" 2>&1) || true
    local end=$(date +%s.%N)
    local duration=$(echo "$end - $start" | bc)

    TIMES[$name]="${duration}s"

    if echo "$output" | grep -qiE "(error|failed|exception)" && ! echo "$output" | grep -qi "no error"; then
        echo -e "  ${RED}✗ FAILED${NC}"
        echo "  Output: ${output:0:100}..."
        RESULTS[$name]="FAIL"
    else
        echo -e "  ${GREEN}✓ PASSED${NC} (${duration}s)"
        echo "  Output: ${output:0:80}..."
        RESULTS[$name]="PASS"
    fi
    echo ""
}

# ═══════════════════════════════════════════════════════════════
# Test 1: Basic Math (no tools)
# ═══════════════════════════════════════════════════════════════
echo -e "${BLUE}═══ Test 1: Basic Math (no tools) ═══${NC}"
echo ""

test_impl "Python" "python3 python/nano.py" "what is 2+2? answer with just the number"
test_impl "TypeScript-Minimal" "bun typescript/nano-minimal.ts" "what is 3+3? answer with just the number"
test_impl "Go" "cd go && go run nano.go" "what is 4+4? answer with just the number"

# ═══════════════════════════════════════════════════════════════
# Test 2: File Reading (tool usage)
# ═══════════════════════════════════════════════════════════════
echo -e "${BLUE}═══ Test 2: File Reading (tool usage) ═══${NC}"
echo ""

# Create test file
echo '{"name": "test", "version": "1.0.0"}' > /tmp/test-nano.json

test_impl "Python-Tool" "python3 python/nano.py" "read /tmp/test-nano.json and tell me the name field only"
test_impl "TypeScript-Tool" "bun typescript/nano-minimal.ts" "read /tmp/test-nano.json and tell me the version field only"
test_impl "Go-Tool" "cd go && go run nano.go" "read /tmp/test-nano.json and tell me both fields"

# ═══════════════════════════════════════════════════════════════
# Test 3: File Writing (tool usage)
# ═══════════════════════════════════════════════════════════════
echo -e "${BLUE}═══ Test 3: File Writing (tool usage) ═══${NC}"
echo ""

test_impl "Python-Write" "python3 python/nano.py" "write 'hello from python' to /tmp/test-python.txt then confirm"
test_impl "TypeScript-Write" "bun typescript/nano-minimal.ts" "write 'hello from typescript' to /tmp/test-ts.txt then confirm"
test_impl "Go-Write" "cd go && go run nano.go" "write 'hello from go' to /tmp/test-go.txt then confirm"

# Verify files
echo -e "${BLUE}Verifying written files:${NC}"
for f in /tmp/test-python.txt /tmp/test-ts.txt /tmp/test-go.txt; do
    if [ -f "$f" ]; then
        echo -e "  ${GREEN}✓${NC} $f: $(cat $f)"
    else
        echo -e "  ${RED}✗${NC} $f: not found"
    fi
done
echo ""

# ═══════════════════════════════════════════════════════════════
# Test 4: Command Execution (bash tool)
# ═══════════════════════════════════════════════════════════════
echo -e "${BLUE}═══ Test 4: Command Execution (bash tool) ═══${NC}"
echo ""

test_impl "Python-Bash" "python3 python/nano.py" "run 'echo hello-python' and show the output"
test_impl "TypeScript-Bash" "bun typescript/nano-minimal.ts" "run 'echo hello-typescript' and show the output"
test_impl "Go-Bash" "cd go && go run nano.go" "run 'echo hello-go' and show the output"

# ═══════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    EVALUATION SUMMARY                       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "| Implementation      | Status | Time     |"
echo -e "|---------------------|--------|----------|"

PASS_COUNT=0
FAIL_COUNT=0

for key in "${!RESULTS[@]}"; do
    status="${RESULTS[$key]}"
    time="${TIMES[$key]}"
    if [ "$status" = "PASS" ]; then
        echo -e "| ${key} | ${GREEN}PASS${NC}   | ${time} |"
        ((PASS_COUNT++))
    else
        echo -e "| ${key} | ${RED}FAIL${NC}   | ${time} |"
        ((FAIL_COUNT++))
    fi
done

echo ""
echo -e "${GREEN}Passed: ${PASS_COUNT}${NC} | ${RED}Failed: ${FAIL_COUNT}${NC}"
echo ""

# Cleanup
rm -f /tmp/test-nano.json /tmp/test-python.txt /tmp/test-ts.txt /tmp/test-go.txt

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
fi
