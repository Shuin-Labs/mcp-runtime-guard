import { describe, it, expect, vi, afterEach } from 'vitest';
import { Logger } from '../logger.js';
import type { LogEntry } from '../types.js';

describe('Logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes ALLOW entry to stderr', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const logger = new Logger({});

    const entry: LogEntry = {
      ts: '2026-04-09T00:00:00.000Z',
      action: 'ALLOW',
      tool: 'read_file',
      args: { path: '/tmp/data.json' },
      rule: null,
      message: null,
    };
    logger.log(entry);

    expect(spy).toHaveBeenCalledOnce();
    const line = spy.mock.calls[0][0] as string;
    expect(line).toContain('[mcp-runtime-guard]');
    expect(line).toContain('ALLOW');
    expect(line).toContain('read_file');
    expect(line).toContain('/tmp/data.json');
  });

  it('writes BLOCK entry with rule name to stderr', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const logger = new Logger({});

    const entry: LogEntry = {
      ts: '2026-04-09T00:00:00.000Z',
      action: 'BLOCK',
      tool: 'write_file',
      args: { path: '/home/user/.env' },
      rule: 'no-credential-read',
      message: 'Credential files are protected',
    };
    logger.log(entry);

    expect(spy).toHaveBeenCalledOnce();
    const line = spy.mock.calls[0][0] as string;
    expect(line).toContain('BLOCK');
    expect(line).toContain('write_file');
    expect(line).toContain('no-credential-read');
  });

  it('writes INFO message to stderr', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const logger = new Logger({});

    logger.info('Starting proxy → npx server');

    const line = spy.mock.calls[0][0] as string;
    expect(line).toContain('[mcp-runtime-guard]');
    expect(line).toContain('INFO');
    expect(line).toContain('Starting proxy');
  });
});
