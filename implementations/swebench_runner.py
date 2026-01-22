#!/usr/bin/env python3
"""
SWE-bench Runner for nano-opencode agents.
Runs our agent on official SWE-bench instances using Docker environments.

This gives us official, comparable scores.
"""

import json
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

import litellm
from datasets import load_dataset

# Configure LiteLLM
litellm.set_verbose = False

# Load API configuration from mini-swe-agent config if available
def load_api_config():
    """Load API config from mini-swe-agent .env file."""
    config_path = Path.home() / ".config" / "mini-swe-agent" / ".env"
    config = {}
    if config_path.exists():
        for line in config_path.read_text().splitlines():
            if '=' in line and not line.startswith('#'):
                key, value = line.split('=', 1)
                config[key.strip()] = value.strip()
                os.environ[key.strip()] = value.strip()
    return config

API_CONFIG = load_api_config()

# Configuration
DATASET_MAPPING = {
    "full": "princeton-nlp/SWE-Bench",
    "verified": "princeton-nlp/SWE-Bench_Verified",
    "lite": "princeton-nlp/SWE-Bench_Lite",
}


@dataclass
class DockerEnv:
    """Docker environment for SWE-bench instances."""

    container_id: str = ""
    image_name: str = ""
    workdir: str = "/testbed"
    timeout: int = 120

    def start(self, image: str) -> None:
        """Start a Docker container."""
        self.image_name = image
        # Generate unique container name
        import uuid
        name = f"nano-swebench-{uuid.uuid4().hex[:8]}"

        result = subprocess.run(
            ["docker", "run", "-d", "--name", name, "-w", self.workdir, "--rm", image, "sleep", "4h"],
            capture_output=True, text=True, timeout=300
        )
        if result.returncode != 0:
            raise RuntimeError(f"Failed to start container: {result.stderr}")
        self.container_id = result.stdout.strip()
        print(f"  Container started: {self.container_id[:12]}")

    def execute(self, command: str) -> dict:
        """Execute a command in the container."""
        try:
            result = subprocess.run(
                ["docker", "exec", self.container_id, "bash", "-c", command],
                capture_output=True, text=True, timeout=self.timeout
            )
            return {
                "output": result.stdout + result.stderr,
                "returncode": result.returncode
            }
        except subprocess.TimeoutExpired as e:
            return {
                "output": f"Command timed out after {self.timeout}s",
                "returncode": -1
            }

    def read_file(self, path: str) -> str:
        """Read a file from the container."""
        result = self.execute(f"cat '{path}'")
        return result["output"] if result["returncode"] == 0 else f"Error reading file: {result['output']}"

    def write_file(self, path: str, content: str) -> str:
        """Write a file to the container."""
        # Escape content for shell
        escaped = content.replace("'", "'\"'\"'")
        result = self.execute(f"cat > '{path}' << 'NANOEOF'\n{content}\nNANOEOF")
        return "File written successfully" if result["returncode"] == 0 else f"Error: {result['output']}"

    def list_files(self, path: str = ".") -> str:
        """List files in directory."""
        result = self.execute(f"ls -la '{path}'")
        return result["output"]

    def grep(self, pattern: str, path: str = ".") -> str:
        """Search for pattern in files."""
        result = self.execute(f"grep -rn '{pattern}' '{path}' 2>/dev/null | head -100")
        return result["output"] or "No matches found"

    def find(self, pattern: str) -> str:
        """Find files by pattern."""
        result = self.execute(f"find . -name '{pattern}' 2>/dev/null | head -50")
        return result["output"] or "No files found"

    def get_patch(self) -> str:
        """Get git diff of changes."""
        result = self.execute("git diff")
        return result["output"]

    def stop(self) -> None:
        """Stop and remove the container."""
        if self.container_id:
            subprocess.run(["docker", "stop", self.container_id], capture_output=True)
            print(f"  Container stopped: {self.container_id[:12]}")


def get_docker_image(instance: dict) -> str:
    """Get Docker image name for SWE-bench instance."""
    if "image_name" in instance:
        return instance["image_name"]
    iid = instance["instance_id"]
    # Docker doesn't allow double underscore
    id_docker = iid.replace("__", "_1776_")
    return f"docker.io/swebench/sweb.eval.x86_64.{id_docker}:latest".lower()


