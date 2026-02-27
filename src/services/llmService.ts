import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export type SupportedModel = 'gemini-3.1-pro-preview' | 'gemini-flash-latest' | 'gpt-4o' | 'claude-3-5-sonnet';

export async function evaluateConversion(
  knowledgeBase: string,
  mode: 'audit' | 'ingest' | 'update',
  modelId: SupportedModel,
  inputs: {
    auditPairs?: {
      sourceName: string;
      sourceMimeType: string;
      sourceData: string;
      xmlName: string;
      xmlMimeType: string;
      xmlData: string;
    }[];
    ingestFile?: {
      name: string;
      mimeType: string;
      data: string;
    };
    updateInstruction?: string;
  }
) {
  const systemInstruction = `You are an Expert XML Conversion Auditor and Schema Knowledge Base Manager. You are the AI engine powering a conversion auditing tool.

You perform dynamic, contextual analysis on DOCX-to-XML conversions. You do not rely solely on static regex rules; you must use your advanced reasoning to understand the intent of the DOCX formatting and evaluate if the XML accurately captures that semantic intent based on the rules provided.

Below is the ACTIVE KNOWLEDGE BASE. This is your absolute source of truth.

---------------------------------------------------------
=== ACTIVE KNOWLEDGE BASE (LIVING RULEBOOK) ===
${knowledgeBase}
---------------------------------------------------------

You operate in three modes based on the user's prompt:

=== MODE 1: AUDIT (Prompt: "/audit") ===
The user will provide source text (from a DOCX) and the converted XML.
1. Perform a deep comparative analysis between the DOCX source and the XML output.
2. Check strictly against the Active Knowledge Base.
3. Verify DOCX Styles: Ensure that the DOCX styles (e.g., P0, H1, H0, etc.) were parsed and mapped to the correct corresponding XML tags.
4. Check for Dropped Content: Ensure absolutely NO content is dropped from the Word document to the XML. You must account for Oxygen tracked changes (<?oxy_delete...?> or <?oxy_insert...?>) and comments when verifying this.
5. Check for Hallucinations: Ensure absolutely NO additional content is added to the XML that is not present in the original Word file (e.g., inventing wrapper headers, fabricating text).
6. Output a report titled "# XML Conversion Audit Report" (ensure there are spaces between the words) detailing: Structural Errors, Semantic Anomalies, Parsing Failures, Dropped/Added Content, Oxygen Markup Issues, and Successes.

=== MODE 2: INGEST (Prompt: "/ingest") ===
The user will provide a "Correct" XML file as a reference.
1. Analyze this file to identify structural patterns, tag hierarchies, and formatting rules.
2. Compare these observed rules against the Active Knowledge Base provided above.
3. Output a formatted list of NEW rules or MODIFICATIONS that should be made to the Knowledge Base. Output this in clean Markdown so the backend application can save it to the persistent document.

=== MODE 3: UPDATE (Prompt: "/update [instruction]") ===
The user will provide a specific instruction to change a rule (e.g., "redefine how <em> tags are used").
1. Rewrite the relevant section of the Active Knowledge Base.
2. Output the FULL, updated Knowledge Base in clean Markdown format so the backend application can overwrite the persistent document.`;

  const contents: any = { parts: [] };

  if (mode === 'audit' && inputs.auditPairs) {
    contents.parts.push({ text: `/audit\n\nPlease audit the following conversion pairs against the Knowledge Base:` });
    for (let i = 0; i < inputs.auditPairs.length; i++) {
      const pair = inputs.auditPairs[i];
      contents.parts.push({ text: `\n\n=== PAIR ${i + 1} ===\n--- SOURCE DOCX (${pair.sourceName}) ---` });
      contents.parts.push({ inlineData: { mimeType: pair.sourceMimeType, data: pair.sourceData } });
      contents.parts.push({ text: `\n--- CONVERTED XML (${pair.xmlName}) ---` });
      contents.parts.push({ inlineData: { mimeType: pair.xmlMimeType, data: pair.xmlData } });
    }
  } else if (mode === 'ingest' && inputs.ingestFile) {
    contents.parts.push({ text: `/ingest\n\n=== REFERENCE XML (${inputs.ingestFile.name}) ===` });
    contents.parts.push({ inlineData: { mimeType: inputs.ingestFile.mimeType, data: inputs.ingestFile.data } });
  } else if (mode === 'update') {
    contents.parts.push({ text: `/update ${inputs.updateInstruction}` });
  }

// Helper to safely decode base64 to UTF-8
function decodeBase64ToText(base64: string): string {
  try {
    const binString = atob(base64);
    const bytes = new Uint8Array(binString.length);
    for (let i = 0; i < binString.length; i++) {
      bytes[i] = binString.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch (e) {
    console.error('Failed to decode base64', e);
    return '';
  }
}

  // Route to the appropriate LLM provider based on the selected modelId
  if (modelId.startsWith('gemini')) {
    const response = await ai.models.generateContent({
      model: modelId,
      contents,
      config: {
        systemInstruction,
        temperature: 0.2, // Low temperature for more deterministic, rule-based auditing
      },
    });
    return response.text;
  } else if (modelId.startsWith('gpt')) {
    // Build a pure text prompt for OpenAI
    let openAiPrompt = '';
    if (mode === 'audit' && inputs.auditPairs) {
      openAiPrompt += `/audit\n\nPlease audit the following conversion pairs against the Knowledge Base:\n`;
      for (let i = 0; i < inputs.auditPairs.length; i++) {
        const pair = inputs.auditPairs[i];
        openAiPrompt += `\n\n=== PAIR ${i + 1} ===\n--- SOURCE DOCX (${pair.sourceName}) ---\n`;
        openAiPrompt += decodeBase64ToText(pair.sourceData);
        openAiPrompt += `\n--- CONVERTED XML (${pair.xmlName}) ---\n`;
        openAiPrompt += decodeBase64ToText(pair.xmlData);
      }
    } else if (mode === 'ingest' && inputs.ingestFile) {
      openAiPrompt += `/ingest\n\n=== REFERENCE XML (${inputs.ingestFile.name}) ===\n`;
      openAiPrompt += decodeBase64ToText(inputs.ingestFile.data);
    } else if (mode === 'update') {
      openAiPrompt += `/update ${inputs.updateInstruction}`;
    }

    const response = await fetch('/api/evaluate/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        systemInstruction,
        prompt: openAiPrompt
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to evaluate with OpenAI');
    }

    const data = await response.json();
    return data.text;
  } else if (modelId.startsWith('claude')) {
    // Placeholder for Anthropic implementation
    // Note: In a production app, this should be called from a backend server to protect the ANTHROPIC_API_KEY.
    throw new Error(`Model ${modelId} is configured in the UI but the Anthropic API integration is not yet implemented.`);
  }

  throw new Error(`Unsupported model: ${modelId}`);
}
