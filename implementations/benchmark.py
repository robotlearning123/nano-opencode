#!/usr/bin/env python3
"""
nano-opencode API Benchmark Tool

Measures API performance metrics:
- Latency (time to first byte, total response time)
- Throughput (tokens per second)
- Error rate
- Cost estimation

Usage:
    python benchmark.py                    # Quick benchmark (5 iterations)
    python benchmark.py --full             # Full benchmark (20 iterations)
    python benchmark.py --endpoint z.ai    # Test specific endpoint
"""

import os, sys, json, time, statistics
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
from datetime import datetime
from typing import List, Dict, Any

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

ENDPOINTS = {
    "anthropic": {
        "url": "https://api.anthropic.com/v1/messages",
        "key_env": "ANTHROPIC_API_KEY",
        "model": "claude-sonnet-4-20250514"
    },
    "z.ai": {
        "url": "https://api.z.ai/api/anthropic/v1/messages",
        "key_env": "ANTHROPIC_API_KEY",
        "model": "claude-sonnet-4-20250514"  # Maps to GLM-4.7
    }
}

TEST_PROMPTS = [
    # Simple (fast response expected)
    {"name": "simple_math", "prompt": "What is 2+2? Answer with just the number.", "expected_tokens": 10},
    {"name": "simple_fact", "prompt": "What is the capital of France? One word answer.", "expected_tokens": 10},

    # Medium (moderate response)
    {"name": "code_explain", "prompt": "Explain what this Python code does in 2 sentences: def fib(n): return n if n<2 else fib(n-1)+fib(n-2)", "expected_tokens": 50},
    {"name": "json_task", "prompt": "Generate a JSON object with 3 users, each having name and age fields.", "expected_tokens": 100},

    # Complex (longer response)
    {"name": "code_generate", "prompt": "Write a Python function to check if a string is a palindrome. Include docstring and examples.", "expected_tokens": 200},
    {"name": "analysis", "prompt": "Analyze the pros and cons of microservices vs monolithic architecture in 5 bullet points each.", "expected_tokens": 300},
]

# ═══════════════════════════════════════════════════════════════════════════════
# BENCHMARK FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def call_api(endpoint: str, prompt: str, model: str, api_key: str) -> Dict[str, Any]:
    """Make API call and measure timing"""
    data = json.dumps({
        "model": model,
        "max_tokens": 1024,
        "messages": [{"role": "user", "content": prompt}]
    }).encode()

    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01"
    }

    start_time = time.perf_counter()
    first_byte_time = None

    try:
        req = Request(endpoint, data=data, headers=headers)
        with urlopen(req, timeout=120) as res:
            first_byte_time = time.perf_counter()
            response_data = res.read()
            end_time = time.perf_counter()

        result = json.loads(response_data)

        # Extract token counts
        usage = result.get("usage", {})
        input_tokens = usage.get("input_tokens", 0)
        output_tokens = usage.get("output_tokens", 0)

        return {
            "success": True,
            "ttfb": (first_byte_time - start_time) * 1000,  # Time to first byte (ms)
            "total_time": (end_time - start_time) * 1000,   # Total time (ms)
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "response_length": len(response_data),
        }

    except HTTPError as e:
        return {"success": False, "error": f"HTTP {e.code}: {e.reason}", "total_time": (time.perf_counter() - start_time) * 1000}
    except URLError as e:
        return {"success": False, "error": f"URL Error: {e.reason}", "total_time": (time.perf_counter() - start_time) * 1000}
    except Exception as e:
        return {"success": False, "error": str(e), "total_time": (time.perf_counter() - start_time) * 1000}

