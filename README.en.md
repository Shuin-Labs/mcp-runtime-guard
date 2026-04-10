# mcp-runtime-guard

<a href="README.md">日本語</a>

A runtime policy enforcement proxy for MCP (Model Context Protocol) servers.

Sits transparently between an AI agent (Claude Code, Cursor, etc.) and a real MCP server. Intercepts every `tools/call` request, evaluates it against a YAML policy, and either forwards it to the upstream server or blocks it — **before execution**.

---

## How it works

```
Claude Code / Cursor
    │  stdio (JSON-RPC 2.0)
    ▼
mcp-runtime-guard   ← policy evaluated here, before forwarding
    │  stdio (JSON-RPC 2.0, subprocess)
    ▼
Real MCP server
```

mcp-runtime-guard acts as an MCP server itself, spawning the real server as a subprocess. All `tools/list`, `resources`, and `prompts` requests are passed through unchanged. Only `tools/call` is intercepted.

---

## Key properties

- **Synchronous block** — the upstream server is never called when a request is denied
- **Policy-driven** — rules are defined in a YAML file outside the code; no rebuild required to change behavior
- **Fail-closed** — if the policy file is missing or unreadable, the proxy refuses to start; if the proxy crashes, the stdio connection drops and the agent receives an error
- **Full interception** — every `tools/call` goes through the policy engine; there are no bypass paths

---

## Installation

```bash
npm install -g mcp-runtime-guard
```

Or use directly with npx:

```bash
npx mcp-runtime-guard --policy ./policy.yaml -- npx @modelcontextprotocol/server-filesystem /home/user
```

---

## Usage

```bash
mcp-runtime-guard --policy <path-to-policy.yaml> -- <upstream-command> [args...]
```

Everything after `--` is the upstream MCP server command.

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--policy <path>` | Path to YAML policy file | required |
| `--log-level <level>` | `debug` / `info` / `warn` | `info` |
| `--log-file <path>` | Path for JSONL audit log | stderr only |

### Example: Claude Desktop config

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "mcp-runtime-guard",
        "--policy", "/home/user/.config/mcp-runtime-guard/policy.yaml",
        "--",
        "npx", "@modelcontextprotocol/server-filesystem", "/home/user"
      ]
    }
  }
}
```

---

## Policy file

```yaml
version: 1

# Fallback for tool calls that match no rule.
# Omitting this field defaults to "block" (fail-closed).
default_action: allow

rules:
  # Exact tool name match + argument condition
  - name: no-credential-read
    tool: read_file
    when:
      path:
        matches: '\.env$|\.env\.|\.aws/|\.ssh/|id_rsa|\.pem$'
    action: block
    message: "Credential files are protected by mcp-runtime-guard"

  # Tool name regex
  - name: no-shell
    tool:
      matches: 'execute_command|run_shell|bash|eval'
    action: block
    message: "Shell execution is not allowed"

  # Allowlist via not_matches
  - name: restrict-fetch
    tool: fetch
    when:
      url:
        not_matches: '^https://api\.github\.com/'
    action: block
    message: "External requests restricted to api.github.com"

logging:
  level: info
  # file: ~/.mcp-runtime-guard/audit.jsonl
```

### Matching rules

| Config | Behavior |
|--------|----------|
| `tool: "write_file"` | Exact match |
| `tool: { matches: "..." }` | Regex match |
| `when: { key: { matches: "..." } }` | Argument value matches regex |
| `when: { key: { not_matches: "..." } }` | Argument value does NOT match regex |
| Multiple `when` conditions | Evaluated as AND |
| Multiple rules | First match wins (top to bottom) |
| No match | Falls back to `default_action` |

---

## When a request is blocked

The proxy returns a standard MCP `CallToolResult` error. The upstream server is never called.

```json
{
  "content": [{
    "type": "text",
    "text": "[mcp-runtime-guard] BLOCKED: Credential files are protected by mcp-runtime-guard (rule: no-credential-read)"
  }],
  "isError": true
}
```

---

## Logging

**stderr** (real-time):
```
[mcp-runtime-guard] BLOCK  read_file   {"path":"/home/user/.env"}   rule=no-credential-read
[mcp-runtime-guard] ALLOW  read_file   {"path":"/tmp/data.json"}
```

**JSONL file** (structured audit log, optional):
```jsonl
{"ts":"2026-04-07T10:00:01Z","action":"BLOCK","tool":"read_file","args":{"path":"/home/user/.env"},"rule":"no-credential-read","message":"Credential files are protected by mcp-runtime-guard"}
{"ts":"2026-04-07T10:00:02Z","action":"ALLOW","tool":"read_file","args":{"path":"/tmp/data.json"},"rule":null,"message":null}
```

---

## License

MIT
