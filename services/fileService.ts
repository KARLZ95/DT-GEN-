
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// Gestion de l'interopérabilité des modules ES (défaut ou nommé)
const pdfjs = (pdfjsLib as any).default || pdfjsLib;

// Configuration du worker via CDNJS (version alignée 3.11.174)
// Cette source est très stable et évite les problèmes de compilation locale
if (pdfjs && pdfjs.GlobalWorkerOptions) {
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

export const extractTextFromFile = async (file: File): Promise<string> => {
  const fileType = file.type;
  const fileName = file.name.toLowerCase();
  
  try {
    // ---------------------------------------------------------
    // TRAITEMENT PDF
    // ---------------------------------------------------------
    if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
      const arrayBuffer = await file.arrayBuffer();
      
      if (!pdfjs || !pdfjs.getDocument) {
        throw new Error("La bibliothèque PDF n'a pas pu être initialisée.");
      }

      // Chargement simplifié sans cMapUrl pour éviter les erreurs CORS/Réseau sur certains navigateurs
      const loadingTask = pdfjs.getDocument({
        data: arrayBuffer
      });

      const pdf = await loadingTask.promise;
      let fullText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        try {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          
          // Extraction du texte des items
          const pageText = textContent.items
            .map((item: any) => item.str)
            .join(' ');
            
          fullText += pageText + '\n\n';
        } catch (pageError) {
          console.warn(`Erreur lors de la lecture de la page ${i}`, pageError);
          // On continue pour essayer de lire les autres pages
        }
      }

      if (!fullText.trim()) {
        throw new Error("Le fichier PDF semble vide ou ne contient que des images scannées.");
      }
      return fullText;
    } 
    // ---------------------------------------------------------
    // TRAITEMENT WORD (DOCX)
    // ---------------------------------------------------------
    else if (
      fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
      fileName.endsWith('.docx')
    ) {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      
      if (!result.value.trim()) {
        throw new Error("Impossible d'extraire le texte du fichier Word (fichier vide ou image ?).");
      }
      return result.value;
    }
    // ---------------------------------------------------------
    // TRAITEMENT TEXTE BRUT
    // ---------------------------------------------------------
    else {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
           const text = e.target?.result as string;
           if (text && text.trim().length > 0) resolve(text);
           else reject(new Error("Le fichier texte est vide."));
        };
        reader.onerror = () => reject(new Error("Erreur système lors de la lecture du fichier."));
        reader.readAsText(file);
      });
    }
  } catch (error: any) {
    console.error("Erreur extraction fichier:", error);
    
    // Gestion spécifique des erreurs connues
    if (error.name === 'PasswordException') {
      throw new Error(`Le fichier "${file.name}" est protégé par un mot de passe.`);
    }
    
    // Message générique avec détail technique
    throw new Error(`Impossible de lire le fichier "${file.name}". Détail: ${error.message}`);
  }
};
