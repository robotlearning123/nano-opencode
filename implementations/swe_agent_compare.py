#!/usr/bin/env python3
"""
SWE-bench Agent Comparison
Compare different nano-opencode agent versions on the same instances.
"""

import json
import os
import subprocess
import time
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
# AGENT VERSIONS TO COMPARE
# =============================================================================

AGENTS = {
    "minimal": {
        "name": "Minimal (72 LOC style)",
        "system": "You are a coding assistant. Use tools to help.",
        "tools": "structured",
    },
    "expert": {
        "name": "Expert Engineer",
        "system": """You are an expert software engineer. Fix the bug in /testbed.
Read code, understand the issue, make minimal changes, verify, submit.""",
        "tools": "structured",
    },
    "workflow": {
        "name": "Workflow (5-step)",
        "system": """You are an expert fixing bugs. Follow this workflow:
1. ANALYZE: Find and read relevant files
2. REPRODUCE: Create script to reproduce bug
3. FIX: Edit source code minimally
4. VERIFY: Run script to confirm fix
5. SUBMIT: Use submit tool when done""",
        "tools": "structured",
    },
    "bash_only": {
        "name": "Bash Only (mini-swe style)",
        "system": """You fix bugs using bash commands only.
Reply with ONE bash command in ```bash blocks.
To finish: echo DONE
Workflow: find files, reproduce bug, fix, verify, submit.""",
        "tools": "bash",
    },
}

# =============================================================================
# TOOLS
# =============================================================================

STRUCTURED_TOOLS = [
    {"name": "read_file", "description": "Read file",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}},
    {"name": "write_file", "description": "Write file",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]}},
    {"name": "edit_file", "description": "Replace old_string with new_string in file",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "old_string": {"type": "string"}, "new_string": {"type": "string"}}, "required": ["path", "old_string", "new_string"]}},
    {"name": "bash", "description": "Run bash command",
     "input_schema": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]}},
    {"name": "grep", "description": "Search pattern in files",
     "input_schema": {"type": "object", "properties": {"pattern": {"type": "string"}, "path": {"type": "string"}}, "required": ["pattern"]}},
    {"name": "find", "description": "Find files by pattern",
     "input_schema": {"type": "object", "properties": {"pattern": {"type": "string"}}, "required": ["pattern"]}},
    {"name": "list_dir", "description": "List directory",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}}},
    {"name": "submit", "description": "Submit solution",
     "input_schema": {"type": "object", "properties": {"summary": {"type": "string"}}, "required": ["summary"]}},
]

BASH_TOOLS = [
    {"name": "bash", "description": "Run bash command. Use 'echo DONE' when finished.",
     "input_schema": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]}},
]

# =============================================================================
# DOCKER ENVIRONMENT
# =============================================================================

class DockerEnv:
    def __init__(self):
        self.container_id = ""
        self.timeout = 120

    def start(self, image: str):
        import uuid
        name = f"swe-cmp-{uuid.uuid4().hex[:8]}"
        r = subprocess.run(["docker", "run", "-d", "--name", name, "-w", "/testbed", "--rm", image, "sleep", "2h"],
                          capture_output=True, text=True, timeout=300)
        if r.returncode != 0:
            raise RuntimeError(f"Docker failed: {r.stderr}")
        self.container_id = r.stdout.strip()

    def run_cmd(self, cmd: str) -> dict:
        try:
            r = subprocess.run(["docker", "exec", self.container_id, "bash", "-c", cmd],
                              capture_output=True, text=True, timeout=self.timeout)
            return {"output": (r.stdout + r.stderr)[:10000], "code": r.returncode}
        except subprocess.TimeoutExpired:
            return {"output": "Timeout", "code": -1}

    def read_file(self, path: str) -> str:
        r = self.run_cmd(f"cat '{path}'")
        return r["output"] if r["code"] == 0 else f"Error: {r['output']}"

    def write_file(self, path: str, content: str) -> str:
        r = self.run_cmd(f"cat > '{path}' << 'EOF'\n{content}\nEOF")
        return "OK" if r["code"] == 0 else f"Error: {r['output']}"

    def grep(self, pattern: str, path: str = ".") -> str:
        return self.run_cmd(f"grep -rn '{pattern}' '{path}' 2>/dev/null | head -50")["output"] or "No matches"

    def find_files(self, pattern: str) -> str:
        return self.run_cmd(f"find . -name '{pattern}' 2>/dev/null | head -30")["output"] or "No files"

    def list_dir(self, path: str = ".") -> str:
        return self.run_cmd(f"ls -la '{path}'")["output"]

    def get_patch(self) -> str:
        return self.run_cmd("git diff")["output"]

    def stop(self):
        if self.container_id:
            subprocess.run(["docker", "stop", self.container_id], capture_output=True, timeout=30)

