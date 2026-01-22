#!/usr/bin/env python3
"""
Agent Version Comparison on SWE-bench
Tests different system prompts and analyzes results.
"""

import json
import os
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path

import litellm
from datasets import load_dataset

litellm.set_verbose = False

# Load API config
def load_api_config():
    config_path = Path.home() / ".config" / "mini-swe-agent" / ".env"
    if config_path.exists():
        for line in config_path.read_text().splitlines():
            if '=' in line and not line.startswith('#'):
                key, value = line.split('=', 1)
                os.environ[key.strip()] = value.strip()

load_api_config()

# ============================================================================
# AGENT VERSIONS - Different system prompts to compare
# ============================================================================

AGENT_VERSIONS = {
    "v1_general": {
        "name": "General (nano-opencode)",
        "system": "You are a coding assistant. Use tools to help.",
    },
    "v2_expert": {
        "name": "Expert Engineer",
        "system": """You are an expert software engineer. You can read, write, and edit code.
The repository is in /testbed. Use the available tools to explore and modify the code.
When you're done, use the 'submit' tool.""",
    },
    "v3_workflow": {
        "name": "Workflow (mini-swe style)",
        "system": """You are an expert software engineer fixing bugs.

Workflow:
1. Find and read relevant files
2. Create a script to reproduce the issue
3. Fix the source code
4. Verify your fix works
5. Submit when done

Use the 'submit' tool when finished.""",
    },
}

# ============================================================================
# TOOLS
# ============================================================================

TOOLS = [
    {"name": "read_file", "description": "Read file contents",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}},
    {"name": "write_file", "description": "Write content to file",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]}},
    {"name": "edit_file", "description": "Edit file by replacing old_string with new_string",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "old_string": {"type": "string"}, "new_string": {"type": "string"}}, "required": ["path", "old_string", "new_string"]}},
    {"name": "bash", "description": "Execute bash command",
     "input_schema": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]}},
    {"name": "grep", "description": "Search for pattern in files",
     "input_schema": {"type": "object", "properties": {"pattern": {"type": "string"}, "path": {"type": "string"}}, "required": ["pattern"]}},
    {"name": "find", "description": "Find files by name pattern",
     "input_schema": {"type": "object", "properties": {"pattern": {"type": "string"}}, "required": ["pattern"]}},
    {"name": "list_dir", "description": "List directory contents",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}}},
    {"name": "submit", "description": "Submit solution when done",
     "input_schema": {"type": "object", "properties": {"summary": {"type": "string"}}, "required": ["summary"]}},
]

# ============================================================================
# DOCKER ENVIRONMENT
# ============================================================================

@dataclass
class DockerEnv:
    container_id: str = ""
    timeout: int = 120

    def start(self, image: str):
        import uuid
        name = f"nano-cmp-{uuid.uuid4().hex[:8]}"
        result = subprocess.run(
            ["docker", "run", "-d", "--name", name, "-w", "/testbed", "--rm", image, "sleep", "2h"],
            capture_output=True, text=True, timeout=300
        )
        if result.returncode != 0:
            raise RuntimeError(f"Failed to start: {result.stderr}")
        self.container_id = result.stdout.strip()

    def execute(self, cmd: str) -> dict:
        try:
            r = subprocess.run(["docker", "exec", self.container_id, "bash", "-c", cmd],
                               capture_output=True, text=True, timeout=self.timeout)
            return {"output": r.stdout + r.stderr, "returncode": r.returncode}
        except subprocess.TimeoutExpired:
            return {"output": f"Timeout after {self.timeout}s", "returncode": -1}

    def read_file(self, path: str) -> str:
        r = self.execute(f"cat '{path}'")
        return r["output"] if r["returncode"] == 0 else f"Error: {r['output']}"

    def write_file(self, path: str, content: str) -> str:
        r = self.execute(f"cat > '{path}' << 'NANOEOF'\n{content}\nNANOEOF")
        return "OK" if r["returncode"] == 0 else f"Error: {r['output']}"

    def grep(self, pattern: str, path: str = ".") -> str:
        r = self.execute(f"grep -rn '{pattern}' '{path}' 2>/dev/null | head -100")
        return r["output"] or "No matches"

    def find(self, pattern: str) -> str:
        r = self.execute(f"find . -name '{pattern}' 2>/dev/null | head -50")
        return r["output"] or "No files found"

    def list_dir(self, path: str = ".") -> str:
        return self.execute(f"ls -la '{path}'")["output"]

    def get_patch(self) -> str:
        return self.execute("git diff")["output"]

    def stop(self):
        if self.container_id:
            subprocess.run(["docker", "stop", self.container_id], capture_output=True)

# ============================================================================
# AGENT
# ============================================================================

