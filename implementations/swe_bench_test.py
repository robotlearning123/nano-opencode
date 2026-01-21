#!/usr/bin/env python3
"""
SWE-bench Style Test Suite for nano-opencode agents

Inspired by mini-swe-agent's approach: simple bash-based agent achieving >74% on SWE-bench.
Creates realistic software engineering tasks and measures success rate, time, and tool calls.

Usage:
    python swe_bench_test.py                    # Run all tests with Python SWE agent
    python swe_bench_test.py --agent typescript # Run with TypeScript agent
    python swe_bench_test.py --compare          # Compare all agents
    python swe_bench_test.py --mini             # Run minimal agents too
"""

import os
import sys
import json
import time
import shutil
import subprocess
import tempfile
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from datetime import datetime

# Load .env file if exists
def load_env():
    env_paths = [
        Path(__file__).parent / ".env",
        Path(__file__).parent.parent / ".env",
    ]
    for env_path in env_paths:
        if env_path.exists():
            for line in env_path.read_text().split("\n"):
                if "=" in line and not line.startswith("#"):
                    key, _, value = line.partition("=")
                    os.environ.setdefault(key.strip(), value.strip())

load_env()

# ═══════════════════════════════════════════════════════════════════════════════
# TEST CASES - SWE-bench style tasks
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class TestCase:
    id: str
    name: str
    difficulty: str  # easy, medium, hard
    setup_files: Dict[str, str]
    prompt: str
    validation_cmd: str  # Command to validate the fix
    expected_output: str  # Expected substring in validation output