# =============================================================================
# AGENT
# =============================================================================

class Agent:
    def __init__(self, env: DockerEnv, config: dict, model: str = "anthropic/claude-sonnet-4-20250514"):
        self.env = env
        self.config = config
        self.model = model
        self.messages = []
        self.tool_calls = 0
        self.cost = 0.0
        self.done = False
        self.patch = ""

    def exec_tool(self, name: str, args: dict) -> str:
        self.tool_calls += 1
        if name == "read_file": return self.env.read_file(args["path"])
        if name == "write_file": return self.env.write_file(args["path"], args["content"])
        if name == "edit_file":
            c = self.env.read_file(args["path"])
            if args["old_string"] not in c: return "Error: old_string not found"
            return self.env.write_file(args["path"], c.replace(args["old_string"], args["new_string"], 1))
        if name == "bash":
            r = self.env.run_cmd(args["command"])
            out = f"[exit {r['code']}]\n{r['output']}"
            if "DONE" in r["output"]:
                self.done = True
                self.patch = self.env.get_patch()
            return out
        if name == "grep": return self.env.grep(args["pattern"], args.get("path", "."))
        if name == "find": return self.env.find_files(args["pattern"])
        if name == "list_dir": return self.env.list_dir(args.get("path", "."))
        if name == "submit":
            self.done = True
            self.patch = self.env.get_patch()
            return f"Submitted: {args.get('summary', '')}"
        return f"Unknown: {name}"

    def run(self, problem: str, max_turns: int = 40) -> tuple[str, str]:
        tools_list = STRUCTURED_TOOLS if self.config["tools"] == "structured" else BASH_TOOLS
        tools = [{"type": "function", "function": {"name": t["name"], "description": t["description"],
                  "parameters": t["input_schema"]}} for t in tools_list]

        self.messages = [
            {"role": "system", "content": self.config["system"]},
            {"role": "user", "content": f"Fix this issue in /testbed:\n\n{problem}"}
        ]

        for turn in range(max_turns):
            try:
                resp = litellm.completion(
                    model=self.model, messages=self.messages, tools=tools, tool_choice="auto",
                    max_tokens=4096, api_key=os.environ.get("ANTHROPIC_API_KEY"),
                    base_url=os.environ.get("ANTHROPIC_BASE_URL"))
            except Exception as e:
                return "Error", str(e)

            if hasattr(resp, 'usage') and resp.usage:
                self.cost += getattr(resp.usage, 'prompt_tokens', 0) * 0.003 / 1000
                self.cost += getattr(resp.usage, 'completion_tokens', 0) * 0.015 / 1000

            msg = resp.choices[0].message
            tcs = getattr(msg, 'tool_calls', None) or []

            self.messages.append({
                "role": "assistant", "content": msg.content or "",
                "tool_calls": [{"id": tc.id, "type": "function",
                               "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                              for tc in tcs] if tcs else None
            })

            for tc in tcs:
                args = json.loads(tc.function.arguments) if tc.function.arguments else {}
                result = self.exec_tool(tc.function.name, args)
                self.messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})

            if self.done:
                return "Submitted", self.patch
            if resp.choices[0].finish_reason == "stop" and not tcs:
                self.patch = self.env.get_patch()
                return "EndTurn", self.patch

        self.patch = self.env.get_patch()
        return "MaxTurns", self.patch

