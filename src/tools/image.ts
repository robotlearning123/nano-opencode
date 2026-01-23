/**
 * Image Tool - read local images and return base64 for visual analysis
 *
 * Returns a special JSON format that the CLI can detect and convert
 * to multimodal content before sending to the LLM.
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { extname, resolve, basename } from 'path';
import type { Tool } from '../types.js';

// Supported image types
const IMAGE_EXTENSIONS: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

// Max image size: 5MB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

// Magic marker for CLI to detect image results
export const IMAGE_RESULT_MARKER = '__NANO_IMAGE__';

export const imageTool: Tool = {
  name: 'read_image',
  description:
    'Read a local image file for visual analysis. Supports PNG, JPEG, GIF, WebP. Use to analyze screenshots, diagrams, UI mockups, charts, or any visual content.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the image file (absolute or relative)',
      },
    },
    required: ['path'],
  },
  execute: async (args) => {
    const inputPath = args.path as string;

    if (!inputPath) {
      return 'Error: Image path is required';
    }

    const imagePath = resolve(process.cwd(), inputPath);

    if (!existsSync(imagePath)) {
      return `Error: Image not found: ${imagePath}`;
    }

    const ext = extname(imagePath).toLowerCase();
    const mediaType = IMAGE_EXTENSIONS[ext];
    if (!mediaType) {
      return `Error: Unsupported format "${ext}". Use: ${Object.keys(IMAGE_EXTENSIONS).join(', ')}`;
    }

    const stats = statSync(imagePath);
    if (stats.size > MAX_IMAGE_SIZE) {
      return `Error: Image too large (${(stats.size / 1024 / 1024).toFixed(1)}MB). Max: 5MB`;
    }

    try {
      const imageBuffer = readFileSync(imagePath);
      const base64Data = imageBuffer.toString('base64');
      const sizeKB = (stats.size / 1024).toFixed(1);

      // Return structured data with marker for CLI detection
      return `${IMAGE_RESULT_MARKER}
{
  "type": "image",
  "media_type": "${mediaType}",
  "data": "${base64Data}",
  "path": "${imagePath}",
  "name": "${basename(imagePath)}",
  "size": "${sizeKB}KB"
}`;
    } catch (error) {
      return `Error reading image: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
};
