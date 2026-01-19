import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, Message, Tool, StreamChunk, ToolCall } from '../types.js';
import { getSystemPrompt } from '../constants.js';

export class AnthropicProvider implements LLMProvider {
  name = 'anthropic';
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(apiKey: string, model: string, maxTokens: number) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.maxTokens = maxTokens;
  }

  async chat(
    messages: Message[],
    tools: Tool[],
    onChunk: (chunk: StreamChunk) => void
  ): Promise<Message> {
    const anthropicMessages = this.convertMessages(messages);
    const anthropicTools = this.convertTools(tools);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: getSystemPrompt(),
      messages: anthropicMessages,
      tools: anthropicTools,
      stream: true,
    });

    let fullText = '';
    const toolCalls: ToolCall[] = [];
    let currentToolUse: { id: string; name: string; input: string } | null = null;

    for await (const event of response) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          currentToolUse = {
            id: event.content_block.id,
            name: event.content_block.name,
            input: '',
          };
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          fullText += event.delta.text;
          onChunk({ type: 'text', content: event.delta.text });
        } else if (event.delta.type === 'input_json_delta' && currentToolUse) {
          currentToolUse.input += event.delta.partial_json;
        }
      } else if (event.type === 'content_block_stop') {
        if (currentToolUse) {
          try {
            const args = JSON.parse(currentToolUse.input || '{}');
            const toolCall: ToolCall = {
              id: currentToolUse.id,
              name: currentToolUse.name,
              arguments: args,
            };
            toolCalls.push(toolCall);
            onChunk({ type: 'tool_use', toolCall });
          } catch {
            // Invalid JSON, skip
          }
          currentToolUse = null;
        }
      } else if (event.type === 'message_stop') {
        onChunk({ type: 'done' });
      }
    }

    return {
      role: 'assistant',
      content: fullText,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  private convertMessages(messages: Message[]): Anthropic.MessageParam[] {
    const result: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') continue;

      if (msg.role === 'user') {
        if (msg.toolResults && msg.toolResults.length > 0) {
          // This is a tool result message
          result.push({
            role: 'user',
            content: msg.toolResults.map((tr) => ({
              type: 'tool_result' as const,
              tool_use_id: tr.toolCallId,
              content: tr.content,
              is_error: tr.isError,
            })),
          });
        } else {
          result.push({
            role: 'user',
            content: msg.content,
          });
        }
      } else if (msg.role === 'assistant') {
        const content: Anthropic.ContentBlockParam[] = [];

        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }

        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            content.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.arguments,
            });
          }
        }

        if (content.length > 0) {
          result.push({ role: 'assistant', content });
        }
      }
    }

    return result;
  }

  private convertTools(tools: Tool[]): Anthropic.Tool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object' as const,
        properties: tool.parameters.properties,
        required: tool.parameters.required,
      },
    }));
  }
}