# =============================================================================
# MAIN
# =============================================================================

def get_image(inst: dict) -> str:
    iid = inst["instance_id"].replace("__", "_1776_")
    return f"docker.io/swebench/sweb.eval.x86_64.{iid}:latest".lower()

def run_comparison(instances: list, agents: list, output_dir: Path):
    output_dir.mkdir(parents=True, exist_ok=True)
    results = {a: {} for a in agents}

    for i, inst in enumerate(instances):
        iid = inst["instance_id"]
        image = get_image(inst)

        print(f"\n{'='*60}")
        print(f"[{i+1}/{len(instances)}] {iid}")
        print(f"{'='*60}")

        # Pull image once
        subprocess.run(["docker", "pull", image], capture_output=True, timeout=600)

        for agent_id in agents:
            cfg = AGENTS[agent_id]
            print(f"\n  >> {cfg['name']}")

            env = DockerEnv()
            try:
                env.start(image)
                agent = Agent(env, cfg)
                status, patch = agent.run(inst["problem_statement"])

                results[agent_id][iid] = {
                    "instance_id": iid,
                    "model_patch": patch,
                    "status": status,
                    "tools": agent.tool_calls,
                    "cost": agent.cost,
                }
                has_patch = "Y" if patch else "N"
                print(f"     [{has_patch}] Status: {status}, Tools: {agent.tool_calls}, Cost: ${agent.cost:.2f}, Patch: {len(patch)} chars")

            except Exception as e:
                print(f"     Error: {e}")
                results[agent_id][iid] = {"instance_id": iid, "model_patch": "", "status": f"Error: {e}"}
            finally:
                env.stop()

    # Save predictions for each agent
    for agent_id in agents:
        preds = {iid: {"instance_id": iid, "model_name_or_path": f"nano-{agent_id}", "model_patch": r["model_patch"]}
                 for iid, r in results[agent_id].items()}
        (output_dir / f"preds_{agent_id}.json").write_text(json.dumps(preds, indent=2))

    # Summary table
    print(f"\n{'='*60}")
    print("COMPARISON SUMMARY")
    print(f"{'='*60}")
    print(f"{'Agent':<25} | {'Patches':<10} | {'Tools':<8} | {'Cost':<8}")
    print("-" * 60)
    for agent_id in agents:
        patches = sum(1 for r in results[agent_id].values() if r.get("model_patch"))
        tools = sum(r.get("tools", 0) for r in results[agent_id].values())
        cost = sum(r.get("cost", 0) for r in results[agent_id].values())
        print(f"{AGENTS[agent_id]['name']:<25} | {patches}/{len(instances):<8} | {tools:<8} | ${cost:.2f}")

    print(f"\nPredictions saved to: {output_dir}")
    print("\nTo evaluate:")
    for agent_id in agents:
        print(f"  python -m swebench.harness.run_evaluation -d princeton-nlp/SWE-bench_Lite -s dev -p {output_dir}/preds_{agent_id}.json -id {agent_id}")

    return results

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("-n", "--num", type=int, default=5, help="Number of instances")
    parser.add_argument("-a", "--agents", nargs="+", default=["minimal", "expert", "workflow"], help="Agents to test")
    parser.add_argument("-o", "--output", default="./agent_comparison", help="Output directory")
    args = parser.parse_args()

    print("Loading SWE-bench Lite...")
    instances = list(load_dataset("princeton-nlp/SWE-bench_Lite", split="dev"))[:args.num]
    print(f"Testing {len(instances)} instances with agents: {args.agents}")

    run_comparison(instances, args.agents, Path(args.output))

if __name__ == "__main__":
    main()
