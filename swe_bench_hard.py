#!/usr/bin/env python3
"""
Harder SWE-bench style tasks - multi-file, complex bugs.
"""
import os
import sys
import time
import shutil
import tempfile
from pathlib import Path
from datetime import datetime

sys.path.insert(0, '.')
from nano import Agent

MODEL = "openrouter/anthropic/claude-3.5-sonnet"

HARD_TASKS = [
    {
        "id": "multi-001",
        "category": "multi_file",
        "description": "Add function and import in another file",
        "setup": {
            "utils.py": '''def greet(name):
    return f"Hello, {name}!"
''',
            "main.py": '''from utils import greet

def main():
    print(greet("World"))

if __name__ == "__main__":
    main()
'''
        },
        "task": "Add a farewell(name) function to utils.py that returns 'Goodbye, {name}!'. Then update main.py to also import and call farewell after greet.",
        "verify": lambda p: (
            "def farewell" in (p / "utils.py").read_text() and
            "farewell" in (p / "main.py").read_text() and
            "import" in (p / "main.py").read_text()
        )
    },
    {
        "id": "complex-001",
        "category": "complex_bug",
        "description": "Fix logic bug in sorting",
        "setup": {
            "sorter.py": '''def bubble_sort(arr):
    """Sort array using bubble sort."""
    n = len(arr)
    for i in range(n):
        for j in range(0, n-i-1):
            if arr[j] < arr[j+1]:  # BUG: should be > for ascending
                arr[j], arr[j+1] = arr[j+1], arr[j]
    return arr
'''
        },
        "task": "The bubble_sort function in sorter.py is supposed to sort in ASCENDING order but it's sorting in descending order. Find and fix the bug.",
        "verify": lambda p: "arr[j] > arr[j+1]" in (p / "sorter.py").read_text() or "arr[j] >" in (p / "sorter.py").read_text()
    },
    {
        "id": "class-001",
        "category": "class_modification",
        "description": "Add method to class",
        "setup": {
            "counter.py": '''class Counter:
    def __init__(self):
        self.count = 0
    
    def increment(self):
        self.count += 1
        return self.count
    
    def get_count(self):
        return self.count
'''
        },
        "task": "Add a decrement method to the Counter class in counter.py that decreases count by 1 and returns the new count. Also add a reset method that sets count to 0.",
        "verify": lambda p: (
            "def decrement" in (p / "counter.py").read_text() and
            "def reset" in (p / "counter.py").read_text()
        )
    },
    {
        "id": "debug-001",
        "category": "debugging",
        "description": "Fix multiple issues",
        "setup": {
            "validator.py": '''def validate_email(email):
    """Check if email is valid."""
    if "@" not in email:
        return False
    if "." not in email:
        return Flase  # Typo: Flase instead of False
    return True

def validate_age(age):
    """Check if age is valid (0-150)."""
    if age < 0:
        return False
    if age > 150:
        return False
    return true  # Bug: lowercase true
'''
        },
        "task": "Fix all the bugs in validator.py. There are typos in the return statements.",
        "verify": lambda p: (
            "Flase" not in (p / "validator.py").read_text() and
            "return true" not in (p / "validator.py").read_text() and
            "return True" in (p / "validator.py").read_text()
        )
    },
    {
        "id": "integration-001",
        "category": "integration",
        "description": "Create and integrate new module",
        "setup": {
            "app.py": '''# Main application
def run():
    print("App running")
    # TODO: Add logging
'''
        },
        "task": "Create a new file logger.py with a log(message) function that prints '[LOG] {message}'. Then import and use it in app.py to log 'App started' at the beginning of run().",
        "verify": lambda p: (
            (p / "logger.py").exists() and
            "def log" in (p / "logger.py").read_text() and
            "from logger import" in (p / "app.py").read_text() or "import logger" in (p / "app.py").read_text()
        )
    },
]

def run_task(task, work_dir):
    for filename, content in task["setup"].items():
        (work_dir / filename).write_text(content)
    
    agent = Agent(work_dir, MODEL)
    start = time.time()
    try:
        result = agent.run(task["task"])
        elapsed = time.time() - start
        passed = task["verify"](work_dir)
        return {"id": task["id"], "category": task["category"], "passed": passed, 
                "time": elapsed, "tokens": agent.tokens, "calls": agent.calls, "error": None}
    except Exception as e:
        return {"id": task["id"], "category": task["category"], "passed": False,
                "time": time.time()-start, "tokens": 0, "calls": 0, "error": str(e)}

def main():
    print("=" * 70)
    print("NANO-OPENCODE: HARD SWE-BENCH EVALUATION")
    print("=" * 70)
    print(f"Model: {MODEL}")
    print(f"Tasks: {len(HARD_TASKS)} (harder difficulty)")
    print()
    
    results = []
    for i, task in enumerate(HARD_TASKS, 1):
        print(f"\n[{i}/{len(HARD_TASKS)}] {task['id']}: {task['description']}")
        print("-" * 50)
        
        work_dir = Path(tempfile.mkdtemp(prefix=f"swe_hard_{task['id']}_"))
        try:
            result = run_task(task, work_dir)
            results.append(result)
            status = "✓ PASS" if result["passed"] else "✗ FAIL"
            print(f"Status: {status} | Time: {result['time']:.1f}s | Tokens: {result['tokens']} | Calls: {result['calls']}")
        finally:
            shutil.rmtree(work_dir, ignore_errors=True)
    
    # Summary
    print("\n" + "=" * 70)
    print("HARD EVALUATION RESULTS")
    print("=" * 70)
    
    passed = sum(1 for r in results if r["passed"])
    total = len(results)
    total_time = sum(r["time"] for r in results)
    total_tokens = sum(r["tokens"] for r in results)
    
    print(f"\nOverall: {passed}/{total} ({100*passed/total:.1f}%)")
    print(f"Total time: {total_time:.1f}s")
    print(f"Total tokens: {total_tokens}")
    print()
    
    for r in results:
        status = "✓" if r["passed"] else "✗"
        print(f"  {status} {r['id']}: {r['category']} ({r['time']:.1f}s)")
    
    print("\n" + "=" * 70)
    if passed/total >= 0.6:
        print(f"✓ HARD BENCHMARK PASSED: {100*passed/total:.1f}% (target: 60%)")
    else:
        print(f"✗ HARD BENCHMARK FAILED: {100*passed/total:.1f}% (target: 60%)")
    print("=" * 70)

if __name__ == "__main__":
    main()
