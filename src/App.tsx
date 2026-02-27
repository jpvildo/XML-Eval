import { useState, useEffect } from 'react';
import { FileCode2, ArrowRightLeft, CheckCircle2, Database, FileText, Settings, Play, Save, Loader2, BookOpen, Trash2, UploadCloud, Plus, AlertCircle, Sparkles, ChevronDown, Copy, Check } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mammoth from 'mammoth';
import { evaluateConversion, type SupportedModel } from './services/llmService';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Mode = 'audit' | 'ingest' | 'update' | 'kb';

type AuditPair = {
  id: string;
  baseName: string;
  sourceFile: File | null;
  xmlFile: File | null;
};

const readFileAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const getMimeType = (file: File) => {
  if (file.type) return file.type;
  if (file.name.endsWith('.xml')) return 'text/xml';
  if (file.name.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (file.name.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
};

const processFileForGemini = async (file: File): Promise<{ mimeType: string, data: string }> => {
  if (file.name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    // Gemini doesn't natively support DOCX via inlineData, so we extract text using mammoth
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    const text = result.value;
    // Convert text to base64
    const base64 = btoa(unescape(encodeURIComponent(text)));
    return { mimeType: 'text/plain', data: base64 };
  } else {
    const base64 = await readFileAsBase64(file);
    return { mimeType: getMimeType(file), data: base64 };
  }
};

function FileUpload({ label, file, onFileSelect, accept }: { label: string, file: File | null, onFileSelect: (f: File) => void, accept: string }) {
  return (
    <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:bg-slate-50 transition-colors relative flex flex-col items-center justify-center min-h-[120px] bg-slate-50/50">
      <input
        type="file"
        accept={accept}
        onChange={(e) => e.target.files?.[0] && onFileSelect(e.target.files[0])}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      {file ? (
        <div className="flex flex-col items-center space-y-2">
          <FileText size={28} className="text-indigo-500" />
          <span className="text-sm font-medium truncate w-full px-2 max-w-[150px]">{file.name}</span>
          <span className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</span>
        </div>
      ) : (
        <div className="flex flex-col items-center space-y-2 text-slate-500">
          <UploadCloud size={28} />
          <span className="text-sm font-medium text-slate-700">Upload {label}</span>
          <span className="text-xs text-slate-400">Click or drag file</span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Mode>('audit');
  const [selectedModel, setSelectedModel] = useState<SupportedModel>('gemini-3.1-pro-preview');
  const [isCopied, setIsCopied] = useState(false);
  
  // State
  const [knowledgeBase, setKnowledgeBase] = useState('Loading Knowledge Base...');
  
  // Audit State
  const [auditPairs, setAuditPairs] = useState<AuditPair[]>([]);
  
  // Ingest State
  const [ingestFile, setIngestFile] = useState<File | null>(null);
  
  // Update State
  const [updateInstruction, setUpdateInstruction] = useState('');
  
  // Results
  const [result, setResult] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastProcessedMode, setLastProcessedMode] = useState<'audit' | 'ingest' | 'update' | null>(null);

  useEffect(() => {
    fetch('/api/kb')
      .then(res => res.text())
      .then(text => setKnowledgeBase(text))
      .catch(err => {
        console.error('Failed to load KB:', err);
        setKnowledgeBase('Error loading Knowledge Base.');
      });
  }, []);

  const handleFilesSelected = (files: FileList | File[]) => {
    const newFiles = Array.from(files);
    const pairsMap = new Map<string, AuditPair>();
    
    // Keep existing pairs
    auditPairs.forEach(p => pairsMap.set(p.baseName, p));

    newFiles.forEach(file => {
      const isXml = file.name.toLowerCase().endsWith('.xml');
      const isDocx = file.name.toLowerCase().endsWith('.docx') || file.name.toLowerCase().endsWith('.doc');
      
      if (!isXml && !isDocx) return;

      const baseName = file.name.replace(/\.(xml|docx|doc)$/i, '');
      
      if (!pairsMap.has(baseName)) {
        pairsMap.set(baseName, { id: crypto.randomUUID(), baseName, sourceFile: null, xmlFile: null });
      }
      
      const pair = pairsMap.get(baseName)!;
      if (isXml) pair.xmlFile = file;
      if (isDocx) pair.sourceFile = file;
    });

    setAuditPairs(Array.from(pairsMap.values()));
  };

  const removePair = (id: string) => {
    setAuditPairs(auditPairs.filter(p => p.id !== id));
  };

  const handleProcess = async () => {
    if (activeTab === 'kb') return;
    
    setIsProcessing(true);
    setResult('');
    setLastProcessedMode(null);
    try {
      const processInputs: any = { updateInstruction };

      if (activeTab === 'audit') {
        const validPairs = auditPairs.filter(p => p.sourceFile && p.xmlFile);
        const processedPairs = await Promise.all(validPairs.map(async (p) => {
          const sourceProcessed = await processFileForGemini(p.sourceFile!);
          const xmlProcessed = await processFileForGemini(p.xmlFile!);
          
          return {
            sourceName: p.sourceFile!.name,
            sourceMimeType: sourceProcessed.mimeType,
            sourceData: sourceProcessed.data,
            xmlName: p.xmlFile!.name,
            xmlMimeType: xmlProcessed.mimeType,
            xmlData: xmlProcessed.data,
          };
        }));
        processInputs.auditPairs = processedPairs;
      } else if (activeTab === 'ingest') {
        if (ingestFile) {
          const fileProcessed = await processFileForGemini(ingestFile);
          processInputs.ingestFile = {
            name: ingestFile.name,
            mimeType: fileProcessed.mimeType,
            data: fileProcessed.data,
          };
        }
      }

      const res = await evaluateConversion(knowledgeBase, activeTab, selectedModel, processInputs);
      setResult(res || 'No response generated.');
      setLastProcessedMode(activeTab);
    } catch (error: any) {
      setResult(`**Error:** ${error.message || 'Failed to process request.'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyUpdate = async () => {
    if (result && lastProcessedMode === 'update') {
      let newKb = result;
      // Strip markdown code blocks if the AI wrapped the whole response
      if (newKb.startsWith('```markdown')) {
        newKb = newKb.replace(/^```markdown\n/, '').replace(/\n```$/, '');
      } else if (newKb.startsWith('```')) {
        newKb = newKb.replace(/^```\w*\n/, '').replace(/\n```$/, '');
      }
      setKnowledgeBase(newKb);
      
      try {
        await fetch('/api/kb', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: newKb })
        });
        alert('Knowledge Base updated successfully and saved to file!');
      } catch (error) {
        console.error('Failed to save KB:', error);
        alert('Knowledge Base updated in memory, but failed to save to file.');
      }
      
      setActiveTab('kb');
      setResult('');
    }
  };

  const handleCopyResults = () => {
    if (result) {
      navigator.clipboard.writeText(result);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const isProcessDisabled = () => {
    if (isProcessing) return true;
    if (activeTab === 'audit') {
      return !auditPairs.some(p => p.sourceFile && p.xmlFile);
    }
    if (activeTab === 'ingest') return !ingestFile;
    if (activeTab === 'update') return !updateInstruction;
    return true;
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'audit':
        return (
          <div className="space-y-6">
            <div className="border-2 border-dashed border-indigo-300 rounded-xl p-8 text-center hover:bg-indigo-50 transition-colors relative flex flex-col items-center justify-center min-h-[200px] bg-indigo-50/30">
              <input
                type="file"
                multiple
                accept=".docx,.doc,.xml"
                onChange={(e) => e.target.files && handleFilesSelected(e.target.files)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <UploadCloud size={40} className="text-indigo-500 mb-4" />
              <h3 className="text-base font-semibold text-slate-700">Upload DOCX & XML Pairs</h3>
              <p className="text-sm text-slate-500 mt-1">Drag and drop multiple files here</p>
              <p className="text-xs text-slate-400 mt-2">Files with matching names will be automatically paired.</p>
            </div>
            
            {auditPairs.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-700 flex items-center justify-between">
                  <span>Matched Pairs ({auditPairs.length})</span>
                  <button onClick={() => setAuditPairs([])} className="text-xs text-red-500 hover:text-red-700 font-medium">Clear All</button>
                </h4>
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                  {auditPairs.map(pair => (
                    <div key={pair.id} className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm flex items-center justify-between group">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{pair.baseName}</p>
                        <div className="flex items-center space-x-4 mt-1">
                          <span className={cn("text-xs flex items-center space-x-1", pair.sourceFile ? "text-emerald-600" : "text-amber-500")}>
                            {pair.sourceFile ? <CheckCircle2 size={12}/> : <AlertCircle size={12}/>}
                            <span>DOCX</span>
                          </span>
                          <span className={cn("text-xs flex items-center space-x-1", pair.xmlFile ? "text-emerald-600" : "text-amber-500")}>
                            {pair.xmlFile ? <CheckCircle2 size={12}/> : <AlertCircle size={12}/>}
                            <span>XML</span>
                          </span>
                        </div>
                      </div>
                      <button onClick={() => removePair(pair.id)} className="p-2 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      case 'ingest':
        return (
          <div className="space-y-4 flex flex-col h-full">
            <label className="flex items-center space-x-2 text-sm font-medium text-slate-700">
              <FileCode2 size={16} />
              <span>Reference XML (Correct Conversion)</span>
            </label>
            <div className="flex-1">
              <FileUpload
                label="Reference XML"
                file={ingestFile}
                onFileSelect={setIngestFile}
                accept=".xml,.txt"
              />
            </div>
          </div>
        );
      case 'update':
        return (
          <div className="space-y-2 flex flex-col h-full">
            <label className="flex items-center space-x-2 text-sm font-medium text-slate-700">
              <Settings size={16} />
              <span>Update Instruction</span>
            </label>
            <textarea
              value={updateInstruction}
              onChange={(e) => setUpdateInstruction(e.target.value)}
              className="flex-1 w-full p-4 font-mono text-sm bg-white border border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none min-h-[300px]"
              placeholder="e.g., 'Redefine how <em> tags are used based on the latest style guide...'"
            />
          </div>
        );
      case 'kb':
        return (
          <div className="space-y-2 flex flex-col h-full">
            <label className="flex items-center space-x-2 text-sm font-medium text-slate-700">
              <Database size={16} />
              <span>Active Knowledge Base (Living Rulebook)</span>
            </label>
            <textarea
              value={knowledgeBase}
              onChange={(e) => setKnowledgeBase(e.target.value)}
              className="flex-1 w-full p-4 font-mono text-sm bg-slate-900 text-slate-100 border border-slate-800 rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none min-h-[500px]"
              placeholder="Your knowledge base rules go here..."
            />
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center space-x-3 text-indigo-600 mb-2">
            <ArrowRightLeft size={24} />
            <h1 className="text-lg font-bold tracking-tight text-slate-900">Evaluator</h1>
          </div>
          <p className="text-xs text-slate-500">DOCX to XML Auditing</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <button
            onClick={() => setActiveTab('audit')}
            className={cn(
              "w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              activeTab === 'audit' ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            <CheckCircle2 size={18} />
            <span>Audit Conversion</span>
          </button>
          <button
            onClick={() => setActiveTab('ingest')}
            className={cn(
              "w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              activeTab === 'ingest' ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            <BookOpen size={18} />
            <span>Ingest Rules</span>
          </button>
          <button
            onClick={() => setActiveTab('update')}
            className={cn(
              "w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              activeTab === 'update' ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            <Settings size={18} />
            <span>Update KB</span>
          </button>
          
          <div className="pt-4 mt-4 border-t border-slate-200">
            <button
              onClick={() => setActiveTab('kb')}
              className={cn(
                "w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                activeTab === 'kb' ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              <Database size={18} />
              <span>Knowledge Base</span>
            </button>
          </div>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center space-x-4">
            <h2 className="text-lg font-semibold capitalize">
              {activeTab === 'kb' ? 'Knowledge Base' : `${activeTab} Mode`}
            </h2>
            <div className="hidden md:flex items-center space-x-2 text-xs text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100 relative shrink-0">
              <Sparkles size={14} className="text-indigo-500 shrink-0" />
              <span className="font-medium shrink-0">Model:</span>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value as SupportedModel)}
                className="bg-transparent font-bold text-indigo-700 focus:outline-none cursor-pointer appearance-none pr-4 max-w-[180px] truncate"
              >
                <optgroup label="Google (Gemini)">
                  <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview</option>
                  <option value="gemini-flash-latest">Gemini Flash Latest (Free Tier)</option>
                </optgroup>
                <optgroup label="OpenAI">
                  <option value="gpt-4o">GPT-4o</option>
                </optgroup>
                <optgroup label="Anthropic (Coming Soon)">
                  <option value="claude-3-5-sonnet" disabled>Claude 3.5 Sonnet</option>
                </optgroup>
              </select>
              <ChevronDown size={12} className="absolute right-3 pointer-events-none text-indigo-400" />
            </div>
          </div>
          
          {activeTab !== 'kb' && (
            <button
              onClick={handleProcess}
              disabled={isProcessDisabled()}
              className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg shadow-sm hover:bg-indigo-700 focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0 ml-4"
            >
              {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              <span>Run {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</span>
            </button>
          )}
        </header>

        {/* Content Area */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Input Area */}
          <div className={cn(
            "p-6 overflow-y-auto transition-all duration-300",
            activeTab === 'kb' ? "w-full" : "w-full lg:w-1/3 border-b lg:border-b-0 lg:border-r border-slate-200 shrink-0"
          )}>
            {renderTabContent()}
          </div>

          {/* Results Area (Hidden on KB tab) */}
          {activeTab !== 'kb' && (
            <div className="w-full lg:w-2/3 bg-slate-50 p-6 overflow-y-auto flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Output / Results</h3>
                <div className="flex items-center space-x-2">
                  {result && (
                    <button
                      onClick={handleCopyResults}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 text-xs font-medium rounded-md transition-colors shadow-sm"
                    >
                      {isCopied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                      <span>{isCopied ? 'Copied!' : 'Copy Results'}</span>
                    </button>
                  )}
                  {lastProcessedMode === 'update' && result && (
                    <button
                      onClick={handleApplyUpdate}
                      className="flex items-center space-x-1 px-3 py-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 text-xs font-medium rounded-md transition-colors shadow-sm"
                    >
                      <Save size={14} />
                      <span>Apply to Knowledge Base</span>
                    </button>
                  )}
                </div>
              </div>
              
              <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm p-6 overflow-y-auto">
                {isProcessing ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                    <Loader2 size={32} className="animate-spin text-indigo-500" />
                    <p>Analyzing with Gemini...</p>
                  </div>
                ) : result ? (
                  <div className="max-w-none">
                    <Markdown 
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({node, ...props}) => <p className="mb-4 leading-relaxed text-slate-700" {...props} />,
                        h1: ({node, ...props}) => <h1 className="text-2xl font-bold mt-8 mb-4 text-slate-900" {...props} />,
                        h2: ({node, ...props}) => <h2 className="text-xl font-bold mt-6 mb-3 text-slate-900" {...props} />,
                        h3: ({node, ...props}) => <h3 className="text-lg font-semibold mt-5 mb-2 text-slate-800" {...props} />,
                        ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-4 space-y-1 text-slate-700" {...props} />,
                        ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-4 space-y-1 text-slate-700" {...props} />,
                        li: ({node, ...props}) => <li className="leading-relaxed" {...props} />,
                        code: ({node, inline, className, children, ...props}: any) => {
                          const match = /language-(\w+)/.exec(className || '');
                          const isBlock = match || String(children).includes('\n');
                          return isBlock ? (
                            <div className="bg-slate-900 rounded-lg overflow-hidden mb-4">
                              {match && <div className="px-4 py-2 bg-slate-800 text-slate-400 text-xs font-mono border-b border-slate-700">{match[1]}</div>}
                              <pre className="p-4 overflow-x-auto">
                                <code className="text-slate-50 text-sm font-mono" {...props}>{children}</code>
                              </pre>
                            </div>
                          ) : (
                            <code className="bg-slate-100 text-indigo-600 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>
                          );
                        },
                        blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-indigo-200 pl-4 italic text-slate-600 mb-4" {...props} />
                      }}
                    >
                      {result}
                    </Markdown>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2">
                    <FileText size={32} className="opacity-50" />
                    <p>Results will appear here after processing.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
