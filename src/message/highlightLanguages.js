import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import markdown from 'highlight.js/lib/languages/markdown';
import yaml from 'highlight.js/lib/languages/yaml';
import diff from 'highlight.js/lib/languages/diff';
import java from 'highlight.js/lib/languages/java';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import php from 'highlight.js/lib/languages/php';
import ruby from 'highlight.js/lib/languages/ruby';
import swift from 'highlight.js/lib/languages/swift';
import kotlin from 'highlight.js/lib/languages/kotlin';

/**
 * Grammars registered with the highlighter.
 *
 * A deliberate subset rather than highlight.js's full catalogue: bundling every
 * language would roughly triple the client chunk for grammars a chat assistant
 * almost never renders. Each grammar carries its own aliases, so `js`, `jsx`,
 * `ts` and friends resolve without extra entries here.
 *
 * An unregistered language is not an error — the code block renders as plain
 * monospaced text with its language label intact.
 */
export const HIGHLIGHT_LANGUAGES = {
  javascript,
  typescript,
  xml,
  css,
  json,
  bash,
  python,
  sql,
  markdown,
  yaml,
  diff,
  java,
  cpp,
  csharp,
  go,
  rust,
  php,
  ruby,
  swift,
  kotlin,
};