TEST_CASES = [
    # ═══════════════════════════════════════════════════════════════════════════
    # EASY: Simple Bug Fixes
    # ═══════════════════════════════════════════════════════════════════════════
    TestCase(
        id="easy_001",
        name="Fix Off-by-One Error",
        difficulty="easy",
        setup_files={
            "utils.py": '''def get_last_n(items, n):
    """Return the last n items."""
    if n <= 0: return []
    return items[-n+1:]  # BUG: should be -n

def test():
    assert get_last_n([1,2,3,4,5], 2) == [4,5], f"Got {get_last_n([1,2,3,4,5], 2)}"
    assert get_last_n([1,2,3,4,5], 1) == [5]
    print("PASS")

if __name__ == "__main__": test()
'''},
        prompt="The get_last_n function in utils.py has a bug - it returns wrong results. Fix it and verify with: python utils.py",
        validation_cmd="python utils.py",
        expected_output="PASS",
    ),

    TestCase(
        id="easy_002",
        name="Fix None Check",
        difficulty="easy",
        setup_files={
            "service.py": '''class UserService:
    def __init__(self):
        self.users = {"1": {"name": "Alice"}}

    def get_name(self, uid):
        return self.users[uid]["name"]  # BUG: crashes if uid not found

def test():
    s = UserService()
    assert s.get_name("1") == "Alice"
    assert s.get_name("999") is None  # Should return None, not crash
    print("PASS")

if __name__ == "__main__": test()
'''},
        prompt="Fix service.py - the get_name method crashes for non-existent users. It should return None instead. Test with: python service.py",
        validation_cmd="python service.py",
        expected_output="PASS",
    ),

    TestCase(
        id="easy_003",
        name="Fix String Formatting",
        difficulty="easy",
        setup_files={
            "formatter.py": '''def format_price(amount):
    """Format price with 2 decimal places and $ sign."""
    return f"${amount}"  # BUG: missing .2f formatting

def test():
    assert format_price(10) == "$10.00", f"Got {format_price(10)}"
    assert format_price(9.5) == "$9.50"
    assert format_price(100.999) == "$101.00"
    print("PASS")

if __name__ == "__main__": test()
'''},
        prompt="Fix formatter.py - format_price should always show 2 decimal places. Run: python formatter.py",
        validation_cmd="python formatter.py",
        expected_output="PASS",
    ),

    # ═══════════════════════════════════════════════════════════════════════════
    # MEDIUM: Feature Implementation
    # ═══════════════════════════════════════════════════════════════════════════
    TestCase(
        id="med_001",
        name="Add Input Validation",
        difficulty="medium",
        setup_files={
            "calc.py": '''def divide(a, b):
    """Divide a by b."""
    return a / b  # TODO: validate inputs

def test():
    assert divide(10, 2) == 5
    try:
        divide(5, 0)
        assert False, "Should raise ValueError"
    except ValueError as e:
        assert "zero" in str(e).lower()
    try:
        divide("10", 2)
        assert False, "Should raise TypeError"
    except TypeError:
        pass
    print("PASS")

if __name__ == "__main__": test()
'''},
        prompt="Add input validation to divide() in calc.py: raise ValueError for division by zero, TypeError for non-numeric inputs. Test: python calc.py",
        validation_cmd="python calc.py",
        expected_output="PASS",
    ),

    TestCase(
        id="med_002",
        name="Implement Memoization",
        difficulty="medium",
        setup_files={
            "fib.py": '''call_count = 0

def fib(n):
    global call_count
    call_count += 1
    if n <= 1: return n
    return fib(n-1) + fib(n-2)  # TODO: add memoization

def test():
    global call_count
    call_count = 0
    result = fib(30)
    assert result == 832040, f"Wrong: {result}"
    assert call_count < 100, f"Too many calls: {call_count} (needs memoization)"
    print("PASS")

if __name__ == "__main__": test()
'''},
        prompt="Add memoization to fib() in fib.py to make it efficient. Without caching, fib(30) makes millions of calls. Test: python fib.py",
        validation_cmd="timeout 10 python fib.py",
        expected_output="PASS",
    ),

    TestCase(
        id="med_003",
        name="Implement Retry Logic",
        difficulty="medium",
        setup_files={
            "api.py": '''import time

class APIError(Exception): pass

class Client:
    def __init__(self):
        self.calls = 0
        self.fail_until = 3

    def call(self):
        self.calls += 1
        if self.calls <= self.fail_until:
            raise APIError("Temporary failure")
        return "OK"

    def call_with_retry(self, max_retries=5, delay=0.01):
        """Call with retry and exponential backoff. TODO: implement"""
        return self.call()  # BUG: no retry logic

def test():
    c = Client()
    c.fail_until = 3
    result = c.call_with_retry(max_retries=5, delay=0.01)
    assert result == "OK"
    assert c.calls == 4, f"Expected 4 calls, got {c.calls}"

    c2 = Client()
    c2.fail_until = 10
    try:
        c2.call_with_retry(max_retries=2, delay=0.01)
        assert False, "Should have raised"
    except APIError:
        pass
    print("PASS")

if __name__ == "__main__": test()
'''},
        prompt="Implement retry logic in call_with_retry() in api.py. Retry on APIError up to max_retries times with exponential backoff. Test: python api.py",
        validation_cmd="python api.py",
        expected_output="PASS",
    ),

    # ═══════════════════════════════════════════════════════════════════════════
    # MEDIUM: Multi-file Refactoring
    # ═══════════════════════════════════════════════════════════════════════════
    TestCase(
        id="med_004",
        name="Extract Shared Code",
        difficulty="medium",
        setup_files={
            "user.py": '''def format_user(u):
    name = u.get("name", "Unknown")
    email = u.get("email", "")
    return f"{name} <{email}>" if email else name

def process(u):
    return format_user(u)
''',
            "order.py": '''def format_customer(c):  # Duplicated logic!
    name = c.get("name", "Unknown")
    email = c.get("email", "")
    return f"{name} <{email}>" if email else name

def process(c):
    return format_customer(c)
''',
            "test_shared.py": '''from shared import format_entity
from user import process as process_user
from order import process as process_order

def test():
    assert format_entity({"name": "A"}) == "A"
    assert format_entity({"name": "B", "email": "b@x.com"}) == "B <b@x.com>"
    assert process_user({"name": "C", "email": "c@x.com"}) == "C <c@x.com>"
    assert process_order({"name": "D"}) == "D"
    print("PASS")

if __name__ == "__main__": test()
'''},
        prompt="Extract the duplicated formatting logic from user.py and order.py into shared.py with a format_entity function. Update both files to use it. Test: python test_shared.py",
        validation_cmd="python test_shared.py",
        expected_output="PASS",
    ),

    # ═══════════════════════════════════════════════════════════════════════════
    # HARD: Complex Bug Fixes
    # ═══════════════════════════════════════════════════════════════════════════
    TestCase(
        id="hard_001",
        name="Fix Race Condition",
        difficulty="hard",
        setup_files={
            "counter.py": '''import threading
import time

class Counter:
    def __init__(self):
        self.value = 0

    def increment(self):
        # BUG: Race condition
        v = self.value
        time.sleep(0.001)
        self.value = v + 1

def test():
    c = Counter()
    threads = [threading.Thread(target=lambda: [c.increment() for _ in range(100)]) for _ in range(10)]
    for t in threads: t.start()
    for t in threads: t.join()
    assert c.value == 1000, f"Race condition! Got {c.value}"
    print("PASS")

if __name__ == "__main__": test()
'''},
        prompt="Fix the race condition in counter.py. The Counter class needs thread-safe incrementing. Use proper synchronization. Test: python counter.py",
        validation_cmd="python counter.py",
        expected_output="PASS",
    ),

    TestCase(
        id="hard_002",
        name="Fix Memory Leak Pattern",
        difficulty="hard",
        setup_files={
            "cache.py": '''import weakref

class Cache:
    def __init__(self):
        self._cache = {}  # BUG: Strong refs cause memory leak

    def get(self, key):
        if key in self._cache:
            obj = self._cache[key]
            return obj() if callable(obj) else obj
        return None

    def set(self, key, value):
        self._cache[key] = value  # BUG: Should use weak refs

class BigObject:
    def __init__(self, id):
        self.id = id
        self.data = [0] * 1000

def test():
    import gc
    cache = Cache()

    # Create and cache object
    obj = BigObject(1)
    obj_id = id(obj)
    cache.set("obj1", obj)

    # Remove strong reference
    del obj
    gc.collect()

    # With weak refs, object should be gone
    result = cache.get("obj1")
    assert result is None, "Memory leak! Object should be garbage collected"
    print("PASS")

if __name__ == "__main__": test()
'''},
        prompt="Fix the memory leak in cache.py. The Cache should use weak references so objects can be garbage collected when no other references exist. Test: python cache.py",
        validation_cmd="python cache.py",
        expected_output="PASS",
    ),
]

