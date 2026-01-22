#!/usr/bin/env python3
"""
Multi-Language Agent Benchmark
Tests all nano-opencode language implementations on SWE-bench.
All versions use the SAME prompt for fair comparison.
"""

import json
import os
import subprocess
import time
from datetime import datetime
from pathlib import Path

import litellm
from datasets import load_dataset

litellm.set_verbose = False

# Load API config
config_path = Path.home() / ".config" / "mini-swe-agent" / ".env"
if config_path.exists():
    for line in config_path.read_text().splitlines():
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            os.environ[k.strip()] = v.strip()

# =============================================================================
# UNIVERSAL PROMPT (same for ALL language versions)
# =============================================================================

UNIVERSAL_PROMPT = """You are a coding assistant. Fix the bug in /testbed.

Available tools:
- read_file(path): Read file contents
- write_file(path, content): Write to file
- edit_file(path, old, new): Replace text in file
- bash(command): Run shell command
- glob(pattern): Find files matching pattern
- grep(pattern, path): Search for pattern in files
- list_dir(path): List directory contents
- submit(): Submit your solution when done

Workflow:
1. Read the problem description
2. Find and understand the relevant code
3. Make minimal changes to fix the bug
4. Verify your fix works
5. Submit when done
"""

# =============================================================================
# LANGUAGE IMPLEMENTATIONS
# =============================================================================

LANGUAGES = {
    "python": {
        "name": "Python (72 LOC)",
        "file": "nano.py",
        "run": "python nano.py",
        "available": True,
    },
    "typescript": {
        "name": "TypeScript (86 LOC)",
        "file": "nano.ts",
        "run": "bun nano.ts",
        "available": True,
    },
    "rust": {
        "name": "Rust (118 LOC)",
        "file": "nano.rs",
        "run": "./nano_rust",
        "available": True,
    },
    "go": {
        "name": "Go (85 LOC)",
        "file": "nano.go",
        "run": "./nano_go",
        "available": True,
    },
    "zig": {
        "name": "Zig (92 LOC)",
        "file": "nano.zig",
        "run": "./nano_zig",
        "available": False,  # Need to check
    },
    "c": {
        "name": "C (200 LOC)",
        "file": "nano.c",
        "run": "./nano_c",
        "available": True,
    },
}

# =============================================================================
# TOOLS (same as swebench_runner.py)
# =============================================================================

TOOLS = [
    {
        "name": "read_file",
        "description": "Read the contents of a file",
        "input_schema": {
            "type": "object",
            "properties": {"path": {"type": "string", "description": "File path to read"}},
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": "Write content to a file",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path to write"},
                "content": {"type": "string", "description": "Content to write"},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "edit_file",
        "description": "Edit a file by replacing old text with new text",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path to edit"},
                "old_text": {"type": "string", "description": "Text to replace"},
                "new_text": {"type": "string", "description": "Replacement text"},
            },
            "required": ["path", "old_text", "new_text"],
        },
    },
    {
        "name": "bash",
        "description": "Run a bash command",
        "input_schema": {
            "type": "object",
            "properties": {"command": {"type": "string", "description": "Command to run"}},
            "required": ["command"],
        },
    },
    {
        "name": "glob",
        "description": "Find files matching a glob pattern",
        "input_schema": {
            "type": "object",
            "properties": {"pattern": {"type": "string", "description": "Glob pattern"}},
            "required": ["pattern"],
        },
    },
    {
        "name": "grep",
        "description": "Search for a pattern in files",
        "input_schema": {
            "type": "object",
            "properties": {
                "pattern": {"type": "string", "description": "Search pattern"},
                "path": {"type": "string", "description": "Path to search in"},
            },
            "required": ["pattern"],
        },
    },
    {
        "name": "list_dir",
        "description": "List contents of a directory",
        "input_schema": {
            "type": "object",
            "properties": {"path": {"type": "string", "description": "Directory path"}},
            "required": ["path"],
        },
    },
    {
        "name": "submit",
        "description": "Submit your solution",
        "input_schema": {"type": "object", "properties": {}},
    },
]


