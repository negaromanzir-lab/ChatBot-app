import { memo } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { CodeBlock } from './CodeBlock.jsx';
import { HIGHLIGHT_LANGUAGES } from './highlightLanguages.js';
import './MarkdownContent.css';

/**
 * Renders an assistant message as Markdown.
 *
 * Two decisions worth stating:
 *
 * 1. Raw HTML is not enabled. react-markdown escapes it unless `rehype-raw` is
 *    added, and adding it would let a model response inject markup into the
 *    page. Markup the assistant "wants" is ignored; Markdown still renders.
 * 2. Links are checked by `defaultUrlTransform`, which strips `javascript:` and
 *    other unsafe schemes, and `rel="noopener noreferrer"` is forced on anything
 *    that opens a new tab.
 */

/**
 * Reads plain text back out of a hast node.
 *
 * The highlighter runs before rendering, so a code node's children are spans
 * carrying `hljs-*` classes rather than a single string. Walking the tree is the
 * only way to recover the original text for the copy button — and it works
 * identically whether or not highlighting matched the language.
 */
function extractText(node) {
  if (!node) return '';
  if (node.type === 'text') return node.value;
  if (Array.isArray(node.children)) return node.children.map(extractText).join('');
  return '';
}

/** hast stores `className` as an array, but tolerate the plain-string form too. */
function readClassName(properties) {
  const value = properties?.className;
  if (Array.isArray(value)) return value.join(' ');
  return typeof value === 'string' ? value : '';
}

function MarkdownBlock({ node }) {
  const codeNode = node?.children?.[0];
  const language = /language-([\w+#.-]+)/.exec(readClassName(codeNode?.properties))?.[1] ?? '';

  return <CodeBlock language={language} code={extractText(codeNode).replace(/\n$/, '')} />;
}

/** Wide tables need their own scroll container or they break the layout. */
function Table({ children, ...rest }) {
  return (
    <div className="markdown__table-scroll">
      <table {...rest}>{children}</table>
    </div>
  );
}

const COMPONENTS = {
  // Returning CodeBlock here means the inner `code` override is never reached,
  // so it only ever applies to inline code.
  pre: MarkdownBlock,
  code({ className, children, ...rest }) {
    return (
      <code className={className ? undefined : 'markdown__inline-code'} {...rest}>
        {children}
      </code>
    );
  },
  a({ children, ...rest }) {
    return (
      <a {...rest} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
  table: Table,
};

/**
 * Memoised on content alone: re-running the Markdown pipeline and the syntax
 * highlighter for an unchanged message would be wasted work on every render of
 * the list.
 */
export const MarkdownContent = memo(function MarkdownContent({ content }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, languages: HIGHLIGHT_LANGUAGES }]]}
        urlTransform={defaultUrlTransform}
        components={COMPONENTS}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

export default MarkdownContent;