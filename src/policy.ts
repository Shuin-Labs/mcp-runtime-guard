import fs from 'fs';
import yaml from 'js-yaml';
import type { Policy, Rule, PolicyCheckResult } from './types.js';

export function loadPolicy(filePath: string): Policy {
  const resolvedPath = filePath.replace(/^~/, process.env['HOME'] ?? '');
  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const raw = yaml.load(content) as Policy;
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid policy file: ${filePath}`);
  }
  if (!Array.isArray(raw.rules)) {
    raw.rules = [];
  }
  if (raw.default_action === undefined) {
    raw.default_action = 'block';
  }
  return raw;
}

export function checkPolicy(
  policy: Policy,
  toolName: string,
  args: Record<string, unknown>,
): PolicyCheckResult {
  for (const rule of policy.rules) {
    if (matchesTool(rule.tool, toolName) && matchesWhen(rule.when, args)) {
      return { action: rule.action, rule };
    }
  }
  return { action: policy.default_action, rule: null };
}

function matchesTool(tool: Rule['tool'], toolName: string): boolean {
  if (typeof tool === 'string') {
    return tool === toolName;
  }
  return new RegExp(tool.matches).test(toolName);
}

function matchesWhen(
  when: Rule['when'],
  args: Record<string, unknown>,
): boolean {
  if (!when) return true;
  for (const [key, condition] of Object.entries(when)) {
    const value = String(args[key] ?? '');
    if (condition.matches !== undefined && !new RegExp(condition.matches).test(value)) {
      return false;
    }
    if (condition.not_matches !== undefined && new RegExp(condition.not_matches).test(value)) {
      return false;
    }
  }
  return true;
}