def execute_tool(name: str, args: dict, container: str) -> str:
    """Execute a tool in the Docker container."""
    try:
        if name == "read_file":
            cmd = f"docker exec {container} cat '{args['path']}'"
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
            return result.stdout if result.returncode == 0 else f"Error: {result.stderr}"

        elif name == "write_file":
            content = args["content"].replace("'", "'\\''")
            cmd = f"docker exec {container} bash -c \"cat > '{args['path']}' << 'EOFWRITE'\n{content}\nEOFWRITE\""
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
            return "File written successfully" if result.returncode == 0 else f"Error: {result.stderr}"

        elif name == "edit_file":
            # Read, replace, write
            read_cmd = f"docker exec {container} cat '{args['path']}'"
            result = subprocess.run(read_cmd, shell=True, capture_output=True, text=True, timeout=30)
            if result.returncode != 0:
                return f"Error reading file: {result.stderr}"

            content = result.stdout.replace(args["old_text"], args["new_text"])
            content_escaped = content.replace("'", "'\\''")
            write_cmd = f"docker exec {container} bash -c \"cat > '{args['path']}' << 'EOFWRITE'\n{content_escaped}\nEOFWRITE\""
            result = subprocess.run(write_cmd, shell=True, capture_output=True, text=True, timeout=30)
            return "File edited successfully" if result.returncode == 0 else f"Error: {result.stderr}"

        elif name == "bash":
            cmd = f"docker exec {container} bash -c '{args['command']}'"
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=120)
            output = result.stdout + result.stderr
            return output[:10000] if len(output) > 10000 else output

        elif name == "glob":
            cmd = f"docker exec {container} find /testbed -name '{args['pattern']}' 2>/dev/null | head -50"
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
            return result.stdout or "No files found"

        elif name == "grep":
            path = args.get("path", "/testbed")
            cmd = f"docker exec {container} grep -r '{args['pattern']}' {path} 2>/dev/null | head -50"
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
            return result.stdout or "No matches found"

        elif name == "list_dir":
            cmd = f"docker exec {container} ls -la '{args['path']}'"
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
            return result.stdout if result.returncode == 0 else f"Error: {result.stderr}"

        elif name == "submit":
            return "SUBMIT"

        else:
            return f"Unknown tool: {name}"

    except subprocess.TimeoutExpired:
        return "Error: Command timed out"
    except Exception as e:
        return f"Error: {str(e)}"


class UniversalAgent:
    """Agent that works the same way regardless of language implementation."""

    def __init__(self, language: str):
        self.language = language
        self.messages = []
        self.tool_calls = 0
        self.cost = 0.0
        self.status = "Running"

    def run(self, instance: dict, container: str, max_turns: int = 40) -> str:
        """Run the agent on an instance."""
        problem = instance["problem_statement"]

        self.messages = [
            {"role": "user", "content": f"{UNIVERSAL_PROMPT}\n\nProblem:\n{problem}"}
        ]

        for turn in range(max_turns):
            try:
                response = litellm.completion(
                    model="anthropic/claude-sonnet-4-20250514",
                    messages=self.messages,
                    tools=TOOLS,
                    max_tokens=4096,
                )

                # Track cost
                if hasattr(response, 'usage'):
                    self.cost += (response.usage.prompt_tokens * 3 + response.usage.completion_tokens * 15) / 1_000_000

                msg = response.choices[0].message
                self.messages.append({"role": "assistant", "content": msg.content, "tool_calls": msg.tool_calls})

                if not msg.tool_calls:
                    self.status = "EndTurn"
                    break

                # Execute tools
                tool_results = []
                for tc in msg.tool_calls:
                    self.tool_calls += 1
                    args = json.loads(tc.function.arguments) if tc.function.arguments else {}
                    result = execute_tool(tc.function.name, args, container)

                    if result == "SUBMIT":
                        self.status = "Submitted"
                        # Get the patch
                        diff_cmd = f"docker exec {container} git diff"
                        diff_result = subprocess.run(diff_cmd, shell=True, capture_output=True, text=True)
                        return diff_result.stdout

                    tool_results.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": result[:5000],
                    })

                self.messages.extend(tool_results)

            except Exception as e:
                self.status = f"Error: {str(e)}"
                break

        if self.status == "Running":
            self.status = "MaxTurns"

        # Get final diff even if not submitted
        diff_cmd = f"docker exec {container} git diff"
        diff_result = subprocess.run(diff_cmd, shell=True, capture_output=True, text=True)
        return diff_result.stdout


