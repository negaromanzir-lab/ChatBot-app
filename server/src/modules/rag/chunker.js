const DOCUMENT_MARKER = /^(\[Page (\d+)\]|#{1,6}\s+(.+))$/gm;

function locationAt(markers, end) {
  let heading = null;
  let page = null;
  for (const marker of markers) {
    if (marker.index > end) break;
    if (marker[2]) page = Number(marker[2]);
    if (marker[3]) heading = marker[3].trim();
  }
  return { pageNumber: page, sectionTitle: heading };
}

export function chunkDocument(text, { chunkSize = 1200, chunkOverlap = 200 } = {}) {
  if (typeof text !== 'string' || !text.trim()) return [];
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new RangeError('chunkSize must be a positive integer.');
  }
  if (!Number.isInteger(chunkOverlap) || chunkOverlap < 0 || chunkOverlap >= chunkSize) {
    throw new RangeError('chunkOverlap must be a non-negative integer smaller than chunkSize.');
  }

  const markers = [...text.matchAll(DOCUMENT_MARKER)];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const targetEnd = Math.min(start + chunkSize, text.length);
    let end = targetEnd;
    if (targetEnd < text.length) {
      const minimumBoundary = start + Math.floor(chunkSize * 0.7);
      const paragraphBoundary = text.lastIndexOf('\n', targetEnd);
      const wordBoundary = text.lastIndexOf(' ', targetEnd);
      const boundary = Math.max(paragraphBoundary, wordBoundary);
      if (boundary >= minimumBoundary) end = boundary;
    }

    const content = text.slice(start, end).trim();
    if (content) {
      chunks.push({
        chunkIndex: chunks.length,
        content,
        startOffset: start,
        endOffset: end,
        ...locationAt(markers, end),
      });
    }
    if (end >= text.length) break;
    start = Math.max(start + 1, end - chunkOverlap);
  }
  return chunks;
}

export default chunkDocument;
