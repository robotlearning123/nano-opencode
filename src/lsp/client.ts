/**
 * LSP Client - minimal JSON-RPC client for language servers
 * Uses the unified RPC client with Content-Length framing
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, extname, resolve } from 'path';
import { RpcClient } from '../rpc/index.js';
import type { Position, Location, Diagnostic, Hover, LanguageServerConfig } from './types.js';
import { DEFAULT_SERVERS, EXT_TO_LANG } from './types.js';

export class LSPClient {
  private rpc: RpcClient | null = null;
  private config: LanguageServerConfig;
  private initialized = false;
  private rootUri: string;
  private openFiles = new Set<string>();

  constructor(config: LanguageServerConfig, rootPath: string) {
    this.config = config;
    this.rootUri = `file://${resolve(rootPath)}`;
  }

  async start(): Promise<void> {
    if (this.rpc) return;

    this.rpc = new RpcClient({
      command: this.config.command,
      args: this.config.args,
      framing: 'content-length',
      timeout: 10000,
    });

    await this.rpc.connect();
    await this.initialize();
  }

  private async initialize(): Promise<void> {
    if (!this.rpc) throw new Error('Not connected');

    await this.rpc.request('initialize', {
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

    this.rpc.notify('initialized', {});
    this.initialized = true;
  }

  async openFile(filePath: string): Promise<void> {
    const uri = `file://${resolve(filePath)}`;
    if (this.openFiles.has(uri)) return;

    const content = readFileSync(filePath, 'utf-8');
    const ext = extname(filePath);
    const languageId = EXT_TO_LANG[ext] || 'plaintext';

    this.rpc?.notify('textDocument/didOpen', {
      textDocument: { uri, languageId, version: 1, text: content },
    });
    this.openFiles.add(uri);
  }

  async getDefinition(filePath: string, line: number, character: number): Promise<Location[]> {
    if (!this.initialized) await this.start();
    await this.openFile(filePath);

    const result = await this.rpc?.request<Location | Location[] | null>('textDocument/definition', {
      textDocument: { uri: `file://${resolve(filePath)}` },
      position: { line, character },
    });

    if (!result) return [];
    return Array.isArray(result) ? result : [result];
  }

  async getReferences(filePath: string, line: number, character: number): Promise<Location[]> {
    if (!this.initialized) await this.start();
    await this.openFile(filePath);

    const result = await this.rpc?.request<Location[] | null>('textDocument/references', {
      textDocument: { uri: `file://${resolve(filePath)}` },
      position: { line, character },
      context: { includeDeclaration: true },
    });

    return result || [];
  }

  async getHover(filePath: string, line: number, character: number): Promise<string | null> {
    if (!this.initialized) await this.start();
    await this.openFile(filePath);

    const result = await this.rpc?.request<Hover | null>('textDocument/hover', {
      textDocument: { uri: `file://${resolve(filePath)}` },
      position: { line, character },
    });

    if (!result) return null;
    const contents = result.contents;
    if (typeof contents === 'string') return contents;
    if (typeof contents === 'object' && 'value' in contents) return contents.value;
    return null;
  }

  async getDiagnostics(_filePath: string): Promise<Diagnostic[]> {
    // Most servers send diagnostics via notifications
    return [];
  }

  stop(): void {
    if (this.rpc) {
      this.rpc.notify('shutdown', {});
      setTimeout(() => {
        this.rpc?.notify('exit', {});
        this.rpc?.disconnect();
        this.rpc = null;
      }, 100);
    }
    this.initialized = false;
    this.openFiles.clear();
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
