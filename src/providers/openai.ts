import OpenAI from 'openai';
import type { LLMProvider, Message, Tool, StreamChunk, ToolCall } from '../types.js';
import { getSystemPrompt } from '../constants.js';

export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  private client: OpenAI;
  private model: string;
  private maxTokens: number;

  constructor(apiKey: string, model: string, maxTokens: number) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
    this.maxTokens = maxTokens;
  }

  async chat(
    messages: Message[],
    tools: Tool[],
    onChunk: (chunk: StreamChunk) => void
  ): Promise<Message> {
    const openaiMessages = this.convertMessages(messages);
    const openaiTools = this.convertTools(tools);

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: openaiMessages,
      tools: openaiTools.length > 0 ? openaiTools : undefined,
      stream: true,
    });

    let fullText = '';
    const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();

    for await (const chunk of response) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        fullText += delta.content;
        onChunk({ type: 'text', content: delta.content });
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!toolCalls.has(tc.index)) {
            toolCalls.set(tc.index, {
              id: tc.id || '',
              name: tc.function?.name || '',
              arguments: '',
            });
          }
          const existing = toolCalls.get(tc.index)!;
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name = tc.function.name;
          if (tc.function?.arguments) existing.arguments += tc.function.arguments;
        }
      }

      if (chunk.choices[0]?.finish_reason) {
        // Process completed tool calls
        for (const [, tc] of toolCalls) {
          try {
            const args = JSON.parse(tc.arguments || '{}');
            const toolCall: ToolCall = {
              id: tc.id,
              name: tc.name,
              arguments: args,
            };
            onChunk({ type: 'tool_use', toolCall });
          } catch {
            // Invalid JSON, skip
          }
        }
        onChunk({ type: 'done' });
      }
    }

    const resultToolCalls: ToolCall[] = [];
    for (const [, tc] of toolCalls) {
      try {
        resultToolCalls.push({
          id: tc.id,
          name: tc.name,
          arguments: JSON.parse(tc.arguments || '{}'),
        });
      } catch {
        // Skip invalid
      }
    }

    return {
      role: 'assistant',
      content: fullText,
      toolCalls: resultToolCalls.length > 0 ? resultToolCalls : undefined,
    };
  }

  private convertMessages(messages: Message[]): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: getSystemPrompt(),
      },
    ];

    for (const msg of messages) {
      if (msg.role === 'system') continue;

      if (msg.role === 'user') {
        if (msg.toolResults && msg.toolResults.length > 0) {
          // Tool results
          for (const tr of msg.toolResults) {
            result.push({
              role: 'tool',
              tool_call_id: tr.toolCallId,
              content: tr.content,
            });
          }
        } else {
          result.push({
            role: 'user',
            content: msg.content,
          });
        }
      } else if (msg.role === 'assistant') {
        const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = {
          role: 'assistant',
          content: msg.content || null,
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

  private convertTools(tools: Tool[]): OpenAI.ChatCompletionTool[] {
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