class Agent:
    def __init__(self, env: DockerEnv, system_prompt: str, model: str = "anthropic/claude-sonnet-4-20250514"):
        self.env = env
        self.system_prompt = system_prompt
        self.model = model
        self.messages = []
        self.tool_calls = 0
        self.cost = 0.0
        self.submitted = False
        self.patch = ""

    def execute_tool(self, name: str, args: dict) -> str:
        self.tool_calls += 1
        if name == "read_file": return self.env.read_file(args["path"])
        if name == "write_file": return self.env.write_file(args["path"], args["content"])
        if name == "edit_file":
            content = self.env.read_file(args["path"])
            if args["old_string"] not in content: return f"Error: old_string not found"
            new = content.replace(args["old_string"], args["new_string"], 1)
            return self.env.write_file(args["path"], new)
        if name == "bash":
            r = self.env.execute(args["command"])
            return f"Exit: {r['returncode']}\n{r['output'][:8000]}"
        if name == "grep": return self.env.grep(args["pattern"], args.get("path", "."))
        if name == "find": return self.env.find(args["pattern"])
        if name == "list_dir": return self.env.list_dir(args.get("path", "."))
        if name == "submit":
            self.submitted = True
            self.patch = self.env.get_patch()
            return f"Submitted: {args['summary']}"
        return f"Unknown tool: {name}"

    def run(self, problem: str, max_turns: int = 40) -> tuple[str, str]:
        self.messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": f"<problem>\n{problem}\n</problem>\n\nFix this issue. Code is in /testbed."}
        ]

        tools = [{"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["input_schema"]}} for t in TOOLS]

        for turn in range(max_turns):
            try:
                response = litellm.completion(
                    model=self.model, messages=self.messages, tools=tools, tool_choice="auto",
                    max_tokens=4096, api_key=os.environ.get("ANTHROPIC_API_KEY"),
                    base_url=os.environ.get("ANTHROPIC_BASE_URL")
                )
            except Exception as e:
                return "Error", str(e)

            # Track cost
            if hasattr(response, 'usage') and response.usage:
                self.cost += getattr(response.usage, 'prompt_tokens', 0) * 0.003 / 1000
                self.cost += getattr(response.usage, 'completion_tokens', 0) * 0.015 / 1000

            msg = response.choices[0].message
            tool_calls = getattr(msg, 'tool_calls', None) or []

            self.messages.append({
                "role": "assistant", "content": msg.content or "",
                "tool_calls": [{"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}} for tc in tool_calls] if tool_calls else None
            })

            if tool_calls:
                for tc in tool_calls:
                    args = json.loads(tc.function.arguments) if tc.function.arguments else {}
                    result = self.execute_tool(tc.function.name, args)
                    self.messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})

            if self.submitted:
                return "Submitted", self.patch
            if response.choices[0].finish_reason == "stop" and not tool_calls:
                self.patch = self.env.get_patch()
                return "EndTurn", self.patch

        self.patch = self.env.get_patch()
        return "MaxTurns", self.patch

# ============================================================================
# COMPARISON RUNNER
# ============================================================================

def get_docker_image(instance: dict) -> str:
    iid = instance["instance_id"].replace("__", "_1776_")
    return f"docker.io/swebench/sweb.eval.x86_64.{iid}:latest".lower()

def run_comparison(instances: list, output_dir: Path, versions: list[str] = None):
    """Run multiple agent versions on same instances."""
    if versions is None:
        versions = list(AGENT_VERSIONS.keys())

    output_dir.mkdir(parents=True, exist_ok=True)
    results = {v: {} for v in versions}

    for i, inst in enumerate(instances):
        iid = inst["instance_id"]
        image = get_docker_image(inst)

        print(f"\n{'='*60}")
        print(f"[{i+1}/{len(instances)}] {iid}")
        print(f"{'='*60}")

        # Pull image once
        print("  Pulling image...")
        subprocess.run(["docker", "pull", image], capture_output=True, timeout=600)

        for version in versions:
            cfg = AGENT_VERSIONS[version]
            print(f"\n  >> {cfg['name']} ({version})")

            env = DockerEnv()
            try:
                env.start(image)
                agent = Agent(env, cfg["system"])
                status, patch = agent.run(inst["problem_statement"])

                results[version][iid] = {
                    "instance_id": iid,
                    "model_patch": patch,
                    "exit_status": status,
                    "tool_calls": agent.tool_calls,
                    "cost": agent.cost,
                }
                print(f"     Status: {status}, Tools: {agent.tool_calls}, Cost: ${agent.cost:.2f}")
                print(f"     Patch: {len(patch)} chars")

            except Exception as e:
                print(f"     Error: {e}")
                results[version][iid] = {"instance_id": iid, "model_patch": "", "exit_status": f"Error: {e}"}
            finally:
                env.stop()

    # Save results
    for version in versions:
        preds_file = output_dir / f"preds_{version}.json"
        preds = {iid: {"instance_id": iid, "model_name_or_path": f"nano-{version}", "model_patch": r["model_patch"]}
                 for iid, r in results[version].items()}
        preds_file.write_text(json.dumps(preds, indent=2))
        print(f"\nSaved: {preds_file}")

    # Summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    for version in versions:
        patches = sum(1 for r in results[version].values() if r.get("model_patch"))
        total_tools = sum(r.get("tool_calls", 0) for r in results[version].values())
        total_cost = sum(r.get("cost", 0) for r in results[version].values())
        print(f"{AGENT_VERSIONS[version]['name']:30} | Patches: {patches}/{len(instances)} | Tools: {total_tools:4} | Cost: ${total_cost:.2f}")

    return results

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--instances", type=int, default=5, help="Number of instances")
    parser.add_argument("--versions", nargs="+", default=None, help="Agent versions to test")
    parser.add_argument("-o", "--output", default="./comparison_results", help="Output dir")
    args = parser.parse_args()

    print("Loading SWE-bench Lite dev split...")
    instances = list(load_dataset("princeton-nlp/SWE-bench_Lite", split="dev"))[:args.instances]
    print(f"Testing {len(instances)} instances")

    results = run_comparison(instances, Path(args.output), args.versions)

    print("\n\nTo evaluate with official harness:")
    for v in (args.versions or list(AGENT_VERSIONS.keys())):
        print(f"  python -m swebench.harness.run_evaluation -d princeton-nlp/SWE-bench_Lite -s dev -p {args.output}/preds_{v}.json -id {v}")

if __name__ == "__main__":
    main()
