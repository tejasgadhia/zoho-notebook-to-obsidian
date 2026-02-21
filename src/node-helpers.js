/**
 * Pure helpers for working with htmlparser2/domhandler nodes
 * without cheerio wrappers.
 */

/**
 * Get an attribute value from a node.
 * @param {object} node - htmlparser2 node
 * @param {string} key - attribute name
 * @returns {string|undefined}
 */
export function getAttr(node, key) {
  return node.attribs?.[key];
}

/**
 * Recursively collect all text content from a node.
 * Handles tag nodes, text nodes, and root nodes.
 * @param {object} node - htmlparser2 node
 * @returns {string}
 */
export function getText(node) {
  if (node.type === 'text') return node.data || '';
  if (node.type === 'tag' || node.type === 'root') {
    let result = '';
    for (const child of node.children || []) {
      result += getText(child);
    }
    return result;
  }
  return '';
}

/**
 * Depth-first search for descendant elements with a given tag name.
 * @param {object} node - htmlparser2 node
 * @param {string} tagName - lowercase tag name to find
 * @returns {object[]} array of matching nodes
 */
export function findByTag(node, tagName) {
  const results = [];
  const stack = [...(node.children || [])];
  while (stack.length > 0) {
    const current = stack.shift();
    if (current.type === 'tag' && current.tagName?.toLowerCase() === tagName) {
      results.push(current);
    }
    if (current.children) {
      stack.unshift(...current.children);
    }
  }
  return results;
}