# Tool definitions for our agent
TOOLS = [
    {
        "name": "read_file",
        "description": "Read contents of a file",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the file"}
            },
            "required": ["path"]
        }
    },
    {
        "name": "write_file",
        "description": "Write content to a file (creates or overwrites)",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the file"},
                "content": {"type": "string", "description": "Content to write"}
            },
            "required": ["path", "content"]
        }
    },
    {
        "name": "edit_file",
        "description": "Edit a file by replacing old_string with new_string",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the file"},
                "old_string": {"type": "string", "description": "Text to find and replace"},
                "new_string": {"type": "string", "description": "Replacement text"}
            },
            "required": ["path", "old_string", "new_string"]
        }
    },
    {
        "name": "bash",
        "description": "Execute a bash command",
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "Command to execute"}
            },
            "required": ["command"]
        }
    },
    {
        "name": "grep",
        "description": "Search for pattern in files",
        "input_schema": {
            "type": "object",
            "properties": {
                "pattern": {"type": "string", "description": "Search pattern"},
                "path": {"type": "string", "description": "Path to search (default: .)"}
            },
            "required": ["pattern"]
        }
    },
    {
        "name": "find",
        "description": "Find files by name pattern",
        "input_schema": {
            "type": "object",
            "properties": {
                "pattern": {"type": "string", "description": "File name pattern (e.g., '*.py')"}
            },
            "required": ["pattern"]
        }
    },
    {
        "name": "list_dir",
        "description": "List files in a directory",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Directory path (default: .)"}
            }
        }
    },
    {
        "name": "submit",
        "description": "Submit the solution when you have fixed the issue",
        "input_schema": {
            "type": "object",
            "properties": {
                "summary": {"type": "string", "description": "Brief summary of what you fixed"}
            },
            "required": ["summary"]
        }
    }
]

SYSTEM_PROMPT = """You are an expert software engineer. You can read, write, and edit code.

The repository is in /testbed. Use the available tools to explore and modify the code.

When you're done with a task, use the 'submit' tool."""


class NanoSweAgent:
    """Nano-opencode agent for SWE-bench."""

    def __init__(self, env: DockerEnv, model: str = "anthropic/claude-sonnet-4-20250514"):
        self.env = env
        self.model = model
        self.messages: list[dict] = []
        self.total_cost = 0.0
        self.tool_calls = 0
        self.submitted = False
        self.result = ""

    def execute_tool(self, name: str, args: dict) -> str:
        """Execute a tool and return the result."""
        self.tool_calls += 1

        if name == "read_file":
            return self.env.read_file(args["path"])
        elif name == "write_file":
            return self.env.write_file(args["path"], args["content"])
        elif name == "edit_file":
            content = self.env.read_file(args["path"])
            if args["old_string"] not in content:
                return f"Error: old_string not found in {args['path']}"
            new_content = content.replace(args["old_string"], args["new_string"], 1)
            return self.env.write_file(args["path"], new_content)
        elif name == "bash":
            result = self.env.execute(args["command"])
            output = result["output"][:10000]  # Truncate
            return f"Exit code: {result['returncode']}\n{output}"
        elif name == "grep":
            return self.env.grep(args["pattern"], args.get("path", "."))
        elif name == "find":
            return self.env.find(args["pattern"])
        elif name == "list_dir":
            return self.env.list_files(args.get("path", "."))
        elif name == "submit":
            self.submitted = True
            self.result = self.env.get_patch()
            return f"Submitted! Summary: {args['summary']}"
        else:
            return f"Unknown tool: {name}"

    def _convert_tools_to_litellm(self) -> list:
        """Convert our tools to LiteLLM/OpenAI format."""
        return [
            {
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t["description"],
                    "parameters": t["input_schema"]
                }
            }
            for t in TOOLS
        ]

    def run(self, problem_statement: str, max_turns: int = 50) -> tuple[str, str]:
        """Run the agent on a problem."""
        self.messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"<problem>\n{problem_statement}\n</problem>\n\nPlease fix this issue. The repository is in /testbed."}
        ]

        litellm_tools = self._convert_tools_to_litellm()

        for turn in range(max_turns):
            # Query the model via LiteLLM
            try:
                # Pass API key and base URL from config
                api_key = os.environ.get("ANTHROPIC_API_KEY")
                base_url = os.environ.get("ANTHROPIC_BASE_URL")
                response = litellm.completion(
                    model=self.model,
                    messages=self.messages,
                    tools=litellm_tools,
                    tool_choice="auto",
                    max_tokens=4096,
                    api_key=api_key,
                    base_url=base_url,
                )
            except Exception as e:
                print(f"    API Error: {e}")
                raise

            # Track cost
            if hasattr(response, 'usage') and response.usage:
                # Approximate cost for Claude Sonnet
                input_cost = getattr(response.usage, 'prompt_tokens', 0) * 0.003 / 1000
                output_cost = getattr(response.usage, 'completion_tokens', 0) * 0.015 / 1000
                self.total_cost += input_cost + output_cost

            # Process response
            message = response.choices[0].message
            tool_calls_in_response = getattr(message, 'tool_calls', None) or []

            # Add assistant message
            self.messages.append({
                "role": "assistant",
                "content": message.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.function.name, "arguments": tc.function.arguments}
                    }
                    for tc in tool_calls_in_response
                ] if tool_calls_in_response else None
            })

            # Process tool calls
            if tool_calls_in_response:
                for tc in tool_calls_in_response:
                    try:
                        args = json.loads(tc.function.arguments)
                    except json.JSONDecodeError:
                        args = {}
                    result = self.execute_tool(tc.function.name, args)
                    print(f"    [{turn+1}] {tc.function.name}: {str(args)[:50]}...")
                    self.messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": result
                    })

            if self.submitted:
                return "Submitted", self.result

            # Check stop reason
            if response.choices[0].finish_reason == "stop" and not tool_calls_in_response:
                # Agent stopped without tool calls - try to get patch anyway
                self.result = self.env.get_patch()
                return "EndTurn", self.result

        # Max turns reached
        self.result = self.env.get_patch()
        return "MaxTurns", self.result


