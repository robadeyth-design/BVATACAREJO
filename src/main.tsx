import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Root Monkeypatch to secure any JSON.stringify operation in the App lifecycle
const nativeStringify = JSON.stringify;
JSON.stringify = function (val: any, replacer?: any, space?: any): string {
  const seen = new Set<any>();

  function safeReplacer(this: any, key: string, value: any) {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'object') {
      // Circular reference interception
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);

      // Handle custom Firestore Timestamp structures
      if (typeof value.toDate === 'function') {
        try {
          return value.toDate().toISOString();
        } catch (e) {
          // ignore and keep going
        }
      }
      if (typeof value.seconds === 'number' && typeof value.nanoseconds === 'number') {
        try {
          return new Date(value.seconds * 1000).toISOString();
        } catch (e) {
          // ignore and keep going
        }
      }

      // Handle Firestore DocumentReferences from leaking internal DB connectors
      if (typeof value.path === 'string' && value.id && value.firestore) {
        return `_ref:${value.path}`;
      }

      // Handle DOM Nodes and window Event elements
      if (typeof Node !== 'undefined' && value instanceof Node) {
        return `[HTMLElement: ${value.nodeName}]`;
      }
      if (typeof Event !== 'undefined' && value instanceof Event) {
        return `[Event: ${value.type || 'unknown'}]`;
      }
      if (typeof EventTarget !== 'undefined' && value instanceof EventTarget) {
        return `[EventTarget]`;
      }
    }

    if (replacer) {
      return replacer.call(this, key, value);
    }
    return value;
  }

  try {
    return nativeStringify(val, safeReplacer, space);
  } catch (err) {
    console.warn("Global safe JSON.stringify failed, using backup representation:", err);
    try {
      return nativeStringify(String(val));
    } catch (_) {
      return '"[Serialization Error]"';
    }
  }
} as any;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
