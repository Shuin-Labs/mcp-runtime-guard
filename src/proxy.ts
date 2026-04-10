import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { checkPolicy } from './policy.js';
import type { Logger } from './logger.js';
import type { Policy } from './types.js';

export interface ProxyConfig {
  policy: Policy;
  logger: Logger;
  upstreamCommand: string[];
}

export async function startProxy(config: ProxyConfig): Promise<void> {
  const { policy, logger, upstreamCommand } = config;

  if (!upstreamCommand[0]) {
    throw new Error('upstreamCommand must be a non-empty array');
  }

  // 1. Connect to upstream MCP server as a client
  const upstream = new Client({ name: 'mcp-runtime-guard-upstream', version: '1.0.0' });
  const upstreamTransport = new StdioClientTransport({
    command: upstreamCommand[0],
    args: upstreamCommand.slice(1),
    // Filter undefined values — StdioClientTransport expects Record<string, string>
    env: Object.fromEntries(
      Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
    ),
  });

  logger.info(`Starting proxy → ${upstreamCommand.join(' ')}`);
  try {
    await upstream.connect(upstreamTransport);
  } catch (err) {
    await upstreamTransport.close().catch(() => {});
    throw new Error(`Failed to connect to upstream MCP server: ${String(err)}`);
  }

  const upstreamCaps = upstream.getServerCapabilities() ?? {};

  // 2. Create proxy server with capabilities mirrored from upstream
  const server = new Server(
    { name: 'mcp-runtime-guard', version: '1.0.0' },
    {
      capabilities: {
        tools: upstreamCaps.tools ?? {},
        ...(upstreamCaps.resources ? { resources: upstreamCaps.resources } : {}),
        ...(upstreamCaps.prompts ? { prompts: upstreamCaps.prompts } : {}),
      },
    },
  );

  // 3. tools/list: forward to upstream unchanged
  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    return await upstream.listTools({ cursor: request.params?.cursor });
  });

  // 4. tools/call: enforce policy, then forward or block
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;
    const args: Record<string, unknown> = rawArgs ?? {};
    const check = checkPolicy(policy, name, args);

    if (check.action === 'block') {
      logger.log({
        ts: new Date().toISOString(),
        action: 'BLOCK',
        tool: name,
        args,
        rule: check.rule?.name ?? null,
        message: check.rule?.message ?? null,
      });
      const detail = check.rule?.message
        ? `${check.rule.message} (rule: ${check.rule.name})`
        : 'Blocked by default policy';
      return {
        content: [{ type: 'text', text: `[mcp-runtime-guard] BLOCKED: ${detail}` }],
        isError: true,
      };
    }

    logger.log({
      ts: new Date().toISOString(),
      action: 'ALLOW',
      tool: name,
      args,
      rule: null,
      message: null,
    });

    return await upstream.callTool({ name, arguments: args });
  });

  // 5. Passthrough handlers for resources (if upstream supports them)
  if (upstreamCaps.resources) {
    server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
      return await upstream.listResources({ cursor: request.params?.cursor });
    });
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      return await upstream.readResource({ uri: request.params.uri });
    });
  }

  // 6. Passthrough handlers for prompts (if upstream supports them)
  if (upstreamCaps.prompts) {
    server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
      return await upstream.listPrompts({ cursor: request.params?.cursor });
    });
    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      return await upstream.getPrompt(request.params);
    });
  }

  // 8. Clean shutdown on signal (register before connecting to avoid race)
  const shutdown = async () => {
    try {
      await upstream.close();
      await server.close();
    } finally {
      logger.close();
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => { void shutdown(); });
  process.on('SIGINT', () => { void shutdown(); });

  // 7. Connect proxy server to stdio (toward Claude/Cursor)
  const serverTransport = new StdioServerTransport();
  await server.connect(serverTransport);
}