def run_instance(instance: dict, output_dir: Path, model: str) -> dict:
    """Run agent on a single SWE-bench instance."""
    instance_id = instance["instance_id"]
    print(f"\n{'='*60}")
    print(f"Instance: {instance_id}")
    print(f"{'='*60}")

    env = DockerEnv()
    result = {
        "instance_id": instance_id,
        "model_name_or_path": model,
        "model_patch": "",
        "exit_status": "Error",
        "cost": 0.0,
        "tool_calls": 0,
        "time": 0.0
    }

    start_time = time.time()

    try:
        # Get Docker image
        image = get_docker_image(instance)
        print(f"  Image: {image}")

        # Pull image if needed
        print("  Pulling image...")
        subprocess.run(["docker", "pull", image], capture_output=True, timeout=600)

        # Start environment
        env.start(image)

        # Run agent
        agent = NanoSweAgent(env, model=model)
        exit_status, patch = agent.run(instance["problem_statement"])

        result["model_patch"] = patch
        result["exit_status"] = exit_status
        result["cost"] = agent.total_cost
        result["tool_calls"] = agent.tool_calls

        print(f"  Status: {exit_status}")
        print(f"  Tools: {agent.tool_calls}, Cost: ${agent.total_cost:.3f}")
        print(f"  Patch: {len(patch)} chars")

    except Exception as e:
        result["exit_status"] = f"Error: {type(e).__name__}"
        print(f"  Error: {e}")
    finally:
        result["time"] = time.time() - start_time
        env.stop()

    # Save trajectory
    instance_dir = output_dir / instance_id
    instance_dir.mkdir(parents=True, exist_ok=True)
    (instance_dir / f"{instance_id}.result.json").write_text(json.dumps(result, indent=2))

    return result


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Run nano-opencode on SWE-bench")
    parser.add_argument("--subset", default="lite", choices=list(DATASET_MAPPING.keys()),
                        help="SWE-bench subset")
    parser.add_argument("--split", default="test", help="Dataset split (dev/test)")
    parser.add_argument("--slice", default="", help="Slice spec (e.g., '0:5')")
    parser.add_argument("--model", default="anthropic/claude-sonnet-4-20250514", help="Model to use (LiteLLM format)")
    parser.add_argument("-o", "--output", default="./swebench_results", help="Output directory")
    args = parser.parse_args()

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load dataset
    dataset_path = DATASET_MAPPING[args.subset]
    print(f"Loading {dataset_path} split={args.split}...")
    instances = list(load_dataset(dataset_path, split=args.split))
    print(f"Loaded {len(instances)} instances")

    # Apply slice
    if args.slice:
        parts = [int(x) if x else None for x in args.slice.split(":")]
        instances = instances[slice(*parts)]
        print(f"Sliced to {len(instances)} instances")

    # Skip existing
    preds_file = output_dir / "preds.json"
    if preds_file.exists():
        existing = set(json.loads(preds_file.read_text()).keys())
        instances = [i for i in instances if i["instance_id"] not in existing]
        print(f"Skipping {len(existing)} existing, {len(instances)} remaining")

    # Process instances
    results = {}
    for i, instance in enumerate(instances):
        print(f"\n[{i+1}/{len(instances)}]")
        result = run_instance(instance, output_dir, args.model)
        results[result["instance_id"]] = {
            "model_name_or_path": result["model_name_or_path"],
            "instance_id": result["instance_id"],
            "model_patch": result["model_patch"]
        }

        # Update preds.json
        if preds_file.exists():
            all_preds = json.loads(preds_file.read_text())
        else:
            all_preds = {}
        all_preds.update(results)
        preds_file.write_text(json.dumps(all_preds, indent=2))

    # Summary
    print(f"\n{'='*60}")
    print(f"COMPLETE: {len(results)} instances processed")
    print(f"Results saved to: {output_dir}")
    print(f"Predictions file: {preds_file}")
    print(f"\nTo evaluate, run:")
    print(f"  sb-cli submit {preds_file}")


if __name__ == "__main__":
    main()
