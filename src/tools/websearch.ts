/**
 * WebSearch Tool - search the web using DuckDuckGo
 * No API key required - uses the HTML interface
 */

import type { Tool } from '../types.js';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Parse search results from DuckDuckGo HTML response
 */
function parseSearchResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];

  // DuckDuckGo HTML format: result__a for links, result__snippet for descriptions
  const resultRegex =
    /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([^<]*)</g;

  let match;
  while ((match = resultRegex.exec(html)) && results.length < maxResults) {
    const [, rawUrl, title, snippet] = match;

    // DuckDuckGo wraps URLs in a redirect - extract the actual URL
    const urlMatch = rawUrl.match(/uddg=([^&]+)/);
    const url = urlMatch ? decodeURIComponent(urlMatch[1]) : rawUrl;

    if (url && title) {
      results.push({
        title: decodeHtmlEntities(title.trim()),
        url,
        snippet: decodeHtmlEntities(snippet?.trim() || ''),
      });
    }
  }

  // Fallback: simpler pattern if the above doesn't match
  if (results.length === 0) {
    const simpleRegex = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([^<]+)<\/a>/g;
    while ((match = simpleRegex.exec(html)) && results.length < maxResults) {
      const [, url, title] = match;
      if (!url.includes('duckduckgo.com') && title.length > 5) {
        results.push({
          title: decodeHtmlEntities(title.trim()),
          url,
          snippet: '',
        });
      }
    }
  }

  return results;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

export const webSearchTool: Tool = {
  name: 'web_search',
  description:
    'Search the web for current information. Returns titles, URLs, and snippets. Use for documentation, API references, or current events.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results (default: 5, max: 10)',
      },
    },
    required: ['query'],
  },
  execute: async (args) => {
    const query = args.query as string;
    const maxResults = Math.min((args.maxResults as number) || 5, 10);

    if (!query.trim()) {
      return 'Error: Search query is required';
    }

    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; nano-opencode/1.0)',
          Accept: 'text/html',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        return `Error: Search failed with HTTP ${response.status}`;
      }

      const html = await response.text();
      const results = parseSearchResults(html, maxResults);

      if (results.length === 0) {
        return `No results found for: "${query}"`;
      }

      const formatted = results
        .map((r, i) => {
          const lines = [`${i + 1}. ${r.title}`, `   URL: ${r.url}`];
          if (r.snippet) {
            lines.push(`   ${r.snippet}`);
          }
          return lines.join('\n');
        })
        .join('\n\n');

      return `Search results for "${query}":\n\n${formatted}`;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return 'Error: Search timed out (15s)';
        }
        return `Error: ${error.message}`;
      }
      return 'Error: Search failed';
    }
  },
};
