import { splitPDFIntoChunks } from '@/app/utils/pdf-processor';
import { openai } from "@/app/openai";
import { NextResponse } from "next/server";
import { Buffer } from 'buffer';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import { PDFDocument } from 'pdf-lib';

const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;

// Single set of instructions
const ASSISTANT_INSTRUCTIONS = `Verfasse Anweisungen zu pharmazeutischen und medizinischen Themen in einfacher, klarer Sprache, die für Personen mit eingeschränkter Gesundheitskompetenz leicht verständlich ist. Vermeide Fachjargon. Verwende klare und zugängliche Sprache, die dem Leseverständnis eines 12-Jährigen entspricht.

Halte dich genau an die beschriebenen Ziele und achte auf die folgenden Bereiche:

Textebene: Nur notwendige Inhalte, verständlicher Stil.
Textstruktur: Logische Abschnitte, wichtige Informationen am Anfang.
Satzebene: Kurze Sätze, aktive Sprache.
Wortebene: Allgemein verständliche Wörter, einfache Begriffe.
Ansprache und Ton: Direkte Ansprache mit “Sie”, freundlicher und klarer Ton.
Besondere Hinweise für medizinische Texte: Patientengerechte Erklärungen.
Schritte
Schritt-für-Schritt-Anleitung: Teile komplexe Inhalte in einfache, klare Einzelschritte.
TextanalyseLies den Text vollständig, erkenne zentrale medizinische Inhalte und Identifiziere komplexe Begriffe oder Satzkonstruktionen.
Vereinfachen des TextesTeile den Text in kürzere Absätze, betone wichtige Informationen und vereinfache die Sprache.
Behalte kritische Informationen wie Dosierung und Nebenwirkungen vollständig bei.
Vereinfachen, aber vollständig halten: Keine wichtigen Informationen dürfen verloren gehen, selbst wenn der Text stark vereinfacht wird.
Keine Mehrdeutigkeiten: Sorge dafür, dass jede Aussage klar und eindeutig ist.
Einfaches Vokabular verwenden: Verwende keine spezifischen, medizinischen Fachbegriffe. Ersetze sie durch allgemein bekannte Begriffe.
Prüfen und ÜberarbeitenLies den Text mehrmals, um sicherzustellen, dass alle wichtigen Informationen erhalten und leicht verständlich sind.
Überprüfe, ob die Wortwahl konsistent und leicht verständlich ist.
Verwende die hochgeladene Datei Anleitung zur Vereinfachung.txt

Ausgabeformat
Der finale Text soll in einfachem Deutsch verfasst werden und kurze, leicht verständliche Sätze enthalten.
Gliedere Anweisungen in nummerierte oder gepunktete Listen und präsentiere sie in einer logischen Reihenfolge, sodass die Leser den Anweisungen klar folgen können
Versichere dich, dass der Text vollständig, ohne unnötige Details, und gleichzeitig auch ausführlich genug ist, um alle relevanten Informationen bereitzustellen.
Der vereinfachte Text sollte im selben Format wie der ursprüngliche Text dargestellt sein.
Hinweise
Vermeide Negationen, schreibe in aktiver Sprache, und benutze möglichst konkrete Zeitformen.
Erläutere Fachbegriffe als erläuternde Erklärungen in Klammern, falls sie unbedingt notwendig sind.
Auch sorgfältig darauf achten, dass keine Information fehlen darf, die grundlegend zum Verständnis wäre.
Wandle den Text vollständig in einfache Sprache. Lasse auf keinen Fall Informationen weg`;

// Helper function to get or create vector store
async function getOrCreateVectorStore() {
  if (!ASSISTANT_ID) {
    throw new Error('OPENAI_ASSISTANT_ID is not set');
  }

  const assistant = await openai.beta.assistants.retrieve(ASSISTANT_ID);

  // Check if vector store already exists
  if (assistant.tool_resources?.file_search?.vector_store_ids?.length > 0) {
    return assistant.tool_resources.file_search.vector_store_ids[0];
  }

  // Create new vector store if none exists
  const vectorStore = await openai.beta.vectorStores.create({
    name: "medical-documents-vector-store"
  });

  // Update assistant with new vector store
  await openai.beta.assistants.update(ASSISTANT_ID, {
    tools: [{ type: "file_search" }],
    tool_resources: {
      file_search: {
        vector_store_ids: [vectorStore.id],
      },
    },
  });

  return vectorStore.id;
}

