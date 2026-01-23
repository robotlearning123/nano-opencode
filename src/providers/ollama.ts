/**
 * Ollama Provider - Local LLM support via Ollama
 *
 * Ollama provides an OpenAI-compatible API, so we use fetch directly
 * to avoid requiring the openai package for local models.
 */

import type { LLMProvider, Message, Tool, StreamChunk, ToolCall } from '../types.js';
import { getSystemPrompt } from '../constants.js';

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_call_id?: string;
}

interface OllamaToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

interface OllamaStreamChunk {
  message?: {
    content?: string;
    tool_calls?: Array<{
      id?: string;
      function?: {
        name?: string;
        arguments?: string;
      };
    }>;
  };
  done?: boolean;
}

export class OllamaProvider implements LLMProvider {
  name = 'ollama';
  private baseUrl: string;
  private model: string;
  private maxTokens: number;

  constructor(model: string = 'llama3.2', baseUrl: string = 'http://localhost:11434') {
    this.model = model;
    this.baseUrl = baseUrl;
    this.maxTokens = 8192; // Default for most Ollama models
  }

  async chat(
    messages: Message[],
    tools: Tool[],
    onChunk: (chunk: StreamChunk) => void,
    systemPrompt?: string
  ): Promise<Message> {
    const ollamaMessages = this.convertMessages(messages, systemPrompt);
    const ollamaTools = this.convertTools(tools);

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: ollamaMessages,
        tools: ollamaTools.length > 0 ? ollamaTools : undefined,
        stream: true,
        options: {
          num_predict: this.maxTokens,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${error}`);
    }

    if (!response.body) {
      throw new Error('No response body from Ollama');
    }

    let fullText = '';
    const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();
    let toolCallIndex = 0;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n').filter((line) => line.trim());

        for (const line of lines) {
          try {
            const chunk: OllamaStreamChunk = JSON.parse(line);

            if (chunk.message?.content) {
              fullText += chunk.message.content;
              onChunk({ type: 'text', content: chunk.message.content });
            }

            if (chunk.message?.tool_calls) {
              for (const tc of chunk.message.tool_calls) {
                if (tc.function?.name) {
                  const id = tc.id || `call_${toolCallIndex}`;
                  toolCalls.set(toolCallIndex, {
                    id,
                    name: tc.function.name,
                    arguments: tc.function.arguments || '{}',
                  });
                  toolCallIndex++;
                }
              }
            }

            if (chunk.done) {
              // Process completed tool calls
              for (const [, tc] of toolCalls) {
                try {
                  const args = JSON.parse(tc.arguments);
                  const toolCall: ToolCall = {
                    id: tc.id,
                    name: tc.name,
                    arguments: args,
                  };
                  onChunk({ type: 'tool_use', toolCall });
                } catch (error) {
                  console.error(`Failed to parse tool arguments for ${tc.name}:`, error);
                }
              }
              onChunk({ type: 'done' });
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const resultToolCalls: ToolCall[] = [];
    for (const [, tc] of toolCalls) {
      try {
        resultToolCalls.push({
          id: tc.id,
          name: tc.name,
          arguments: JSON.parse(tc.arguments),
        });
      } catch {
        // Skip invalid tool calls
      }
    }

    return {
      role: 'assistant',
      content: fullText,
      toolCalls: resultToolCalls.length > 0 ? resultToolCalls : undefined,
    };
  }

  private convertMessages(messages: Message[], systemPrompt?: string): OllamaMessage[] {
    const result: OllamaMessage[] = [
      {
        role: 'system',
        content: systemPrompt ?? getSystemPrompt(),
      },
    ];

    for (const msg of messages) {
      if (msg.role === 'system') continue;

      if (msg.role === 'user') {
        if (msg.toolResults && msg.toolResults.length > 0) {
          for (const tr of msg.toolResults) {
            result.push({
              role: 'tool',
              content: tr.content,
              tool_call_id: tr.toolCallId,
            });
          }
        } else {
          result.push({
            role: 'user',
            content: msg.content,
          });
        }
      } else if (msg.role === 'assistant') {
        const assistantMsg: OllamaMessage = {
          role: 'assistant',
          content: msg.content || '',
        };

        if (msg.toolCalls && msg.toolCalls.length > 0) {
          assistantMsg.tool_calls = msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          }));
        }

        result.push(assistantMsg);
      }
    }

    return result;
  }

  private convertTools(tools: Tool[]): OllamaTool[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: tool.parameters.properties,
          required: tool.parameters.required,
        },
      },
    }));
  }
}
