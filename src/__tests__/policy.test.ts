import { describe, it, expect } from 'vitest';
import { checkPolicy } from '../policy.js';
import type { Policy } from '../types.js';

const basePolicy: Policy = {
  version: 1,
  default_action: 'allow',
  rules: [],
};

describe('checkPolicy — tool matching', () => {
  it('allows tool when no rules match and default is allow', () => {
    const result = checkPolicy(basePolicy, 'read_file', {});
    expect(result.action).toBe('allow');
    expect(result.rule).toBeNull();
  });

  it('blocks tool when no rules match and default is block', () => {
    const policy: Policy = { ...basePolicy, default_action: 'block' };
    const result = checkPolicy(policy, 'read_file', {});
    expect(result.action).toBe('block');
    expect(result.rule).toBeNull();
  });

  it('blocks when tool name matches exactly', () => {
    const policy: Policy = {
      ...basePolicy,
      rules: [{ name: 'no-write', tool: 'write_file', action: 'block' }],
    };
    const result = checkPolicy(policy, 'write_file', {});
    expect(result.action).toBe('block');
    expect(result.rule?.name).toBe('no-write');
  });

  it('does not block when tool name does not match exactly', () => {
    const policy: Policy = {
      ...basePolicy,
      rules: [{ name: 'no-write', tool: 'write_file', action: 'block' }],
    };
    const result = checkPolicy(policy, 'read_file', {});
    expect(result.action).toBe('allow');
  });

  it('blocks when tool name matches regex', () => {
    const policy: Policy = {
      ...basePolicy,
      rules: [
        { name: 'no-shell', tool: { matches: 'execute_command|run_shell|bash' }, action: 'block' },
      ],
    };
    expect(checkPolicy(policy, 'execute_command', {}).action).toBe('block');
    expect(checkPolicy(policy, 'run_shell', {}).action).toBe('block');
    expect(checkPolicy(policy, 'bash', {}).action).toBe('block');
    expect(checkPolicy(policy, 'read_file', {}).action).toBe('allow');
  });

  it('uses first matching rule (not subsequent rules)', () => {
    const policy: Policy = {
      ...basePolicy,
      rules: [
        { name: 'first', tool: 'read_file', action: 'block' },
        { name: 'second', tool: 'read_file', action: 'allow' },
      ],
    };
    const result = checkPolicy(policy, 'read_file', {});
    expect(result.action).toBe('block');
    expect(result.rule?.name).toBe('first');
  });
});

describe('checkPolicy — argument conditions', () => {
  it('blocks when arg matches condition', () => {
    const policy: Policy = {
      ...basePolicy,
      rules: [
        {
          name: 'no-credential-read',
          tool: 'read_file',
          when: { path: { matches: '\\.env$|\\.aws/|\\.ssh/' } },
          action: 'block',
          message: 'Credential files are protected',
        },
      ],
    };
    expect(checkPolicy(policy, 'read_file', { path: '/home/user/.env' }).action).toBe('block');
    expect(checkPolicy(policy, 'read_file', { path: '/home/user/.aws/credentials' }).action).toBe('block');
    expect(checkPolicy(policy, 'read_file', { path: '/tmp/data.json' }).action).toBe('allow');
  });

  it('blocks when arg does NOT match not_matches condition', () => {
    const policy: Policy = {
      ...basePolicy,
      rules: [
        {
          name: 'restrict-fetch',
          tool: 'fetch',
          when: { url: { not_matches: '^https://api\\.github\\.com/' } },
          action: 'block',
        },
      ],
    };
    expect(checkPolicy(policy, 'fetch', { url: 'https://evil.example.com' }).action).toBe('block');
    expect(checkPolicy(policy, 'fetch', { url: 'https://api.github.com/repos' }).action).toBe('allow');
  });

  it('evaluates multiple when conditions as AND', () => {
    const policy: Policy = {
      ...basePolicy,
      rules: [
        {
          name: 'block-prod-delete',
          tool: 'delete_file',
          when: {
            path: { matches: '/prod/' },
            confirmed: { not_matches: '^true$' },
          },
          action: 'block',
        },
      ],
    };
    // Both conditions true → block
    expect(checkPolicy(policy, 'delete_file', { path: '/prod/db', confirmed: 'false' }).action).toBe('block');
    // confirmed=true → second condition fails → allow
    expect(checkPolicy(policy, 'delete_file', { path: '/prod/db', confirmed: 'true' }).action).toBe('allow');
    // path doesn't match → first condition fails → allow
    expect(checkPolicy(policy, 'delete_file', { path: '/dev/db', confirmed: 'false' }).action).toBe('allow');
  });

  it('treats missing arg as empty string for condition matching', () => {
    const policy: Policy = {
      ...basePolicy,
      rules: [
        {
          name: 'require-arg',
          tool: 'some_tool',
          when: { key: { not_matches: '.+' } },
          action: 'block',
        },
      ],
    };
    // key is absent → treated as '' → not_matches '.+' is true → block
    expect(checkPolicy(policy, 'some_tool', {}).action).toBe('block');
    // key is present → not_matches '.+' is false → allow
    expect(checkPolicy(policy, 'some_tool', { key: 'value' }).action).toBe('allow');
  });

  it('returns rule message in result', () => {
    const policy: Policy = {
      ...basePolicy,
      rules: [
        {
          name: 'no-credential-read',
          tool: 'read_file',
          when: { path: { matches: '\\.env$' } },
          action: 'block',
          message: 'Credential files are protected by mcp-runtime-guard',
        },
      ],
    };
    const result = checkPolicy(policy, 'read_file', { path: '/home/.env' });
    expect(result.rule?.message).toBe('Credential files are protected by mcp-runtime-guard');
  });
});
