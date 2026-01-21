# nano-opencode Python (71 LOC)

Zero-dependency AI coding agent that runs anywhere Python 3.8+ exists.

## Usage

```bash
# Single prompt
ANTHROPIC_API_KEY=sk-... python nano.py "list all Python files"

# Environment variable
export ANTHROPIC_API_KEY=sk-...
python nano.py "read requirements.txt and explain dependencies"
```

## Features

- **71 lines** of pure Python
- **Zero dependencies** - uses only stdlib
- **5 tools**: read_file, write_file, edit_file, bash, list_dir
- **Runs on**: Any device with Python 3.8+ (Pi, embedded, servers)

## Why Python?

- Universal availability (pre-installed on most systems)
- Great for data science / ML workflows
- Easy to extend with ML libraries
- Perfect for Raspberry Pi and embedded Linux

## Extending

Add new tools by:
1. Add tool definition to `TOOLS` list
2. Add handler in `run()` function

Example - adding a grep tool:
```python
# In TOOLS list:
{"name": "grep", "description": "Search files", "input_schema": {...}}

# In run() function:
if name == "grep":
    import subprocess
    return subprocess.run(["grep", "-rn", i["pattern"], i.get("path", ".")],
                         capture_output=True, text=True).stdout[:10000]
```
