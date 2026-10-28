import { redactValue } from './redact';
/**
 * Structured logging. One JSON line per event in production so log drains can
 * index by event name and fields; readable lines in development. Errors are
 * flattened to name/message/stack because JSON.stringify drops them otherwise.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

const pretty = process.env.NODE_ENV !== 'production';

function serialize(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack?.split('\n').slice(0, 6).join('\n') };
  }
  return value;
}

function write(level: Level, event: string, fields: Fields = {}) {
  fields = redactValue(fields) as Fields;
  const entry: Fields = { level, event, at: new Date().toISOString() };
  for (const [k, v] of Object.entries(fields)) entry[k] = serialize(v);

  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (pretty) {
    const rest = Object.entries(fields)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(serialize(v))}`)
      .join(' ');
    sink(`[${level}] ${event}${rest ? ` ${rest}` : ''}`);
  } else {
    sink(JSON.stringify(entry));
  }
}

export const logger = {
  debug: (event: string, fields?: Fields) => { if (pretty) write('debug', event, fields); },
  info: (event: string, fields?: Fields) => write('info', event, fields),
  warn: (event: string, fields?: Fields) => write('warn', event, fields),
  error: (event: string, fields?: Fields) => write('error', event, fields),
};
