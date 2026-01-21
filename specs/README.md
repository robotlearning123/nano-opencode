# nano-opencode Specifications

This directory contains **language-agnostic specifications** that define the core interfaces and protocols for nano-opencode. These specifications enable multi-language implementations while ensuring interoperability.

## Directory Structure

```
specs/
├── interfaces/           # JSON Schema definitions for core types
│   ├── tool.schema.json      # Tool interface definition
│   ├── agent.schema.json     # Agent interface definition
│   ├── hook.schema.json      # Hook interface definition
│   ├── service.schema.json   # Service (MCP/LSP) interface
│   └── provider.schema.json  # Model provider interface
├── protocols/            # Protocol specifications (docs)
│   ├── mcp.md               # MCP protocol usage
│   ├── lsp.md               # LSP protocol usage
│   └── rpc.md               # JSON-RPC 2.0 conventions
└── plugins/              # Plugin format specifications
    ├── agent.yaml.md        # Agent YAML format
    ├── skill.md.md          # Skill Markdown format
    ├── hook.yaml.md         # Hook YAML format
    └── command.yaml.md      # Command YAML format
```

## Using the Schemas

### Validation
Use any JSON Schema validator to validate your plugins:

```bash
# JavaScript/Node.js
npx ajv validate -s specs/interfaces/agent.schema.json -d my-agent.yaml

# Python
python -c "import jsonschema; jsonschema.validate(...)"
```

### Type Generation
Generate TypeScript types from schemas:
```bash
npx json-schema-to-typescript specs/interfaces/*.json -o src/generated/
```

## Interface Stability

| Interface | Stability | Breaking Changes |
|-----------|-----------|------------------|
| Tool | **Stable** | Never |
| Agent | **Stable** | Never |
| Hook | **Stable** | Never |
| Service | **Stable** | Never |
| Provider | **Stable** | Additive only |

## Multi-Language Implementation

These schemas serve as the **single source of truth** for implementations in:
- TypeScript (reference implementation)
- Python
- Rust
- Go

Each implementation must pass validation against these schemas.