// Helper function to safely delete file from vector store
async function removeFromVectorStore(vectorStoreId: string, fileId: string) {
  try {
    // First check if file exists in vector store
    try {
      await openai.beta.vectorStores.files.retrieve(vectorStoreId, fileId);
    } catch {
      console.log(`File ${fileId} not found in vector store`);
      return true;
    }

    await openai.beta.vectorStores.files.del(vectorStoreId, fileId);
    console.log(`Removed file ${fileId} from vector store`);
    return true;
  } catch (error) {
    console.warn(`Vector store removal failed for ${fileId}:`, error);
    return false;
  }
}

// Helper function to safely delete file from OpenAI
async function removeFromOpenAI(fileId: string) {
  try {
    // First update assistant to remove file
    try {
      const assistant = await openai.beta.assistants.retrieve(ASSISTANT_ID!);
      const currentFiles = assistant.file_ids || [];
      const updatedFiles = currentFiles.filter(id => id !== fileId);
      
      await openai.beta.assistants.update(ASSISTANT_ID!, {
        tools: [{ type: "file_search" }],
        file_ids: updatedFiles
      } as any);
      console.log(`Removed file ${fileId} from assistant`);
    } catch (assistantError) {
      console.warn(`Failed to update assistant:`, assistantError);
    }

    // Then delete the file
    try {
      await openai.files.retrieve(fileId); // Check if file exists
      await openai.files.del(fileId);
      console.log(`Deleted file ${fileId} from OpenAI`);
    } catch (error) {
      console.log(`File ${fileId} already deleted from OpenAI`);
    }
    return true;
  } catch (error) {
    console.warn(`OpenAI file deletion failed for ${fileId}:`, error);
    return false;
  }
}

// Updated safe delete function
async function safelyDeleteFile(vectorStoreId: string, fileId: string) {
  try {
    // First remove from vector store
    await removeFromVectorStore(vectorStoreId, fileId);
    
    // Then remove from assistant and delete file
    await removeFromOpenAI(fileId);
  } catch (error) {
    console.warn(`Deletion process failed for ${fileId}:`, error);
  }
}

