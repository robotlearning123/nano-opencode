import {
  GoogleGenerativeAI,
  SchemaType,
  type Content,
  type Part,
  type FunctionCall,
  type FunctionDeclaration,
} from '@google/generative-ai';
import type { LLMProvider, Message, Tool, StreamChunk, ToolCall } from '../types.js';
import { getSystemPrompt } from '../constants.js';

export class GeminiProvider implements LLMProvider {
  name = 'gemini';
  private client: GoogleGenerativeAI;
  private model: string;
  private maxTokens: number;

  constructor(apiKey: string, model: string, maxTokens: number) {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
    this.maxTokens = maxTokens;
  }

  async chat(
    messages: Message[],
    tools: Tool[],
    onChunk: (chunk: StreamChunk) => void,
    systemPrompt?: string
  ): Promise<Message> {
    const geminiContents = this.convertMessages(messages);
    const geminiTools = this.convertTools(tools);

    const generativeModel = this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: systemPrompt ?? getSystemPrompt(),
      tools: geminiTools.length > 0 ? [{ functionDeclarations: geminiTools }] : undefined,
    });

    const chat = generativeModel.startChat({
      history: geminiContents.slice(0, -1),
      generationConfig: {
        maxOutputTokens: this.maxTokens,
      },
    });

    // Get the last message content to send
    const lastContent = geminiContents[geminiContents.length - 1];
    const lastParts = lastContent?.parts || [{ text: '' }];

    const result = await chat.sendMessageStream(lastParts);

    let fullText = '';
    const toolCalls: ToolCall[] = [];

    for await (const chunk of result.stream) {
      const candidate = chunk.candidates?.[0];
      if (!candidate?.content?.parts) continue;

      for (const part of candidate.content.parts) {
        if ('text' in part && part.text) {
          fullText += part.text;
          onChunk({ type: 'text', content: part.text });
        } else if ('functionCall' in part && part.functionCall) {
          const fc = part.functionCall as FunctionCall;
          const toolCall: ToolCall = {
            id: `gemini_${Date.now()}_${toolCalls.length}`,
            name: fc.name,
            arguments: fc.args as Record<string, unknown>,
          };
          toolCalls.push(toolCall);
          onChunk({ type: 'tool_use', toolCall });
        }
      }
    }

    onChunk({ type: 'done' });

    return {
      role: 'assistant',
      content: fullText,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  private convertMessages(messages: Message[]): Content[] {
    const contents: Content[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') continue;

      if (msg.role === 'user') {
        if (msg.toolResults && msg.toolResults.length > 0) {
          // Tool results in Gemini format
          const parts: Part[] = msg.toolResults.map((tr) => ({
            functionResponse: {
              name: tr.toolCallId.split('_')[0] || 'unknown',
              response: { content: tr.content },
            },
          }));
          contents.push({ role: 'user', parts });
        } else {
          contents.push({
            role: 'user',
            parts: [{ text: msg.content }],
          });
        }
      } else if (msg.role === 'assistant') {
        const parts: Part[] = [];

        if (msg.content) {
          parts.push({ text: msg.content });
        }

        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.arguments,
              },
            });
          }
        }

        if (parts.length > 0) {
          contents.push({ role: 'model', parts });
        }
      }
    }

    return contents;
  }

  private convertTools(tools: Tool[]): FunctionDeclaration[] {
    return tools.map((tool) => {
      const properties: Record<string, object> = {};
      for (const [key, value] of Object.entries(tool.parameters.properties)) {
        const prop: Record<string, unknown> = {
          type: this.mapType(value.type),
          description: value.description,
        };
        if (value.enum) {
          prop.enum = value.enum;
        }
        properties[key] = prop;
      }

      return {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: SchemaType.OBJECT,
          properties,
          required: tool.parameters.required,
        },
      } as FunctionDeclaration;
    });
  }

  private mapType(type: string): SchemaType {
    switch (type) {
      case 'string':
        return SchemaType.STRING;
      case 'number':
        return SchemaType.NUMBER;
      case 'integer':
        return SchemaType.INTEGER;
      case 'boolean':
        return SchemaType.BOOLEAN;
      case 'array':
        return SchemaType.ARRAY;
      case 'object':
        return SchemaType.OBJECT;
      default:
        return SchemaType.STRING;
    }
  }
}
