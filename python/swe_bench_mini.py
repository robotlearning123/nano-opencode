#!/usr/bin/env python3
"""
Mini SWE-bench style evaluation for nano-opencode.
Tests real-world coding tasks similar to SWE-bench format.
"""
import os
import sys
import time
import json
import shutil
import tempfile
from pathlib import Path
from datetime import datetime

sys.path.insert(0, '.')
from nano import Agent

MODEL = "openrouter/anthropic/claude-3.5-sonnet"

# SWE-bench style test cases
TASKS = [
    {
        "id": "calc-001",
        "category": "add_feature",
        "description": "Add power/exponent function",
        "setup": {
            "calc.py": '''def add(a, b):
    return a + b

def subtract(a, b):
    return a - b
'''
        },
        "task": "Add a power function to calc.py that raises a to the power of b. Follow the existing code style.",
        "verify": lambda p: "def power" in (p / "calc.py").read_text() and "**" in (p / "calc.py").read_text()
    },
    {
        "id": "bug-001",
        "category": "bug_fix",
        "description": "Fix off-by-one error",
        "setup": {
            "range_utils.py": '''def get_range(start, end):
    """Return list from start to end inclusive."""
    return list(range(start, end))  # BUG: should be end+1
'''
        },
        "task": "There's a bug in range_utils.py - get_range should return values from start to end INCLUSIVE, but it's missing the end value. Fix the bug.",
        "verify": lambda p: "end + 1" in (p / "range_utils.py").read_text() or "end+1" in (p / "range_utils.py").read_text()
    },
    {
        "id": "refactor-001",
        "category": "refactor",
        "description": "Add error handling",
        "setup": {
            "file_utils.py": '''def read_file(path):
    with open(path) as f:
        return f.read()
'''
        },
        "task": "Add try-except error handling to file_utils.py. If the file doesn't exist, return an empty string instead of crashing.",
        "verify": lambda p: "except" in (p / "file_utils.py").read_text() and ("FileNotFoundError" in (p / "file_utils.py").read_text() or "Exception" in (p / "file_utils.py").read_text())
    },
    {
        "id": "test-001",
        "category": "add_tests",
        "description": "Create unit tests",
        "setup": {
            "string_utils.py": '''def reverse(s):
    return s[::-1]

def uppercase(s):
    return s.upper()
'''
        },
        "task": "Create a test file called test_string_utils.py with unit tests for the reverse and uppercase functions in string_utils.py. Use pytest style.",
        "verify": lambda p: (p / "test_string_utils.py").exists() and "def test_" in (p / "test_string_utils.py").read_text()
    },
    {
        "id": "doc-001",
        "category": "documentation",
        "description": "Add docstrings",
        "setup": {
            "math_ops.py": '''def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)

def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)
'''
        },
        "task": "Add docstrings to all functions in math_ops.py explaining what they do, their parameters, and return values.",
        "verify": lambda p: (p / "math_ops.py").read_text().count('"""') >= 4
    },
]

def run_task(task, work_dir):
    """Run a single task and return results."""
    # Setup files
    for filename, content in task["setup"].items():
        (work_dir / filename).write_text(content)
    
    agent = Agent(work_dir, MODEL)
    
    start = time.time()
    try:
        result = agent.run(task["task"])
        elapsed = time.time() - start
        passed = task["verify"](work_dir)
        return {
            "id": task["id"],
            "category": task["category"],
            "description": task["description"],
            "passed": passed,
            "time": elapsed,
            "tokens": agent.tokens,
            "tool_calls": agent.calls,
            "error": None
        }
    except Exception as e:
        elapsed = time.time() - start
        return {
            "id": task["id"],
            "category": task["category"],
            "description": task["description"],
            "passed": False,
            "time": elapsed,
            "tokens": 0,
            "tool_calls": 0,
            "error": str(e)
        }

def main():
    print("=" * 70)
    print("NANO-OPENCODE: MINI SWE-BENCH EVALUATION")
    print("=" * 70)
    print(f"Model: {MODEL}")
    print(f"Tasks: {len(TASKS)}")
    print(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    results = []
    
    for i, task in enumerate(TASKS, 1):
        print(f"\n[{i}/{len(TASKS)}] {task['id']}: {task['description']}")
        print("-" * 50)
        
        # Create temp directory for this task
        work_dir = Path(tempfile.mkdtemp(prefix=f"swe_{task['id']}_"))
        
        try:
            result = run_task(task, work_dir)
            results.append(result)
            
            status = "✓ PASS" if result["passed"] else "✗ FAIL"
            print(f"Status: {status}")
            print(f"Time: {result['time']:.1f}s | Tokens: {result['tokens']} | Calls: {result['tool_calls']}")
            if result["error"]:
                print(f"Error: {result['error']}")
        finally:
            shutil.rmtree(work_dir, ignore_errors=True)
    
    # Summary
    print("\n" + "=" * 70)
    print("EVALUATION RESULTS")
    print("=" * 70)
    
    passed = sum(1 for r in results if r["passed"])
    total = len(results)
    
    print(f"\nOverall: {passed}/{total} ({100*passed/total:.1f}%)")
    print()
    
    # By category
    categories = {}
    for r in results:
        cat = r["category"]
        if cat not in categories:
            categories[cat] = {"passed": 0, "total": 0}
        categories[cat]["total"] += 1
        if r["passed"]:
            categories[cat]["passed"] += 1
    
    print("By Category:")
    for cat, stats in categories.items():
        pct = 100 * stats["passed"] / stats["total"]
        print(f"  {cat}: {stats['passed']}/{stats['total']} ({pct:.0f}%)")
    
    print()
    print("Detailed Results:")
    print("-" * 70)
    print(f"{'ID':<15} {'Category':<15} {'Status':<8} {'Time':<8} {'Tokens':<8}")
    print("-" * 70)
    for r in results:
        status = "PASS" if r["passed"] else "FAIL"
        print(f"{r['id']:<15} {r['category']:<15} {status:<8} {r['time']:.1f}s{'':<4} {r['tokens']:<8}")
    
    # Aggregate stats
    total_time = sum(r["time"] for r in results)
    total_tokens = sum(r["tokens"] for r in results)
    total_calls = sum(r["tool_calls"] for r in results)
    
    print("-" * 70)
    print(f"{'TOTAL':<15} {'':<15} {passed}/{total:<6} {total_time:.1f}s{'':<4} {total_tokens:<8}")
    print()
    
    # Final verdict
    print("=" * 70)
    if passed/total >= 0.7:
        print(f"✓ BENCHMARK PASSED: {100*passed/total:.1f}% (target: 70%)")
    else:
        print(f"✗ BENCHMARK FAILED: {100*passed/total:.1f}% (target: 70%)")
    print("=" * 70)
    
    return passed, total

if __name__ == "__main__":
    main()
