# mcp-runtime-guard

<a href="README.en.md">English Readme here</a>

MCPサーバーへのtool callをポリシーに基づいてリアルタイムでブロックするランタイムプロキシ。

AIエージェント（Claude Code、Cursor等）と実MCPサーバーの間に透過的に挟まり、YAMLで定義したルールに違反するtool callを**実行前に**ブロックする。

---

## 仕組み

```
Claude Code / Cursor
    │  stdio (JSON-RPC 2.0)
    ▼
mcp-runtime-guard   ← ここでポリシー評価（実行前）
    │  stdio (JSON-RPC 2.0, subprocess)
    ▼
実MCPサーバー
```

mcp-runtime-guard 自身がMCPサーバーとして振る舞い、実サーバーをサブプロセスとして起動する。`tools/list`・`resources`・`prompts` はそのまま転送し、`tools/call` だけを傍受する。

---

## 特徴

- **同期的ブロック** — deny 判定時は upstream に一切転送しない
- **ポリシー駆動** — ルールはコード外のYAMLファイルで定義。再ビルド不要
- **fail-closed** — policy ファイルが読めなければ起動失敗。プロキシがクラッシュすれば stdio が切れてエージェントにエラーが返る
- **完全インターセプト** — すべての `tools/call` がポリシーエンジンを通過する。抜け道なし

---

## インストール

```bash
npm install -g mcp-runtime-guard
```

npx で直接使う場合:

```bash
npx mcp-runtime-guard --policy ./policy.yaml -- npx @modelcontextprotocol/server-filesystem /home/user
```

---

## 使い方

```bash
mcp-runtime-guard --policy <ポリシーファイルのパス> -- <upstreamコマンド> [args...]
```

`--` 以降がすべて upstream MCPサーバーのコマンドライン。

### オプション

| オプション | 説明 | デフォルト |
|-----------|------|-----------|
| `--policy <path>` | YAMLポリシーファイルのパス | 必須 |
| `--log-level <level>` | `debug` / `info` / `warn` | `info` |
| `--log-file <path>` | JSONL監査ログの出力先 | stderrのみ |

### Claude Desktop への組み込み例

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

## ポリシーファイル

```yaml
version: 1

# ルールにマッチしなかったtool callのデフォルト動作
# 省略した場合は "block"（fail-closed）
default_action: allow

rules:
  # ツール名完全一致 + 引数条件
  - name: no-credential-read
    tool: read_file
    when:
      path:
        matches: '\.env$|\.env\.|\.aws/|\.ssh/|id_rsa|\.pem$'
    action: block
    message: "Credential files are protected by mcp-runtime-guard"

  # ツール名 regex
  - name: no-shell
    tool:
      matches: 'execute_command|run_shell|bash|eval'
    action: block
    message: "Shell execution is not allowed"

  # not_matches でallowlist
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

### マッチングルール

| 設定 | 動作 |
|-----|------|
| `tool: "write_file"` | 完全一致 |
| `tool: { matches: "..." }` | 正規表現マッチ |
| `when: { key: { matches: "..." } }` | 引数の値が正規表現にマッチ |
| `when: { key: { not_matches: "..." } }` | 引数の値が正規表現に**不**マッチ |
| 複数の `when` 条件 | AND 評価 |
| 複数のルール | 上から順に評価、最初のマッチが適用 |
| マッチなし | `default_action` に従う |

---

## ブロック時のレスポンス

upstreamサーバーは呼ばれず、MCP標準の `CallToolResult` エラーが返る。

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

## ログ

**stderr**（リアルタイム確認用）:
```
[mcp-runtime-guard] BLOCK  read_file   {"path":"/home/user/.env"}   rule=no-credential-read
[mcp-runtime-guard] ALLOW  read_file   {"path":"/tmp/data.json"}
```

**JSONLファイル**（構造化監査ログ、オプション）:
```jsonl
{"ts":"2026-04-07T10:00:01Z","action":"BLOCK","tool":"read_file","args":{"path":"/home/user/.env"},"rule":"no-credential-read","message":"Credential files are protected by mcp-runtime-guard"}
{"ts":"2026-04-07T10:00:02Z","action":"ALLOW","tool":"read_file","args":{"path":"/tmp/data.json"},"rule":null,"message":null}
```

---

## License

Apache-2.0
