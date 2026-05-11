import React, { useState } from 'react';
import { FileText, Wand2, AlertCircle, Loader2, Files, FileType, Check, Sparkles, Clipboard, X, Copy, Mail } from 'lucide-react';
import { FileUploadZone } from './components/FileUploadZone';
import { Logo } from './components/Logo';
import { analyzeAndRewriteCV } from './services/geminiService';
import { generatePptx } from './services/pptxService';
import { extractTextFromFile } from './services/fileService';
import { TechnicalDossier, ProcessingStatus } from './types';

const App: React.FC = () => {
  // Client Need States
  const [clientNeedFiles, setClientNeedFiles] = useState<File[]>([]);
  const [clientNeedRawText, setClientNeedRawText] = useState<string>("");
  const [showClientNeedText, setShowClientNeedText] = useState<boolean>(false);
  
  // CV States
  const [cvFiles, setCvFiles] = useState<File[]>([]);
  const [cvRawText, setCvRawText] = useState<string>("");
  const [showCvText, setShowCvText] = useState<boolean>(false);

  const [instructions, setInstructions] = useState<string>("");
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TechnicalDossier | null>(null);
  const [copied, setCopied] = useState(false);

  const hasCvContent = cvFiles.length > 0 || cvRawText.trim().length > 50;

  const handleGenerate = async () => {
    if (!hasCvContent) {
      setError("Veuillez fournir un CV (Fichier ou Texte collé) pour lancer l'analyse.");
      return;
    }

    setError(null);
    setStatus('analyzing');
    setCopied(false);

    try {
      // 1. Extraction et concaténation des CVs (Fichiers)
      const cvTextPromises = cvFiles.map(file => extractTextFromFile(file));
      const fileTexts = await Promise.all(cvTextPromises);
      
      let fullCvText = fileTexts.join('\n\n--- DOCUMENT SUIVANT (CV/SOURCE FICHIER) ---\n\n');

      // 2. Ajout du Texte Brut CV (Paste)
      if (cvRawText.trim()) {
        fullCvText += `\n\n--- DOCUMENT SUIVANT (CV/SOURCE TEXTE BRUT) ---\n\n${cvRawText}`;
      }

      // 3. Extraction et concaténation des Besoins Clients (Fichiers + Texte)
      let fullClientNeedText = "";
      const clientTextsParts: string[] = [];

      if (clientNeedFiles.length > 0) {
        const clientNeedPromises = clientNeedFiles.map(file => extractTextFromFile(file));
        const clientTexts = await Promise.all(clientNeedPromises);
        clientTextsParts.push(clientTexts.join('\n\n--- DOCUMENT SUIVANT (CONTEXTE CLIENT FICHIER) ---\n\n'));
      }

      if (clientNeedRawText.trim()) {
        clientTextsParts.push(`--- DOCUMENT SUIVANT (CONTEXTE CLIENT TEXTE BRUT) ---\n\n${clientNeedRawText}`);
      }

      fullClientNeedText = clientTextsParts.join('\n\n');

      // 4. Lancement de l'IA
      const dossierData = await analyzeAndRewriteCV(fullClientNeedText, fullCvText, instructions);
      setResult(dossierData);
      
      setStatus('generating');
      await generatePptx(dossierData);
      setStatus('completed');
    } catch (err: any) {
      setError(err.message || "Une erreur est survenue lors du traitement.");
      setStatus('error');
    }
  };

  const copyPushToClipboard = () => {
    if (result?.pushContent) {
      navigator.clipboard.writeText(result.pushContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#005953] to-[#012e2b] flex flex-col font-['Raleway'] text-white selection:bg-[#F7B17D] selection:text-[#005953]">
      
      {/* Header Minimaliste */}
      <header className="px-8 py-6">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
            <div className="flex items-center justify-center">
               <Logo className="h-10 w-auto object-contain" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">DT-GEN <span className="text-[#F7B17D]">STUDIO</span></h1>
        </div>
      </header>

      <main className="flex-grow flex flex-col items-center justify-center px-6 py-8">
        
        {/* Titre Épuré */}
        <div className="text-center mb-10 w-full">
          <div className="mx-auto mb-8 w-96 h-40 flex items-center justify-center">
            <Logo className="w-full h-full object-contain drop-shadow-xl" />
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">Dossiers de Compétences</h2>
          <p className="text-emerald-100/60 font-medium tracking-wide">Standardisation & Excellence - Analyse Croisée</p>
        </div>

        {/* Workspace Card */}
        <div className="bg-white text-gray-800 rounded-[2rem] shadow-2xl p-10 md:p-12 w-full max-w-4xl border border-white/10 relative overflow-hidden">
          
          {/* Progress Bar */}
          {status !== 'idle' && status !== 'completed' && (
             <div className="absolute top-0 left-0 w-full h-1.5 bg-gray-100">
                <div className="h-full bg-[#F7B17D] animate-progress-fast"></div>
             </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            
            {/* Zone Contexte Client (Hybride Fichier + Texte) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-orange-50 text-[#F7B17D]">
                    <FileText className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-gray-700">Contexte Client</h3>
                </div>

                {/* Toggle Bouton pour le mode Texte Client */}
                <button 
                    onClick={() => setShowClientNeedText(!showClientNeedText)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${showClientNeedText ? 'bg-[#F7B17D] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                    {showClientNeedText ? <X className="w-3 h-3"/> : <Clipboard className="w-3 h-3"/>}
                    {showClientNeedText ? 'Fermer éditeur' : 'Coller texte'}
                </button>
              </div>

              {showClientNeedText ? (
                  <div className="relative animate-fade-in-up">
                      <textarea 
                        value={clientNeedRawText}
                        onChange={(e) => setClientNeedRawText(e.target.value)}
                        placeholder="Collez ici le contexte client, la description de mission ou l'appel d'offres..."
                        className="w-full p-4 h-[160px] rounded-xl border-2 border-orange-100 bg-orange-50/20 focus:bg-white focus:border-[#F7B17D] focus:ring-0 outline-none transition-all resize-none text-sm text-gray-700 placeholder:text-gray-400"
                      />
                      {clientNeedRawText.length > 0 && (
                          <div className="absolute bottom-3 right-3 text-[10px] bg-white/80 px-2 py-1 rounded text-orange-700 font-bold border border-orange-100">
                              {clientNeedRawText.length} caractères
                          </div>
                      )}
                  </div>
              ) : (
                <FileUploadZone 
                  id="client-need"
                  label="Déposer besoins / AO"
                  accept=".txt,.pdf,.docx"
                  onFileSelect={setClientNeedFiles}
                  selectedFiles={clientNeedFiles}
                />
              )}
            </div>

            {/* Zone CV (Hybride Fichier + Texte) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-50 text-[#005953]">
                    <Files className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-gray-700">CV & Sources</h3>
                </div>
                
                {/* Toggle Bouton pour le mode Texte CV */}
                <button 
                    onClick={() => setShowCvText(!showCvText)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${showCvText ? 'bg-[#005953] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                    {showCvText ? <X className="w-3 h-3"/> : <Clipboard className="w-3 h-3"/>}
                    {showCvText ? 'Fermer éditeur' : 'Coller texte'}
                </button>
              </div>

              {showCvText ? (
                  <div className="relative animate-fade-in-up">
                      <textarea 
                        value={cvRawText}
                        onChange={(e) => setCvRawText(e.target.value)}
                        placeholder="Collez ici le contenu brut du CV, profil LinkedIn, ou notes..."
                        className="w-full p-4 h-[160px] rounded-xl border-2 border-emerald-100 bg-emerald-50/20 focus:bg-white focus:border-[#005953] focus:ring-0 outline-none transition-all resize-none text-sm text-gray-700 placeholder:text-gray-400"
                      />
                      {cvRawText.length > 0 && (
                          <div className="absolute bottom-3 right-3 text-[10px] bg-white/80 px-2 py-1 rounded text-emerald-700 font-bold border border-emerald-100">
                              {cvRawText.length} caractères
                          </div>
                      )}
                  </div>
              ) : (
                <FileUploadZone 
                    id="consultant-cv"
                    label="Déposer CVs sources"
                    accept=".txt,.pdf,.docx"
                    onFileSelect={setCvFiles}
                    selectedFiles={cvFiles}
                />
              )}
            </div>
          </div>

          {/* Section Instructions IA */}
          <div className="mb-10 space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-gray-700">Instructions IA <span className="text-gray-400 font-normal text-sm ml-2">(Optionnel)</span></h3>
            </div>
            <textarea 
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Ex : Synthétise les compétences des 2 CVs. Traduis le dossier en anglais. Mets l'accent sur les expériences Java..."
              className="w-full p-4 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-[#005953] focus:ring-1 focus:ring-[#005953] outline-none transition-all resize-y min-h-[80px] text-sm text-gray-700 placeholder:text-gray-400"
            />
          </div>

          {/* Action Area */}
          <div className="flex flex-col items-center">
            <button
              onClick={handleGenerate}
              disabled={status === 'analyzing' || status === 'generating' || !hasCvContent}
              className={`
                group relative px-10 py-4 rounded-xl font-bold text-lg transition-all flex items-center gap-3 w-full md:w-auto justify-center shadow-lg
                ${(status === 'analyzing' || status === 'generating' || !hasCvContent) 
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                  : 'bg-[#005953] text-white hover:bg-[#00423e] hover:shadow-emerald-900/20 active:scale-95'}
              `}
            >
              {status === 'analyzing' || status === 'generating' ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Analyse croisée en cours...</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-5 h-5" />
                  <span>Générer le Dossier</span>
                </>
              )}
            </button>

            {error && (
              <div className="mt-6 flex items-center gap-3 text-red-600 bg-red-50 px-5 py-3 rounded-lg text-sm font-medium animate-bounce-short">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
          </div>

          {/* Success State */}
          {status === 'completed' && result && (
            <div className="mt-8 animate-fade-in-up space-y-6">
              
              {/* Carte Succès + Téléchargement */}
              <div className="bg-emerald-50/50 rounded-2xl p-6 border border-emerald-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-[#005953] flex items-center justify-center text-white shadow-md">
                      <Check className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-800 text-lg">{result.header.name}</h4>
                      <p className="text-emerald-700 text-sm font-medium">Prêt au téléchargement</p>
                    </div>
                  </div>
                  <button
                      onClick={() => generatePptx(result)}
                      className="text-[#005953] hover:bg-emerald-100 p-3 rounded-xl transition-colors"
                      title="Télécharger à nouveau (.pptx)"
                    >
                      <FileType className="w-6 h-6" />
                    </button>
                </div>
              </div>

              {/* Carte Email Push (Nouveau) */}
              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm relative">
                <div className="flex items-center justify-between mb-4">
                   <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                        <Mail className="w-5 h-5" />
                      </div>
                      <h4 className="font-bold text-gray-800">Email d'accompagnement (Push)</h4>
                   </div>
                   <button 
                      onClick={copyPushToClipboard}
                      className={`
                        flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                        ${copied ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}
                      `}
                   >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copied ? 'Copié !' : 'Copier'}
                   </button>
                </div>
                
                <textarea
                  readOnly
                  value={result.pushContent}
                  className="w-full h-64 p-4 rounded-xl border border-gray-100 bg-gray-50 text-gray-700 text-sm font-mono resize-none focus:outline-none"
                  style={{ whiteSpace: 'pre-wrap' }}
                />
              </div>

            </div>
          )}
        </div>
      </main>

      {/* Footer Minimal */}
      <footer className="py-6 text-center text-emerald-100/40 text-xs">
        © 2025 5 Degrés
      </footer>

      <style>{`
        @keyframes progress-fast {
          0% { width: 0%; transform: translateX(-100%); }
          50% { width: 70%; transform: translateX(0); }
          100% { width: 100%; transform: translateX(100%); }
        }
        .animate-progress-fast {
          animation: progress-fast 2s infinite ease-in-out;
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.4s ease-out;
        }
        @keyframes bounce-short {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        .animate-bounce-short {
          animation: bounce-short 1s infinite;
        }
      `}</style>
    </div>
  );
};

export default App;