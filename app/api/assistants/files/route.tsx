import { splitPDFIntoChunks } from '@/app/utils/pdf-processor';
import { openai } from "@/app/openai";
import { NextResponse } from "next/server";
import { Buffer } from 'buffer';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import { PDFDocument } from 'pdf-lib';

const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;

const ASSISTANT_INSTRUCTIONS = `Verfasse Anweisungen zu pharmazeutischen und medizinischen Themen in einfacher, klarer Sprache, die für Personen mit eingeschränkter Gesundheitskompetenz leicht verständlich ist. Vermeide Fachjargon. Verwende klare und zugängliche Sprache, die dem Leseverständnis eines 12-Jährigen entspricht.

Halte dich genau an die beschriebenen Ziele und achte auf die folgenden Bereiche:

Textebene: Nur notwendige Inhalte, verständlicher Stil.
Textstruktur: Logische Abschnitte, wichtige Informationen am Anfang.
Satzebene: Kurze Sätze, aktive Sprache.
Wortebene: Allgemein verständliche Wörter, einfache Begriffe.
Ansprache und Ton: Direkte Ansprache mit "Sie", freundlicher und klarer Ton.
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
Der finale Text soll in einfachem Deutsch verfasst sein und kurze, leicht verständliche Sätze enthalten.
Gliedere Anweisungen in nummerierte oder gepunktete Listen und präsentiere sie in einer logischen Reihenfolge, sodass die Leser den Anweisungen klar folgen können
Versichere dich, dass der Text vollständig, ohne unnötige Details, und gleichzeitig auch ausführlich genug ist, um alle relevanten Informationen bereitzustellen.
Der vereinfachte Text sollte im selben Format wie der ursprüngliche Text dargestellt sein.
Hinweise
Vermeide Negationen, schreibe in aktiver Sprache, und benutze möglichst konkrete Zeitformen.
Erläutere Fachbegriffe als erläuternde Erklärungen in Klammern, falls sie unbedingt notwendig sind.
Auch sorgfältig darauf achten, dass keine Information fehlen darf, die grundlegend zum Verständnis wäre.
Wandle den Text vollständig in einfache Sprache. Lasse auf keinen Fall Informationen weg`;

async function getOrCreateVectorStore() {
  if (!ASSISTANT_ID) {
    throw new Error('OPENAI_ASSISTANT_ID is not set');
  }

  const assistant = await openai.beta.assistants.retrieve(ASSISTANT_ID);

  if (assistant.tool_resources?.file_search?.vector_store_ids?.length > 0) {
    return assistant.tool_resources.file_search.vector_store_ids[0];
  }

  const vectorStore = await openai.beta.vectorStores.create({
    name: "medical-documents-vector-store"
  });

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

async function removeFromVectorStore(vectorStoreId: string, fileId: string) {
  try {
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

async function removeFromOpenAI(fileId: string) {
  try {
    if (!ASSISTANT_ID) {
      throw new Error('ASSISTANT_ID is not set');
    }

    const assistant = await openai.beta.assistants.retrieve(ASSISTANT_ID);
    const currentFileIds = assistant.file_ids || [];
    const updatedFileIds = currentFileIds.filter(id => id !== fileId);
    
    await openai.beta.assistants.update(ASSISTANT_ID, {
      file_ids: updatedFileIds
    });
    console.log(`Removed file ${fileId} from assistant`);

    try {
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

async function safelyDeleteFile(vectorStoreId: string, fileId: string) {
  try {
    await removeFromVectorStore(vectorStoreId, fileId);
    await removeFromOpenAI(fileId);
  } catch (error) {
    console.warn(`Deletion process failed for ${fileId}:`, error);
  }
}

export async function POST(request: Request) {
  let currentThread = null;
  let vectorStoreId = null;
  let fileUploads: string[] = [];
  let currentFileUpload = null;
  
  try {
    vectorStoreId = await getOrCreateVectorStore();
    console.log(`Using vector store: ${vectorStoreId}`);

    const formData = await request.formData();
    const file = formData.get('file');
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    const originalName = (file as File).name.replace('.pdf', '');
    console.log(`Processing file: ${originalName}`);
    
    const bytes = await (file as Blob).arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const sourcePdf = await PDFDocument.load(buffer);
    const totalPages = sourcePdf.getPageCount();
    
    const pdfChunks = await splitPDFIntoChunks(buffer, 2);
    console.log(`Split into ${pdfChunks.length} chunks (2 pages each)`);
    
    let combinedResponse = '';
    const savedFiles: string[] = [];
    
    currentThread = await openai.beta.threads.create();
    console.log(`Created thread: ${currentThread.id}`);
    
    for (let i = 0; i < pdfChunks.length; i++) {
      const chunk = pdfChunks[i];
      const startPage = i * 2 + 1;
      const endPage = Math.min(startPage + 1, totalPages);
      const chunkFileName = `${originalName}_pages${startPage}-${endPage}.pdf`;
      const chunkPath = path.join(uploadDir, chunkFileName);
      
      try {
        await writeFile(chunkPath, chunk);
        savedFiles.push(chunkFileName);

        const uploadFormData = new FormData();
        uploadFormData.append('file', new Blob([chunk], { type: 'application/pdf' }), chunkFileName);
        uploadFormData.append('purpose', 'assistants');

        currentFileUpload = await openai.files.create({
          file: uploadFormData.get('file') as any,
          purpose: 'assistants'
        });
        fileUploads.push(currentFileUpload.id);
        console.log(`Uploaded pages ${startPage}-${endPage} to OpenAI: ${currentFileUpload.id}`);

        await openai.beta.vectorStores.files.create(vectorStoreId, {
          file_id: currentFileUpload.id,
        });

        await openai.beta.assistants.update(ASSISTANT_ID!, {
          tools: [{ type: "file_search" }],
          file_ids: [currentFileUpload.id],
          model: "ft:gpt-4o-2024-08-06:health-concepts:clarifynow-001:AaMToKWY",
          instructions: ASSISTANT_INSTRUCTIONS
        });

        await openai.beta.threads.messages.create(currentThread.id, {
          role: 'user',
          content: `Simplify des medizinischen Dokuments.`
        });

        const run = await openai.beta.threads.runs.create(currentThread.id, {
          assistant_id: ASSISTANT_ID!
        });

        let runStatus = await openai.beta.threads.runs.retrieve(currentThread.id, run.id);
        let attempts = 0;
        const maxAttempts = 120;

        while (runStatus.status !== 'completed' && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          runStatus = await openai.beta.threads.runs.retrieve(currentThread.id, run.id);
          
          if (attempts % 10 === 0) {
            console.log(`Processing chunk ${i + 1}/${pdfChunks.length}: ${runStatus.status} (${attempts}s)`);
          }
          
          if (runStatus.status === 'failed') {
            throw new Error('Processing failed');
          }
          attempts++;
        }

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

    const validFiles = filesArray.filter(file => file !== null);

    return Response.json(validFiles);
  } catch (error) {
    console.error('GET error:', error);
    return new Response('Failed to list files: ' + (error as Error).message, { status: 500 });
  }
}