# ═══════════════════════════════════════════════════════════════════════════════
# TEST RUNNER
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class TestResult:
    test_id: str
    name: str
    difficulty: str
    success: bool
    time_sec: float
    error: Optional[str] = None

def run_test(test: TestCase, agent_cmd: List[str], timeout: int = 180) -> TestResult:
    """Run a single test case"""
    print(f"\n{'─'*60}")
    print(f"TEST: {test.id} - {test.name} [{test.difficulty}]")
    print(f"{'─'*60}")

    # Create temp directory
    test_dir = tempfile.mkdtemp(prefix=f"swe_{test.id}_")

    try:
        # Setup files
        for name, content in test.setup_files.items():
            (Path(test_dir) / name).write_text(content)

        # Run agent
        start = time.time()
        print(f"Running agent...")

        result = subprocess.run(
            agent_cmd + [test.prompt],
            capture_output=True,
            text=True,
            cwd=test_dir,
            timeout=timeout,
            env={**os.environ, "VERBOSE": "1"}
        )

        elapsed = time.time() - start

        # Count tool calls
        tool_calls = result.stdout.count("⚡") + result.stderr.count("⚡")
        print(f"Agent finished in {elapsed:.1f}s ({tool_calls} tool calls)")

        # Validate
        print(f"Validating: {test.validation_cmd}")
        val_result = subprocess.run(
            test.validation_cmd,
            shell=True,
            capture_output=True,
            text=True,
            cwd=test_dir,
            timeout=30
        )

        output = val_result.stdout + val_result.stderr
        success = test.expected_output in output

        if success:
            print(f"✅ PASSED")
        else:
            print(f"❌ FAILED")
            print(f"Expected '{test.expected_output}' in output:")
            print(output[:500])

        return TestResult(
            test_id=test.id,
            name=test.name,
            difficulty=test.difficulty,
            success=success,
            time_sec=elapsed,
            error=None if success else output[:200]
        )

    except subprocess.TimeoutExpired:
        print(f"❌ TIMEOUT after {timeout}s")
        return TestResult(test.id, test.name, test.difficulty, False, timeout, "Timeout")
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return TestResult(test.id, test.name, test.difficulty, False, 0, str(e))
    finally:
        shutil.rmtree(test_dir, ignore_errors=True)

def run_suite(agent_cmd: List[str], tests: List[TestCase] = None) -> Dict[str, Any]:
    """Run test suite and return results"""
    tests = tests or TEST_CASES
    results = [run_test(t, agent_cmd) for t in tests]

    passed = sum(1 for r in results if r.success)
    total_time = sum(r.time_sec for r in results)

    by_diff = {}
    for r in results:
        if r.difficulty not in by_diff:
            by_diff[r.difficulty] = {"passed": 0, "total": 0}
        by_diff[r.difficulty]["total"] += 1
        if r.success:
            by_diff[r.difficulty]["passed"] += 1

    return {
        "total": len(results),
        "passed": passed,
        "failed": len(results) - passed,
        "pass_rate": passed / len(results) * 100,
        "total_time": total_time,
        "avg_time": total_time / len(results),
        "by_difficulty": by_diff,
        "results": [{"id": r.test_id, "success": r.success, "time": r.time_sec} for r in results]
    }

