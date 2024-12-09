import { PDFDocument } from 'pdf-lib';
import { Buffer } from 'buffer';

export async function splitPDFIntoChunks(pdfBuffer: Buffer | ArrayBuffer, pagesPerChunk: number = 2) {
  const buffer = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
  const sourcePdf = await PDFDocument.load(buffer);
  const totalPages = sourcePdf.getPageCount();
  const chunks: Buffer[] = [];

  const numberOfChunks = Math.ceil(totalPages / pagesPerChunk);
  console.log(`Splitting ${totalPages} pages into ${numberOfChunks} chunks of ${pagesPerChunk} pages each`);

  for (let i = 0; i < totalPages; i += pagesPerChunk) {
    try {
      const chunkPdf = await PDFDocument.create();
      const endPage = Math.min(i + pagesPerChunk, totalPages);
      const pagesToCopy = sourcePdf.getPages().slice(i, endPage);
      const copiedPages = await chunkPdf.copyPages(sourcePdf, 
        Array.from({ length: endPage - i }, (_, index) => i + index)
      );
      
      copiedPages.forEach(page => chunkPdf.addPage(page));
      const chunkBytes = await chunkPdf.save();
      chunks.push(Buffer.from(chunkBytes));
      
      console.log(`Created chunk ${chunks.length} with pages ${i + 1} to ${endPage}`);
    } catch (error) {
      console.error(`Error processing chunk at page ${i}:`, error);
      continue;
    }
  }

  return chunks;
} 