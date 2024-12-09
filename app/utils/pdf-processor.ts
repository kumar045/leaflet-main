import { PDFDocument } from 'pdf-lib';
import { Buffer } from 'buffer';

export async function* splitPDFIntoChunks(pdfBuffer: Buffer | ArrayBuffer, pagesPerChunk: number = 2): AsyncGenerator<Buffer, void, unknown> {
  if (!Number.isInteger(pagesPerChunk) || pagesPerChunk < 1) {
    throw new Error('pagesPerChunk must be a positive integer');
  }

  const buffer = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
  const sourcePdf = await PDFDocument.load(buffer);
  const totalPages = sourcePdf.getPageCount();

  const numberOfChunks = Math.ceil(totalPages / pagesPerChunk);
  console.log(`Splitting ${totalPages} pages into ${numberOfChunks} chunks of ${pagesPerChunk} pages each`);

  for (let i = 0; i < totalPages; i += pagesPerChunk) {
    try {
      const chunkPdf = await PDFDocument.create();
      const endPage = Math.min(i + pagesPerChunk, totalPages);
      const pagesToCopy = Array.from({ length: endPage - i }, (_, index) => i + index);
      
      const copiedPages = await chunkPdf.copyPages(sourcePdf, pagesToCopy);
      copiedPages.forEach(page => chunkPdf.addPage(page));
      
      const chunkBytes = await chunkPdf.save();
      const chunkBuffer = Buffer.from(chunkBytes);
      
      console.log(`Created chunk with pages ${i + 1} to ${endPage}`);
      yield chunkBuffer;
    } catch (error) {
      console.error(`Error processing chunk at page ${i}:`, error);
      // Consider adding more detailed error handling or reporting here
    }
  }
}