def run_benchmark(endpoint_name: str, iterations: int = 5, verbose: bool = True) -> Dict[str, Any]:
    """Run full benchmark suite for an endpoint"""
    endpoint_config = ENDPOINTS.get(endpoint_name)
    if not endpoint_config:
        return {"error": f"Unknown endpoint: {endpoint_name}"}

    api_key = os.environ.get(endpoint_config["key_env"]) or os.environ.get("ANTHROPIC_AUTH_TOKEN", "")
    if not api_key:
        return {"error": f"API key not set: {endpoint_config['key_env']}"}

    results = {
        "endpoint": endpoint_name,
        "url": endpoint_config["url"],
        "model": endpoint_config["model"],
        "timestamp": datetime.now().isoformat(),
        "iterations": iterations,
        "tests": {}
    }

    all_ttfb = []
    all_total = []
    all_tokens_per_sec = []
    errors = 0

    if verbose:
        print(f"\n{'='*70}")
        print(f"  BENCHMARK: {endpoint_name}")
        print(f"  URL: {endpoint_config['url']}")
        print(f"  Model: {endpoint_config['model']}")
        print(f"  Iterations: {iterations}")
        print(f"{'='*70}\n")

    for test in TEST_PROMPTS:
        test_results = []

        if verbose:
            print(f"Testing: {test['name']}")

        for i in range(iterations):
            result = call_api(
                endpoint_config["url"],
                test["prompt"],
                endpoint_config["model"],
                api_key
            )
            test_results.append(result)

            if result["success"]:
                all_ttfb.append(result["ttfb"])
                all_total.append(result["total_time"])
                if result["output_tokens"] > 0:
                    tps = result["output_tokens"] / (result["total_time"] / 1000)
                    all_tokens_per_sec.append(tps)
                if verbose:
                    print(f"  [{i+1}/{iterations}] TTFB: {result['ttfb']:.0f}ms, Total: {result['total_time']:.0f}ms, Tokens: {result['output_tokens']}")
            else:
                errors += 1
                if verbose:
                    print(f"  [{i+1}/{iterations}] ERROR: {result['error']}")

            # Small delay between requests
            time.sleep(0.5)

        # Aggregate test results
        successful = [r for r in test_results if r["success"]]
        if successful:
            results["tests"][test["name"]] = {
                "success_rate": len(successful) / len(test_results) * 100,
                "ttfb_avg": statistics.mean([r["ttfb"] for r in successful]),
                "ttfb_p50": statistics.median([r["ttfb"] for r in successful]),
                "ttfb_p95": sorted([r["ttfb"] for r in successful])[int(len(successful) * 0.95)] if len(successful) > 1 else successful[0]["ttfb"],
                "total_time_avg": statistics.mean([r["total_time"] for r in successful]),
                "total_time_p50": statistics.median([r["total_time"] for r in successful]),
                "output_tokens_avg": statistics.mean([r["output_tokens"] for r in successful]),
            }

        if verbose:
            print()

    # Overall summary
    if all_total:
        results["summary"] = {
            "total_requests": len(TEST_PROMPTS) * iterations,
            "successful_requests": len(all_total),
            "error_rate": errors / (len(TEST_PROMPTS) * iterations) * 100,
            "ttfb_avg_ms": statistics.mean(all_ttfb),
            "ttfb_p50_ms": statistics.median(all_ttfb),
            "ttfb_p95_ms": sorted(all_ttfb)[int(len(all_ttfb) * 0.95)] if len(all_ttfb) > 1 else all_ttfb[0],
            "total_time_avg_ms": statistics.mean(all_total),
            "total_time_p50_ms": statistics.median(all_total),
            "total_time_p95_ms": sorted(all_total)[int(len(all_total) * 0.95)] if len(all_total) > 1 else all_total[0],
            "tokens_per_second_avg": statistics.mean(all_tokens_per_sec) if all_tokens_per_sec else 0,
        }

    return results

