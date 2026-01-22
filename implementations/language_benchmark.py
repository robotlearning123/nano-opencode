#!/usr/bin/env python3
"""
Multi-Language nano-opencode Benchmark
Tests all language implementations (Python, Go, Rust, Zig, C, TypeScript)
on the same tasks and compares performance.
"""

import json
import os
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path

# Language implementations
IMPLEMENTATIONS = {
    "python": {
        "cmd": ["python3", "python/nano.py"],
        "build": None,
    },
    "go": {
        "cmd": ["./go/nano"],
        "build": ["go", "build", "-o", "nano", "nano.go"],
        "build_dir": "go",
    },
    "rust": {
        "cmd": ["./rust/target/release/nano-opencode"],
        "build": ["cargo", "build", "--release"],
        "build_dir": "rust",
    },
    "zig": {
        "cmd": ["./zig/zig-out/bin/nano"],
        "build": ["zig", "build", "-Doptimize=ReleaseFast"],
        "build_dir": "zig",
    },
    "c": {
        "cmd": ["./c/nano"],
        "build": ["make"],
        "build_dir": "c",
    },
    "typescript": {
        "cmd": ["bun", "typescript/nano-minimal.ts"],
        "build": None,
    },
}

# Test prompts (simple tasks that complete quickly)
TEST_PROMPTS = [
    "list files in the current directory",
    "read the file README.md and tell me what it's about",
    "create a file called test.txt with the content 'hello world'",
]

@dataclass
class Result:
    language: str
    prompt: str
    success: bool
    startup_time: float  # Time to first tool call
    total_time: float
    tool_calls: int
    output: str
    error: str = ""

def build_implementation(lang: str, impl: dict, base_dir: Path) -> bool:
    """Build implementation if needed."""
    if impl.get("build") is None:
        return True

    build_dir = base_dir / impl.get("build_dir", "")
    print(f"  Building {lang}...")
    try:
        result = subprocess.run(
            impl["build"],
            cwd=build_dir,
            capture_output=True,
            text=True,
            timeout=120
        )
        if result.returncode != 0:
            print(f"    Build failed: {result.stderr}")
            return False
        return True
    except Exception as e:
        print(f"    Build error: {e}")
        return False

def run_test(lang: str, impl: dict, prompt: str, base_dir: Path, timeout: int = 60) -> Result:
    """Run a single test."""
    start = time.time()

    try:
        cmd = impl["cmd"] + [prompt]
        # Handle relative paths
        if cmd[0].startswith("./"):
            cmd[0] = str(base_dir / cmd[0][2:])

        result = subprocess.run(
            cmd,
            cwd=base_dir,
            capture_output=True,
            text=True,
            timeout=timeout,
            env={**os.environ}
        )

        total_time = time.time() - start
        output = result.stdout + result.stderr

        # Count tool calls (⚡ markers)
        tool_calls = output.count("⚡")

        return Result(
            language=lang,
            prompt=prompt[:50],
            success=(result.returncode == 0),
            startup_time=0,  # Would need more instrumentation
            total_time=total_time,
            tool_calls=tool_calls,
            output=output[:500],
        )
    except subprocess.TimeoutExpired:
        return Result(
            language=lang,
            prompt=prompt[:50],
            success=False,
            startup_time=0,
            total_time=timeout,
            tool_calls=0,
            output="",
            error="Timeout"
        )
    except Exception as e:
        return Result(
            language=lang,
            prompt=prompt[:50],
            success=False,
            startup_time=0,
            total_time=time.time() - start,
            tool_calls=0,
            output="",
            error=str(e)
        )

def measure_startup(lang: str, impl: dict, base_dir: Path, iterations: int = 3) -> float:
    """Measure startup time (no API call)."""
    times = []
    for _ in range(iterations):
        start = time.time()
        try:
            cmd = impl["cmd"]
            if cmd[0].startswith("./"):
                cmd = [str(base_dir / cmd[0][2:])] + cmd[1:]

            subprocess.run(
                cmd,  # No arguments = should show usage and exit quickly
                cwd=base_dir,
                capture_output=True,
                timeout=5
            )
        except:
            pass
        times.append(time.time() - start)

    return sum(times) / len(times) * 1000  # Convert to ms

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--langs", nargs="+", default=list(IMPLEMENTATIONS.keys()))
    parser.add_argument("--build", action="store_true", help="Build implementations first")
    parser.add_argument("--startup-only", action="store_true", help="Only measure startup time")
    args = parser.parse_args()

    base_dir = Path(__file__).parent

    print("=" * 60)
    print("nano-opencode Multi-Language Benchmark")
    print("=" * 60)

    # Check API key
    if not os.environ.get("ANTHROPIC_API_KEY") and not os.environ.get("ANTHROPIC_AUTH_TOKEN"):
        print("\nWarning: No API key set. API tests will fail.")
        print("Set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN\n")

    results = []
    startup_times = {}

    for lang in args.langs:
        if lang not in IMPLEMENTATIONS:
            print(f"Unknown language: {lang}")
            continue

        impl = IMPLEMENTATIONS[lang]
        print(f"\n{'='*40}")
        print(f"Testing: {lang.upper()}")
        print(f"{'='*40}")

        # Build if needed
        if args.build:
            if not build_implementation(lang, impl, base_dir):
                print(f"  Skipping {lang} (build failed)")
                continue

        # Measure startup time
        print(f"  Measuring startup time...")
        startup = measure_startup(lang, impl, base_dir)
        startup_times[lang] = startup
        print(f"    Startup: {startup:.1f} ms")

        if args.startup_only:
            continue

        # Run API tests
        for i, prompt in enumerate(TEST_PROMPTS):
            print(f"\n  Test {i+1}: {prompt[:40]}...")
            result = run_test(lang, impl, prompt, base_dir)
            results.append(result)

            if result.success:
                print(f"    ✓ Time: {result.total_time:.2f}s, Tools: {result.tool_calls}")
            else:
                print(f"    ✗ Error: {result.error or 'Failed'}")

    # Summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")

    print("\nStartup Times:")
    for lang, ms in sorted(startup_times.items(), key=lambda x: x[1]):
        print(f"  {lang:12} {ms:6.1f} ms")

    if results:
        print("\nAPI Test Results:")
        by_lang = {}
        for r in results:
            if r.language not in by_lang:
                by_lang[r.language] = {"success": 0, "total": 0, "time": 0}
            by_lang[r.language]["total"] += 1
            if r.success:
                by_lang[r.language]["success"] += 1
                by_lang[r.language]["time"] += r.total_time

        for lang, stats in by_lang.items():
            success_rate = stats["success"] / stats["total"] * 100 if stats["total"] > 0 else 0
            avg_time = stats["time"] / stats["success"] if stats["success"] > 0 else 0
            print(f"  {lang:12} Success: {success_rate:5.1f}%  Avg Time: {avg_time:.2f}s")

if __name__ == "__main__":
    main()
