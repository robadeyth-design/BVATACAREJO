/**
 * Utility functions for safe JSON serialization and parsing.
 * Specifically designed to handle circular structures, native Firestore classes
 * (like Timestamps and DocumentReferences) without throwing exceptions.
 */

export function safeJsonStringify(val: any): string {
  const seen = new Set<any>();

  function replacer(_key: string, value: any) {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'object') {
      // 1. Handle circular reference
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);

      // 2. Handle Firestore Timestamp (check by object shape or explicit toDate function)
      if (typeof value.toDate === 'function') {
        try {
          return value.toDate().toISOString();
        } catch (e) {
          // Fallback to standard object parsing
        }
      }
      if (typeof value.seconds === 'number' && typeof value.nanoseconds === 'number') {
        try {
          return new Date(value.seconds * 1000).toISOString();
        } catch (e) {
          // Fallback
        }
      }

      // 3. Handle Firestore DocumentReference (contains path string and internal connection states)
      if (typeof value.path === 'string' && value.id && value.firestore) {
        return `_ref:${value.path}`;
      }

      // 4. Handle standard HTML Elements/Nodes often found in events (highly circular)
      if (value instanceof Node) {
        return `[HTMLElement: ${value.nodeName}]`;
      }
      if (value instanceof Event) {
        return `[Event: ${value.type || 'unknown'}]`;
      }
      if (typeof EventTarget !== 'undefined' && value instanceof EventTarget) {
        return `[EventTarget]`;
      }
    }

    return value;
  }

  try {
    return JSON.stringify(val, replacer);
  } catch (err) {
    console.warn("safeJsonStringify fallback triggered due to error: ", err);
    try {
      // Ultimate absolute fallback
      return JSON.stringify(String(val));
    } catch (_) {
      return '"[Serialization Error]"';
    }
  }
}

export function safeJsonParse<T>(str: string | null, defaultValue: T): T {
  if (!str) return defaultValue;
  try {
    return JSON.parse(str) as T;
  } catch (e) {
    console.warn("Failed to parse JSON string, returning default value:", e);
    return defaultValue;
  }
}
