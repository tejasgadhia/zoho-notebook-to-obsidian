/**
 * Shared utilities for filename normalization.
 */

export function normalizeFilename(filename) {
  return filename.replace(/\u202f/g, ' ').replace(/\u00a0/g, ' ');
}
