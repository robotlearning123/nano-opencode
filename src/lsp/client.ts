/**
 * LSP Client - minimal JSON-RPC client for language servers
 */

import { spawn, type ChildProcess } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { dirname, extname, resolve } from 'path';
import type { Position, Location, Diagnostic, Hover, LanguageServerConfig } from './types.js';
import { DEFAULT_SERVERS, EXT_TO_LANG } from './types.js';

export class LSPClient {
  private process: ChildProcess | null = null;
  private config: LanguageServerConfig;
  private requestId = 0;
  private pendingRequests = new Map<number, { resolve: Function; reject: Function }>();
  private buffer = '';
  private initialized = false;
  private rootUri: string;
  private openFiles = new Set<string>();

  constructor(config: LanguageServerConfig, rootPath: string) {
    this.config = config;
    this.rootUri = `file://${resolve(rootPath)}`;
  }

  async start(): Promise<void> {
    if (this.process) return;

    this.process = spawn(this.config.command, this.config.args || [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stdout?.on('data', (data) => this.handleData(data.toString()));
    this.process.stderr?.on('data', (data) => console.error(`[LSP] ${data}`));
    this.process.on('error', (err) => console.error(`[LSP] Error: ${err.message}`));
    this.process.on('close', () => { this.process = null; this.initialized = false; });

    await this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.request('initialize', {
      processId: process.pid,
      rootUri: this.rootUri,
      capabilities: {
        textDocument: {
          hover: { contentFormat: ['plaintext', 'markdown'] },
          definition: { linkSupport: true },
          references: {},
          publishDiagnostics: {},
        },
      },
    });
    this.notify('initialized', {});
    this.initialized = true;
  }

  private handleData(data: string): void {
    this.buffer += data;

    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const header = this.buffer.slice(0, headerEnd);
      const match = header.match(/Content-Length: (\d+)/);
      if (!match) break;

      const contentLength = parseInt(match[1], 10);
      const contentStart = headerEnd + 4;
      if (this.buffer.length < contentStart + contentLength) break;

      const content = this.buffer.slice(contentStart, contentStart + contentLength);
      this.buffer = this.buffer.slice(contentStart + contentLength);

      try {
        const msg = JSON.parse(content);
        if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
          const { resolve, reject } = this.pendingRequests.get(msg.id)!;
          this.pendingRequests.delete(msg.id);
          msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
        }
      } catch {}
    }
  }

  private send(msg: object): void {
    if (!this.process?.stdin) return;
    const content = JSON.stringify(msg);
    const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
    this.process.stdin.write(header + content);
  }

  private request(method: string, params: object): Promise<unknown> {
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.send({ jsonrpc: '2.0', id, method, params });
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('LSP request timeout'));
        }
      }, 10000);
    });
  }

  private notify(method: string, params: object): void {
    this.send({ jsonrpc: '2.0', method, params });
  }

  async openFile(filePath: string): Promise<void> {
    const uri = `file://${resolve(filePath)}`;
    if (this.openFiles.has(uri)) return;

    const content = readFileSync(filePath, 'utf-8');
    const ext = extname(filePath);
    const languageId = EXT_TO_LANG[ext] || 'plaintext';

    this.notify('textDocument/didOpen', {
      textDocument: { uri, languageId, version: 1, text: content },
    });
    this.openFiles.add(uri);
  }

  async getDefinition(filePath: string, line: number, character: number): Promise<Location[]> {
    if (!this.initialized) await this.start();
    await this.openFile(filePath);

    const result = await this.request('textDocument/definition', {
      textDocument: { uri: `file://${resolve(filePath)}` },
      position: { line, character },
    }) as Location | Location[] | null;

    if (!result) return [];
    return Array.isArray(result) ? result : [result];
  }

  async getReferences(filePath: string, line: number, character: number): Promise<Location[]> {
    if (!this.initialized) await this.start();
    await this.openFile(filePath);

    const result = await this.request('textDocument/references', {
      textDocument: { uri: `file://${resolve(filePath)}` },
      position: { line, character },
      context: { includeDeclaration: true },
    }) as Location[] | null;

    return result || [];
  }

  async getHover(filePath: string, line: number, character: number): Promise<string | null> {
    if (!this.initialized) await this.start();
    await this.openFile(filePath);

    const result = await this.request('textDocument/hover', {
      textDocument: { uri: `file://${resolve(filePath)}` },
      position: { line, character },
    }) as Hover | null;

    if (!result) return null;
    const contents = result.contents;
    if (typeof contents === 'string') return contents;
    if (typeof contents === 'object' && 'value' in contents) return contents.value;
    return null;
  }

  async getDiagnostics(filePath: string): Promise<Diagnostic[]> {
    if (!this.initialized) await this.start();
    await this.openFile(filePath);
    // Most servers send diagnostics via notifications, return empty for now
    // Full implementation would track publishDiagnostics notifications
    return [];
  }

  stop(): void {
    if (this.process) {
      this.notify('shutdown', {});
      setTimeout(() => {
        this.notify('exit', {});
        this.process?.kill();
        this.process = null;
      }, 100);
    }
  }
}

// Singleton manager for LSP clients
class LSPManager {
  private clients = new Map<string, LSPClient>();

  getClient(filePath: string): LSPClient | null {
    const ext = extname(filePath);
    const lang = EXT_TO_LANG[ext];
    if (!lang) return null;

    if (!this.clients.has(lang)) {
      const config = DEFAULT_SERVERS[lang];
      if (!config) return null;

      // Find root directory
      const rootPath = this.findRoot(dirname(filePath), config.rootPatterns || []);
      this.clients.set(lang, new LSPClient(config, rootPath));
    }

    return this.clients.get(lang)!;
  }

  private findRoot(startDir: string, patterns: string[]): string {
    let dir = startDir;
    while (dir !== '/') {
      for (const pattern of patterns) {
        if (existsSync(resolve(dir, pattern))) return dir;
      }
      dir = dirname(dir);
    }
    return startDir;
  }

  stopAll(): void {
    for (const client of this.clients.values()) {
      client.stop();
    }
    this.clients.clear();
  }
}

export const lspManager = new LSPManager();