def print_summary(data: Dict[str, Any], agent: str):
    """Print results summary"""
    print(f"""
╔══════════════════════════════════════════════════════════════════════╗
║  SWE-BENCH TEST RESULTS: {agent:<42} ║
╠══════════════════════════════════════════════════════════════════════╣
║  Total: {data['total']:<5} │ Passed: {data['passed']:<5} │ Failed: {data['failed']:<5} │ Rate: {data['pass_rate']:>5.1f}% ║
║  Time:  {data['total_time']:.1f}s total │ {data['avg_time']:.1f}s average{' '*27} ║
╠══════════════════════════════════════════════════════════════════════╣""")

    for diff in ["easy", "medium", "hard"]:
        if diff in data["by_difficulty"]:
            d = data["by_difficulty"][diff]
            pct = d["passed"] / d["total"] * 100 if d["total"] > 0 else 0
            bar = "█" * int(pct / 10) + "░" * (10 - int(pct / 10))
            print(f"║  {diff.capitalize():<8} {d['passed']}/{d['total']} {bar} {pct:>5.1f}%{' '*26} ║")

    print("╠══════════════════════════════════════════════════════════════════════╣")
    for r in data["results"]:
        status = "✅" if r["success"] else "❌"
        print(f"║  {status} {r['id']:<12} {r['time']:>6.1f}s{' '*43} ║")
    print("╚══════════════════════════════════════════════════════════════════════╝")

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    import argparse
    parser = argparse.ArgumentParser(description="SWE-bench Test Suite")
    parser.add_argument("--agent", choices=["python", "typescript", "mini-py", "mini-ts"], default="python")
    parser.add_argument("--compare", action="store_true", help="Compare all agents")
    parser.add_argument("--mini", action="store_true", help="Include minimal agents in comparison")
    parser.add_argument("--difficulty", choices=["easy", "medium", "hard"])
    parser.add_argument("--test", help="Run specific test ID")
    parser.add_argument("--output", "-o", help="Save JSON results")
    args = parser.parse_args()

    script_dir = Path(__file__).parent

    agents = {
        "python": ["python3", str(script_dir / "python" / "nano_swe.py")],
        "typescript": ["bun", str(script_dir / "typescript" / "nano-swe.ts")],
        "mini-py": ["python3", str(script_dir / "python" / "nano.py")],
        "mini-ts": ["bun", str(script_dir / "typescript" / "nano-minimal.ts")],
    }

    # Filter tests
    tests = TEST_CASES
    if args.test:
        tests = [t for t in tests if t.id == args.test]
    if args.difficulty:
        tests = [t for t in tests if t.difficulty == args.difficulty]

    if args.compare:
        all_results = {}
        agent_list = ["python", "typescript"]
        if args.mini:
            agent_list += ["mini-py", "mini-ts"]

        for name in agent_list:
            cmd = agents[name]
            if not Path(cmd[1]).exists():
                print(f"Skipping {name}: {cmd[1]} not found")
                continue
            print(f"\n{'#'*70}\n# TESTING: {name}\n{'#'*70}")
            data = run_suite(cmd, tests)
            data["agent"] = name
            all_results[name] = data
            print_summary(data, name)

        # Comparison
        print(f"""
╔══════════════════════════════════════════════════════════════════════╗
║                      AGENT COMPARISON                                 ║
╠══════════════════════════════════════════════════════════════════════╣
║  Agent          │ Pass Rate │ Avg Time │ Easy  │ Medium │ Hard       ║
╠═════════════════╪═══════════╪══════════╪═══════╪════════╪════════════╣""")

        for name, d in all_results.items():
            easy = d["by_difficulty"].get("easy", {"passed": 0, "total": 0})
            med = d["by_difficulty"].get("medium", {"passed": 0, "total": 0})
            hard = d["by_difficulty"].get("hard", {"passed": 0, "total": 0})
            print(f"║  {name:<14} │ {d['pass_rate']:>7.1f}% │ {d['avg_time']:>7.1f}s │ {easy['passed']}/{easy['total']:<3} │ {med['passed']}/{med['total']:<4} │ {hard['passed']}/{hard['total']:<3}       ║")

        print("╚═════════════════╧═══════════╧══════════╧═══════╧════════╧════════════╝")

        if args.output:
            with open(args.output, "w") as f:
                json.dump(all_results, f, indent=2)
    else:
        cmd = agents[args.agent]
        if not Path(cmd[1]).exists():
            print(f"Agent not found: {cmd[1]}")
            sys.exit(1)

        data = run_suite(cmd, tests)
        data["agent"] = args.agent
        print_summary(data, args.agent)

        if args.output:
            with open(args.output, "w") as f:
                json.dump(data, f, indent=2)

if __name__ == "__main__":
    main()
