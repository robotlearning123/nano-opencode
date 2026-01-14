#!/usr/bin/env python3
"""Test nano-opencode with OpenRouter API."""
import os
import sys
import time

# Set OpenRouter API key
api_key = os.environ.get("OPENROUTER_API_KEY")
if not api_key:
    print("ERROR: OPENROUTER_API_KEY not set")
    sys.exit(1)

# Configure litellm for OpenRouter
os.environ["OPENROUTER_API_KEY"] = api_key

sys.path.insert(0, '.')
from nano import Agent, Tools
from pathlib import Path

# Use OpenRouter model
MODEL = "openrouter/anthropic/claude-3.5-sonnet"

print("=" * 70)
print("NANO-OPENCODE LIVE TESTING WITH OPENROUTER")
print("=" * 70)
print(f"Model: {MODEL}")
print()

# Test workspace
test_dir = Path("test_workspace")
test_dir.mkdir(exist_ok=True)

# Create test files
(test_dir / "calc.py").write_text('''"""Calculator module."""

def add(a: int, b: int) -> int:
    """Add two numbers."""
    return a + b

def subtract(a: int, b: int) -> int:
    """Subtract b from a."""
    return a - b

def multiply(a: int, b: int) -> int:
    """Multiply two numbers."""
    return a * b
''')

(test_dir / "test_calc.py").write_text('''"""Tests for calculator."""
from calc import add, subtract, multiply

def test_add():
    assert add(2, 3) == 5

def test_subtract():
    assert subtract(5, 3) == 2

def test_multiply():
    assert multiply(3, 4) == 12
''')

# Test cases
tests = [
    {
        "name": "TEST 1: Read and Analyze",
        "task": "Read calc.py and list all the functions defined in it.",
        "check": lambda r: "add" in r.lower() and "subtract" in r.lower()
    },
    {
        "name": "TEST 2: Add Feature",
        "task": "Add a divide function to calc.py that divides a by b. Handle division by zero by returning None.",
        "check": lambda r: (test_dir / "calc.py").read_text().count("def divide") > 0
    },
    {
        "name": "TEST 3: Run Tests",
        "task": "Run pytest on test_calc.py and tell me if the tests pass.",
        "check": lambda r: "pass" in r.lower() or "passed" in r.lower()
    },
]

results = []
total_time = 0
total_tokens = 0

for test in tests:
    print(f"\n{'='*60}")
    print(f"{test['name']}")
    print(f"Task: {test['task']}")
    print("-" * 60)
    
    agent = Agent(test_dir, MODEL)
    
    start = time.time()
    try:
        result = agent.run(test['task'])
        elapsed = time.time() - start
        total_time += elapsed
        total_tokens += agent.tokens
        
        passed = test['check'](result)
        results.append((test['name'], passed, elapsed, agent.calls))
        
        print(f"\nResult: {'✓ PASS' if passed else '✗ FAIL'}")
        print(f"Time: {elapsed:.1f}s | Tokens: {agent.tokens} | Tool calls: {agent.calls}")
    except Exception as e:
        elapsed = time.time() - start
        results.append((test['name'], False, elapsed, 0))
        print(f"\nERROR: {e}")

# Summary
print("\n" + "=" * 70)
print("SUMMARY")
print("=" * 70)
passed = sum(1 for _, p, _, _ in results if p)
print(f"\nResults: {passed}/{len(results)} tests passed")
print(f"Total time: {total_time:.1f}s")
print(f"Total tokens: {total_tokens}")
print()

for name, p, t, calls in results:
    status = "✓ PASS" if p else "✗ FAIL"
    print(f"  {status} | {name} | {t:.1f}s | {calls} calls")

print()