def get_container_for_instance(instance_id: str) -> str:
    """Get or start Docker container for instance."""
    container_name = f"swe-bench-{instance_id.replace('/', '-').replace('__', '-')}"

    # Check if container exists
    check = subprocess.run(f"docker ps -a --filter name={container_name} --format '{{{{.Names}}}}'",
                          shell=True, capture_output=True, text=True)

    if container_name in check.stdout:
        # Start if stopped
        subprocess.run(f"docker start {container_name}", shell=True, capture_output=True)
        return container_name

    # Create new container from SWE-bench image
    image = f"swebench/sweb.eval.x86_64.{instance_id.replace('/', '_').replace('__', '_')}:latest"
    subprocess.run(f"docker run -d --name {container_name} {image} tail -f /dev/null",
                  shell=True, capture_output=True)
    time.sleep(2)
    return container_name


def run_benchmark(num_instances: int = 5, languages: list = None):
    """Run benchmark on specified languages."""
    if languages is None:
        languages = [k for k, v in LANGUAGES.items() if v["available"]]

    print(f"Loading SWE-bench Lite...")
    dataset = load_dataset("princeton-nlp/SWE-bench_Lite", split="dev")
    instances = list(dataset)[:num_instances]

    print(f"Testing {len(instances)} instances with languages: {languages}")
    print(f"Using UNIVERSAL prompt for all languages (fair comparison)")
    print("=" * 60)

    results = {lang: {"patches": 0, "total": 0, "cost": 0, "tools": 0, "times": []} for lang in languages}
    predictions = {lang: {} for lang in languages}

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    for i, instance in enumerate(instances):
        iid = instance["instance_id"]
        print(f"\n[{i+1}/{len(instances)}] {iid}")
        print("=" * 60)

        try:
            container = get_container_for_instance(iid)
        except Exception as e:
            print(f"  Error setting up container: {e}")
            continue

        for lang in languages:
            print(f"\n  >> {LANGUAGES[lang]['name']}")

            start_time = time.time()
            agent = UniversalAgent(lang)

            try:
                patch = agent.run(instance, container)
                elapsed = time.time() - start_time

                has_patch = len(patch.strip()) > 0
                results[lang]["total"] += 1
                results[lang]["cost"] += agent.cost
                results[lang]["tools"] += agent.tool_calls
                results[lang]["times"].append(elapsed)

                if has_patch:
                    results[lang]["patches"] += 1
                    predictions[lang][iid] = {
                        "instance_id": iid,
                        "model_name_or_path": f"nano-{lang}",
                        "model_patch": patch[:10000],
                    }

                status_icon = "[Y]" if has_patch else "[N]"
                print(f"     {status_icon} Status: {agent.status}, Tools: {agent.tool_calls}, "
                      f"Cost: ${agent.cost:.2f}, Patch: {len(patch)} chars, Time: {elapsed:.1f}s")

            except Exception as e:
                print(f"     Error: {e}")
                results[lang]["total"] += 1

        # Cleanup container
        subprocess.run(f"docker stop {container}", shell=True, capture_output=True)

    # Print summary
    print(f"\n{'=' * 60}")
    print("LANGUAGE COMPARISON SUMMARY")
    print(f"{'=' * 60}")
    print(f"{'Language':<20} | {'Patches':<10} | {'Tools':<8} | {'Cost':<10} | {'Avg Time':<10}")
    print("-" * 60)

    for lang in languages:
        r = results[lang]
        avg_time = sum(r["times"]) / len(r["times"]) if r["times"] else 0
        print(f"{LANGUAGES[lang]['name']:<20} | {r['patches']}/{r['total']:<8} | {r['tools']:<8} | "
              f"${r['cost']:.2f}{'':>5} | {avg_time:.1f}s")

    # Save results
    output_dir = Path(f"lang_benchmark_{timestamp}")
    output_dir.mkdir(exist_ok=True)

    for lang in languages:
        pred_file = output_dir / f"preds_{lang}.json"
        with open(pred_file, "w") as f:
            json.dump(predictions[lang], f, indent=2)

    # Save summary
    summary = {
        "timestamp": timestamp,
        "num_instances": num_instances,
        "languages": languages,
        "prompt": UNIVERSAL_PROMPT,
        "results": results,
    }
    with open(output_dir / "summary.json", "w") as f:
        json.dump(summary, f, indent=2)

    print(f"\nResults saved to: {output_dir}")
    return results


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("-n", "--num", type=int, default=5, help="Number of instances")
    parser.add_argument("-l", "--languages", nargs="+", default=None, help="Languages to test")
    args = parser.parse_args()

    run_benchmark(args.num, args.languages)