export async function POST(request: Request) {
  let currentThread = null;
  let vectorStoreId = null;
  let fileUploads = [];
  let currentFileUpload = null;
  
  try {
    vectorStoreId = await getOrCreateVectorStore();
    console.log(`Using vector store: ${vectorStoreId}`);

    const formData = await request.formData();
    const file = formData.get('file');
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const uploadDir = path.join('/tmp', 'uploads');
if (!existsSync(uploadDir)) {
  await mkdir(uploadDir, { recursive: true });
}


    const originalName = (file as File).name.replace('.pdf', '');
    console.log(`Processing file: ${originalName}`);
    
    const bytes = await (file as Blob).arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Get total pages from the PDF
    const sourcePdf = await PDFDocument.load(buffer);
    const totalPages = sourcePdf.getPageCount();
    
    // Split into chunks of 2 pages each
    const pdfChunks = await splitPDFIntoChunks(buffer, 2);
    console.log(`Split into ${pdfChunks.length} chunks (2 pages each)`);
    
    let combinedResponse = '';
    const savedFiles = [];
    
    // Create thread for conversation
    currentThread = await openai.beta.threads.create();
    console.log(`Created thread: ${currentThread.id}`);
    
    // Process each chunk
    for (let i = 0; i < pdfChunks.length; i++) {
      const chunk = pdfChunks[i];
      const startPage = i * 2 + 1;
      const endPage = Math.min(startPage + 1, totalPages);
      const chunkFileName = `${originalName}_pages${startPage}-${endPage}.pdf`;
      const chunkPath = path.join(uploadDir, chunkFileName);
      
      try {
        // Save chunk locally
        await writeFile(chunkPath, chunk);
        savedFiles.push(chunkFileName);

        // Upload to OpenAI
        const uploadFormData = new FormData();
        uploadFormData.append('file', new Blob([chunk], { type: 'application/pdf' }), chunkFileName);
        uploadFormData.append('purpose', 'assistants');

        currentFileUpload = await openai.files.create({
          file: uploadFormData.get('file') as any,
          purpose: 'assistants'
        });
        fileUploads.push(currentFileUpload.id);
        console.log(`Uploaded pages ${startPage}-${endPage} to OpenAI: ${currentFileUpload.id}`);

        // Add to vector store
        await openai.beta.vectorStores.files.create(vectorStoreId, {
          file_id: currentFileUpload.id,
        });

        // Update assistant with current file
        await openai.beta.assistants.update(ASSISTANT_ID!, {
          tools: [{ type: "file_search" }],
          file_ids: [currentFileUpload.id],
          model: "ft:gpt-4o-2024-08-06:health-concepts:clarifynow-001:AaMToKWY",
          instructions: ASSISTANT_INSTRUCTIONS
        } as any);

        // Create message with chunk info
        await openai.beta.threads.messages.create(currentThread.id, {
          role: 'user',
          content: `Simplify des medizinischen Dokuments.`
        });

        // Run assistant
        const run = await openai.beta.threads.runs.create(currentThread.id, {
          assistant_id: ASSISTANT_ID!
        });

        // Wait for completion
        let runStatus = await openai.beta.threads.runs.retrieve(currentThread.id, run.id);
        let attempts = 0;
        const maxAttempts = 120;

        while (runStatus.status !== 'completed' && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          runStatus = await openai.beta.threads.runs.retrieve(currentThread.id, run.id);
          
          if (attempts % 10 === 0) { // Log every 10 seconds
            console.log(`Processing chunk ${i + 1}/${pdfChunks.length}: ${runStatus.status} (${attempts}s)`);
          }
          
          if (runStatus.status === 'failed') {
            throw new Error('Processing failed');
          }
          attempts++;
        }

        // Clean up after processing
        if (currentFileUpload?.id) {
          await safelyDeleteFile(vectorStoreId!, currentFileUpload.id);
        }

      } catch (chunkError) {
        console.error(`Error processing pages ${startPage}-${endPage}:`, chunkError);
        if (currentFileUpload?.id) {
          await safelyDeleteFile(vectorStoreId!, currentFileUpload.id);
        }
        continue;
      }
    }

    // Get all responses
    const messages = await openai.beta.threads.messages.list(currentThread.id);
    const assistantMessages = messages.data
      .filter(msg => msg.role === 'assistant')
      .map(msg => {
        if (msg.content[0] && 'text' in msg.content[0]) {
          return msg.content[0].text.value;
        }
        return '';
      })
      .join('\n\n---\n\n');

    // Clean up thread
    if (currentThread) {
      try {
        await openai.beta.threads.del(currentThread.id);
        console.log('Cleaned up thread');
      } catch (threadError) {
        console.warn('Failed to clean up thread:', threadError);
      }
    }

    return NextResponse.json({ 
      success: true, 
      simplifiedContent: assistantMessages,
      savedFiles: savedFiles,
      uploadDir: '/uploads'
    });

  } catch (error) {
    // Clean up on error
    for (const fileId of fileUploads) {
      await safelyDeleteFile(vectorStoreId!, fileId);
    }
    
    if (currentThread) {
      try {
        await openai.beta.threads.del(currentThread.id);
      } catch (threadError) {
        console.warn('Thread cleanup failed:', threadError);
      }
    }

    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Processing error: ' + (error as Error).message },
      { status: 500 }
    );
  }
}

// DELETE endpoint for manual file cleanup
export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const fileId = body.fileId;
    
    if (!fileId) {
      return new Response('File ID is required', { status: 400 });
    }

    const vectorStoreId = await getOrCreateVectorStore();
    await safelyDeleteFile(vectorStoreId, fileId);

    return new Response('File deleted successfully', { status: 200 });
  } catch (error) {
    console.error('Delete error:', error);
    return new Response('Delete failed: ' + (error as Error).message, { status: 500 });
  }
}

// GET endpoint with error handling
export async function GET() {
  try {
    const vectorStoreId = await getOrCreateVectorStore();
    const fileList = await openai.beta.vectorStores.files.list(vectorStoreId);

    const filesArray = await Promise.all(
      fileList.data.map(async (file) => {
        try {
          const fileDetails = await openai.files.retrieve(file.id);
          const vectorFileDetails = await openai.beta.vectorStores.files.retrieve(
            vectorStoreId,
            file.id
          );
          return {
            file_id: file.id,
            filename: fileDetails.filename,
            status: vectorFileDetails.status,
          };
        } catch (error) {
          console.warn(`Failed to get details for file ${file.id}:`, error);
          return null;
        }
      })
    );

    // Filter out failed retrievals
    const validFiles = filesArray.filter(file => file !== null);

    return Response.json(validFiles);
  } catch (error) {
    console.error('GET error:', error);
    return new Response('Failed to list files: ' + (error as Error).message, { status: 500 });
  }
}
