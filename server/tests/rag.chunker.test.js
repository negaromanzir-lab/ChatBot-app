import { describe, expect, it } from 'vitest';
import { chunkDocument } from '../src/modules/rag/chunker.js';

describe('document chunker', () => {
  it('keeps chunks bounded and overlaps adjacent chunks', () => {
    const text = 'alpha '.repeat(30);
    const chunks = chunkDocument(text, { chunkSize: 40, chunkOverlap: 8 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every(({ content }) => content.length <= 40)).toBe(true);
    expect(chunks[1].startOffset).toBeLessThan(chunks[0].endOffset);
  });

  it('preserves Markdown section and extracted PDF page references', () => {
    const chunks = chunkDocument(
      '# Introduction\nFirst facts.\n[Page 4]\nImportant detail.',
      { chunkSize: 200, chunkOverlap: 20 },
    );

    expect(chunks).toEqual([
      expect.objectContaining({
        sectionTitle: 'Introduction',
        pageNumber: 4,
        content: expect.stringContaining('Important detail.'),
      }),
    ]);
  });

  it('rejects invalid overlap instead of looping indefinitely', () => {
    expect(() => chunkDocument('some text', {
      chunkSize: 20,
      chunkOverlap: 20,
    })).toThrow(/smaller than chunkSize/i);
  });
});
