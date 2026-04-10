import fs from 'fs';
import path from 'path';
import type { LogEntry, LoggingConfig } from './types.js';

export class Logger {
  private fileStream: fs.WriteStream | null = null;

  constructor(config: LoggingConfig) {
    if (config.file) {
      const filePath = config.file.replace(/^~/, process.env['HOME'] ?? '');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      this.fileStream = fs.createWriteStream(filePath, { flags: 'a' });
    }
  }

  log(entry: LogEntry): void {
    const argsStr = JSON.stringify(entry.args);
    const rulePart = entry.rule ? ` rule=${entry.rule}` : '';
    const line = `[mcp-runtime-guard] ${entry.action}  ${entry.tool}   ${argsStr}${rulePart}\n`;
    process.stderr.write(line);

    if (this.fileStream) {
      this.fileStream.write(JSON.stringify(entry) + '\n');
    }
  }

  info(message: string): void {
    process.stderr.write(`[mcp-runtime-guard] INFO   ${message}\n`);
  }

  close(): void {
    this.fileStream?.end();
  }
}