def print_results(results: Dict[str, Any]):
    """Print formatted benchmark results"""
    if "error" in results:
        print(f"Error: {results['error']}")
        return

    print(f"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                         BENCHMARK RESULTS                                     ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  Endpoint: {results['endpoint']:<65} ║
║  Model:    {results['model']:<65} ║
║  Time:     {results['timestamp']:<65} ║
╠═══════════════════════════════════════════════════════════════════════════════╣""")

    if "summary" in results:
        s = results["summary"]
        print(f"""║                                                                               ║
║  OVERALL PERFORMANCE                                                          ║
║  ─────────────────────────────────────────────────────────────────────────    ║
║  Total Requests:     {s['total_requests']:<55} ║
║  Success Rate:       {100 - s['error_rate']:.1f}%{' ':<52} ║
║                                                                               ║
║  LATENCY (Time to First Byte)                                                 ║
║  ─────────────────────────────────────────────────────────────────────────    ║
║  Average:            {s['ttfb_avg_ms']:>8.0f} ms{' ':<47} ║
║  Median (P50):       {s['ttfb_p50_ms']:>8.0f} ms{' ':<47} ║
║  P95:                {s['ttfb_p95_ms']:>8.0f} ms{' ':<47} ║
║                                                                               ║
║  TOTAL RESPONSE TIME                                                          ║
║  ─────────────────────────────────────────────────────────────────────────    ║
║  Average:            {s['total_time_avg_ms']:>8.0f} ms{' ':<47} ║
║  Median (P50):       {s['total_time_p50_ms']:>8.0f} ms{' ':<47} ║
║  P95:                {s['total_time_p95_ms']:>8.0f} ms{' ':<47} ║
║                                                                               ║
║  THROUGHPUT                                                                   ║
║  ─────────────────────────────────────────────────────────────────────────    ║
║  Tokens/Second:      {s['tokens_per_second_avg']:>8.1f}{' ':<49} ║""")

    print("""║                                                                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  TEST BREAKDOWN                                                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣""")

    for test_name, test_data in results.get("tests", {}).items():
        print(f"║  {test_name:<18} │ TTFB: {test_data['ttfb_avg']:>6.0f}ms │ Total: {test_data['total_time_avg']:>6.0f}ms │ Tokens: {test_data['output_tokens_avg']:>5.0f} ║")

    print("""╚═══════════════════════════════════════════════════════════════════════════════╝""")

def compare_endpoints(iterations: int = 5):
    """Compare all configured endpoints"""
    all_results = {}

    for endpoint_name in ENDPOINTS:
        print(f"\nBenchmarking {endpoint_name}...")
        results = run_benchmark(endpoint_name, iterations=iterations, verbose=True)
        all_results[endpoint_name] = results
        print_results(results)

    # Comparison table
    print(f"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                         ENDPOINT COMPARISON                                   ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║              │    TTFB (ms)    │  Total Time (ms)  │  Tokens/sec  │  Errors  ║
║  Endpoint    │  Avg   │  P95   │   Avg   │   P95   │              │          ║
╠══════════════╪════════╪════════╪═════════╪═════════╪══════════════╪══════════╣""")

    for name, results in all_results.items():
        if "summary" in results:
            s = results["summary"]
            print(f"║  {name:<12}│{s['ttfb_avg_ms']:>7.0f} │{s['ttfb_p95_ms']:>7.0f} │{s['total_time_avg_ms']:>8.0f} │{s['total_time_p95_ms']:>8.0f} │{s['tokens_per_second_avg']:>13.1f} │{s['error_rate']:>7.1f}% ║")
        else:
            print(f"║  {name:<12}│   N/A  │   N/A  │    N/A  │    N/A  │         N/A  │    N/A  ║")

    print("╚══════════════╧════════╧════════╧═════════╧═════════╧══════════════╧══════════╝")

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    import argparse
    parser = argparse.ArgumentParser(description="nano-opencode API Benchmark Tool")
    parser.add_argument("--endpoint", "-e", choices=list(ENDPOINTS.keys()), help="Test specific endpoint")
    parser.add_argument("--full", action="store_true", help="Run full benchmark (20 iterations)")
    parser.add_argument("--iterations", "-n", type=int, default=5, help="Number of iterations per test")
    parser.add_argument("--compare", "-c", action="store_true", help="Compare all endpoints")
    parser.add_argument("--output", "-o", help="Save results to JSON file")
    args = parser.parse_args()

    iterations = 20 if args.full else args.iterations

    if args.compare:
        compare_endpoints(iterations)
    elif args.endpoint:
        results = run_benchmark(args.endpoint, iterations=iterations)
        print_results(results)
        if args.output:
            with open(args.output, "w") as f:
                json.dump(results, f, indent=2)
            print(f"\nResults saved to {args.output}")
    else:
        # Default: test z.ai endpoint
        endpoint = "z.ai" if os.environ.get("ANTHROPIC_BASE_URL", "").find("z.ai") >= 0 else "anthropic"
        results = run_benchmark(endpoint, iterations=iterations)
        print_results(results)
        if args.output:
            with open(args.output, "w") as f:
                json.dump(results, f, indent=2)

if __name__ == "__main__":
    main()
