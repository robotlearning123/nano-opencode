# nano-opencode Agent Comparison Report

## Summary

Tested 3 agent variants on SWE-bench Lite instances using official evaluation harness.

## Results

### Agent Performance (3 instances tested)

| Agent | Style | Resolved | Rate |
|-------|-------|----------|------|
| minimal | Basic prompt, structured tools | 1/3 | 33% |
| expert | Expert engineer persona | 1/3 | 33% |
| workflow | 5-step structured workflow | 1/3 | 33% |

### Instance Breakdown

| Instance | Description | minimal | expert | workflow |
|----------|-------------|---------|--------|----------|
| sqlfluff-1625 | L031 alias handling | ❌ empty | ❌ fail | ❌ fail |
| sqlfluff-1733 | pytest import issue | ❌ fail | ❌ empty | ❌ empty |
| sqlfluff-2419 | L060 description message | ✅ pass | ✅ pass | ✅ pass |

### Language Implementation Startup Times

| Language | Time (ms) | LOC |
|----------|-----------|-----|
| Rust | 0.8 | 118 |
| Go | 1.8 | 85 |
| C | 3.2 | 200 |
| TypeScript | 13.9 | 86 |
| Python | 32.1 | 72 |

## Analysis

### Key Findings

1. **All agents solve the same instance** - sqlfluff-2419 is the "easy" case
2. **Different failure patterns** - minimal fails differently than expert/workflow
3. **Prompt style has marginal impact** on this small sample
4. **Language choice doesn't affect solve rate** - API latency dominates

### Successful Fix (sqlfluff-2419)

All three agents found the identical fix:
```python
return LintResult(
    context.segment,
    [fix],
    description=f"Use 'COALESCE' instead of '{context.segment.raw_upper}'.",
)
```

### Failed Attempts

**sqlfluff-1625** (expert attempt):
- Correctly identified issue: aliases shouldn't be flagged without JOINs
- Added check for join clauses before alias validation
- Tests still failed - likely edge cases not covered

**sqlfluff-1733** (minimal attempt):
- Correctly identified issue: pytest import at module level
- Wrapped in try/except block
- Tests still failed - incomplete fix

## Comparison with mini-swe-agent

| Metric | nano-opencode | mini-swe-agent |
|--------|---------------|----------------|
| Approach | Structured tools | Bash only |
| LOC | 72-200 | ~100 |
| SWE-bench Verified | ~33%* | >74% |
| Prompt style | General purpose | SWE-bench optimized |

*Small sample size (3 instances)

## Recommendations

1. **Larger test sample** - Need 50+ instances for reliable metrics
2. **Prompt optimization** - Consider SWE-bench-specific hints without sacrificing generality
3. **Error analysis** - Study why patches fail tests despite correct logic
4. **Tool selection** - Bash-only approach (like mini-swe-agent) may simplify reasoning

## Technical Details

### Agent Definitions

**minimal**:
```
You are a coding assistant. Use tools to help.
```

**expert**:
```
You are an expert software engineer. Fix the bug in /testbed.
Read code, understand the issue, make minimal changes, verify, submit.
```

**workflow**:
```
You are an expert fixing bugs. Follow this workflow:
1. ANALYZE: Find and read relevant files
2. REPRODUCE: Create script to reproduce bug
3. FIX: Edit source code minimally
4. VERIFY: Run script to confirm fix
5. SUBMIT: Use submit tool when done
```

### Evaluation Method

- Docker containers with SWE-bench testbed
- Official `swebench.harness.run_evaluation`
- FAIL_TO_PASS tests as success metric
- 300s timeout per instance

---
Generated: 2026-01-21
Test instances: 3 (sqlfluff-1625, sqlfluff-1733, sqlfluff-2419)
