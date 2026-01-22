/**
 * WebFetch Tool - fetch web content
 */

import type { Tool } from '../types.js';

// Simple HTML to text converter
function htmlToText(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Replace common tags with newlines
  text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr)[^>]*>/gi, '\n');

  // Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode common HTML entities
  text = text.replace(/&nbsp;/gi, ' ');
  text = text.replace(/&amp;/gi, '&');
  text = text.replace(/&lt;/gi, '<');
  text = text.replace(/&gt;/gi, '>');
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#39;/gi, "'");

  // Clean up whitespace
  text = text.replace(/\s+/g, ' ');
  text = text.replace(/\n\s*\n/g, '\n\n');

  return text.trim();
}

export const webfetchTool: Tool = {
  name: 'webfetch',
  description: 'Fetch content from a URL. Returns text content (HTML is converted to plain text).',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch',
      },
      maxLength: {
        type: 'number',
        description: 'Maximum content length (default: 50000)',
      },
    },
    required: ['url'],
  },
  execute: async (args) => {
    const url = args.url as string;
    const maxLength = (args.maxLength as number) || 50000;

    try {
      // Validate URL
      const parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return `Error: Only HTTP and HTTPS URLs are supported`;
      }

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'nano-opencode/1.0',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
        },
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!response.ok) {
        return `Error: HTTP ${response.status} ${response.statusText}`;
      }

      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();

      let content: string;
      if (contentType.includes('text/html')) {
        content = htmlToText(text);
      } else {
        content = text;
      }

      // Truncate if needed
      if (content.length > maxLength) {
        content =
          content.slice(0, maxLength) +
          `\n\n... [Truncated: ${content.length - maxLength} characters omitted]`;
      }

      return content;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return 'Error: Request timed out (30s)';
        }
        return `Error: ${error.message}`;
      }
      return 'Error: Failed to fetch URL';
    }
  },
};
