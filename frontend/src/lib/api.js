/**
 * Shared JSON fetch helper. Throws on non-2xx responses with the error message
 * from the response body when available.
 *
 * @param {string} path
 * @param {RequestInit} [options]
 * @returns {Promise<any>}
 */
export async function fetchJson(path, options = {}) {
  const response = await fetch(path, options);
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${text}`);
      throw new Error(`Invalid JSON from ${path}`);
    }
  }
  if (!response.ok) {
    const message = data?.error ?? `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

/**
 * Download a Blob as a file attachment.
 *
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

/**
 * Parse a Content-Disposition header value to extract a filename.
 *
 * @param {string | null} headerValue
 * @param {string} fallback
 * @returns {string}
 */
export function filenameFromContentDisposition(headerValue, fallback) {
  if (typeof headerValue !== 'string' || headerValue.trim() === '') return fallback;

  const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const simpleMatch = headerValue.match(/filename="?([^\";]+)"?/i);
  if (simpleMatch?.[1]) return simpleMatch[1];

  return fallback;
}
