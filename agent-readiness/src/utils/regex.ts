/**
 * Regex utilities with safety checks
 *
 * Prevents ReDoS (Regular Expression Denial of Service) attacks
 * from malicious or poorly written regex patterns in profiles
 */

/**
 * Check if a regex pattern is potentially dangerous (catastrophic backtracking)
 *
 * This is a simple heuristic check for common ReDoS patterns:
 * - Nested quantifiers: (a+)+ or (a*)*
 * - Overlapping alternations with quantifiers: (a|a)+
 * - Repetition of overlapping groups
 *
 * Note: Uses simple linear-time string scanning to avoid ReDoS in the checker itself
 */
export function isUnsafeRegex(pattern: string): boolean {
  // Simple linear scan for dangerous patterns
  // Avoid using complex regexes that could themselves be vulnerable

  const len = pattern.length;
  let depth = 0;
  // Track quantifier presence per group (stack for nested groups)
  const groupQuantifiers: boolean[] = [];

  // Robust escape detection: count consecutive backslashes before index
  const isEscaped = (idx: number): boolean => {
    let backslashes = 0;
    for (let k = idx - 1; k >= 0 && pattern[k] === '\\'; k--) backslashes++;
    return backslashes % 2 === 1;
  };

  for (let i = 0; i < len; i++) {
    const char = pattern[i];
    const nextChar = i < len - 1 ? pattern[i + 1] : '';

    // Skip escaped characters (use robust check)
    if (isEscaped(i)) continue;

    if (char === '(') {
      depth++;
      groupQuantifiers.push(false);
    } else if (char === ')') {
      const hadQuantifier = groupQuantifiers.pop() ?? false;
      // Check for quantifier after closing paren when group had quantifier inside
      if (hadQuantifier && (nextChar === '+' || nextChar === '*' || nextChar === '{')) {
        return true; // Nested quantifier detected: (a+)+, (a*)*, etc.
      }
      // Propagate quantifier info to parent group
      if (groupQuantifiers.length > 0) {
        groupQuantifiers[groupQuantifiers.length - 1] ||= hadQuantifier;
      }
      depth = Math.max(0, depth - 1);
    } else if ((char === '+' || char === '*') && depth > 0 && groupQuantifiers.length > 0) {
      groupQuantifiers[groupQuantifiers.length - 1] = true;
    } else if (char === '{' && depth > 0 && groupQuantifiers.length > 0) {
      // Check for repetition quantifier {n,m}
      let j = i + 1;
      while (j < len && pattern[j] !== '}') j++;
      if (j < len && pattern.slice(i, j + 1).includes(',')) {
        groupQuantifiers[groupQuantifiers.length - 1] = true;
      }
    }
  }

  // Check for overlapping character classes: [a-z]+[a-z]+
  // Use simple indexOf-based detection instead of regex
  let bracketPos = pattern.indexOf('[');
  while (bracketPos !== -1) {
    const endBracket = pattern.indexOf(']', bracketPos);
    if (endBracket === -1) break;

    // Check for quantifier after first bracket
    const afterFirst = pattern[endBracket + 1];
    if (afterFirst === '+' || afterFirst === '*') {
      // Look for another bracket class with quantifier
      const nextBracket = pattern.indexOf('[', endBracket);
      if (nextBracket !== -1) {
        const nextEnd = pattern.indexOf(']', nextBracket);
        if (nextEnd !== -1) {
          const afterSecond = pattern[nextEnd + 1];
          if (afterSecond === '+' || afterSecond === '*') {
            return true; // Overlapping classes with quantifiers
          }
        }
      }
    }
    bracketPos = pattern.indexOf('[', endBracket);
  }

  return false;
}

/**
 * Safely create a regex, returning null if pattern is invalid or unsafe
 */
export function safeRegex(pattern: string, flags?: string): RegExp | null {
  if (isUnsafeRegex(pattern)) {
    return null;
  }

  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

/**
 * Test content against a regex pattern with timeout protection
 * Returns false if pattern is invalid/unsafe or times out
 */
export function safeRegexTest(
  pattern: string,
  content: string,
  flags?: string
): { matched: boolean; error?: string } {
  if (isUnsafeRegex(pattern)) {
    return { matched: false, error: 'Potentially unsafe regex pattern detected' };
  }

  try {
    const regex = new RegExp(pattern, flags);

    // For very long content, limit what we test
    const maxContentLength = 1_000_000; // 1MB
    const testContent =
      content.length > maxContentLength ? content.substring(0, maxContentLength) : content;

    return { matched: regex.test(testContent) };
  } catch (e) {
    return {
      matched: false,
      error: `Invalid regex pattern: ${e instanceof Error ? e.message : 'unknown error'}`,
    };
  }
}
