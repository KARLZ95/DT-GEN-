
import { GoogleGenAI, Type } from "@google/genai";
import { 
  GEMINI_MODEL, GEMINI_FAST_MODEL,
  CLIENT_STEP_1_CONTEXT, CLIENT_STEP_2_REQ, CLIENT_STEP_3_TARGET,
  CV_STEP_1_SKELETON, CV_STEP_2_AUDIT, CV_STEP_3_CONSISTENCY,
  SYSTEM_PROMPT_FINAL 
} from "../constants";
import { TechnicalDossier } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper pour les étapes intermédiaires (rapides)
const runFastStep = async (prompt: string, context: string, jsonSchema?: any): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_FAST_MODEL,
      contents: `${prompt}\n\nSOURCE DE DONNÉES :\n${context}`,
      config: {
        temperature: 0.1, // Très strict pour l'analyse
        ...(jsonSchema ? { 
            responseMimeType: "application/json",
            responseSchema: jsonSchema
        } : {})
      }
    });
    return response.text || "";
  } catch (e) {
    console.error("Error in chain step:", e);
    return "";
  }
};

export const analyzeAndRewriteCV = async (clientNeed: string, cvContent: string, instructions: string): Promise<TechnicalDossier> => {
  
  // --- PARTIE 1 : PIPELINE CONTEXTE CLIENT (Si présent) ---
  let clientAnalysis = "Aucun contexte client fourni. Génération standard.";
  let targetPersona = "Profil standard basé sur le CV.";

  if (clientNeed && clientNeed.length > 50) {
    console.log("--- DÉBUT PIPELINE CLIENT ---");
    // Étape 1 : Contexte
    const contextSummary = await runFastStep(CLIENT_STEP_1_CONTEXT, clientNeed);
    // Étape 2 : Exigences (Parallélisable avec E1 en théorie, mais on chaîne pour utiliser le contexte si besoin)
    const techReqs = await runFastStep(CLIENT_STEP_2_REQ, clientNeed);
    // Étape 3 : Persona Cible
    targetPersona = await runFastStep(CLIENT_STEP_3_TARGET, `CONTEXTE: ${contextSummary}\nTECH REQS: ${techReqs}`);
    
    clientAnalysis = `
    CONTEXTE PROJET : ${contextSummary}
    EXIGENCES TECHNIQUES : ${techReqs}
    PROFIL CIBLE ATTENDU : ${targetPersona}
    `;
  }

  // --- PARTIE 2 : PIPELINE CV (CHAIN OF VERIFICATION) ---
  console.log("--- DÉBUT PIPELINE CV ---");

  // Étape 1 : Squelette Temporel (CRITIQUE)
  const skeletonResponse = await runFastStep(CV_STEP_1_SKELETON, cvContent, {
    type: Type.OBJECT,
    properties: {
      timeline: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            dates: { type: Type.STRING },
            company: { type: Type.STRING },
            title: { type: Type.STRING }
          }
        }
      }
    }
  });
  
  // Étape 2 : Audit de Contenu (Basé sur le squelette pour ne pas dériver)
  const contentAudit = await runFastStep(CV_STEP_2_AUDIT, `CV ORIGINAL:\n${cvContent}\n\nSQUELETTE À REMPLIR:\n${skeletonResponse}`);
  
  // Étape 3 : Cohérence Globale
  const consistencyCheck = await runFastStep(CV_STEP_3_CONSISTENCY, skeletonResponse);

  const cvVerifiedData = `
  === SQUELETTE TEMPOREL VÉRIFIÉ (NE PAS MODIFIER) ===
  ${skeletonResponse}
  
  === AUDIT DE CONTENU DES MISSIONS ===
  ${contentAudit}

  === ANALYSE DE COHÉRENCE ===
  ${consistencyCheck}
  `;

  // --- PARTIE 3 : SYNTHÈSE FINALE ---
  console.log("--- GÉNÉRATION FINALE ---");

  const finalPrompt = `
  ${SYSTEM_PROMPT_FINAL}

  --- DONNÉES D'ENTRÉE ---
  
  1. ANALYSE DU BESOIN CLIENT :
  ${clientAnalysis}

  2. DONNÉES VÉRIFIÉES DU CONSULTANT (CV) :
  ${cvVerifiedData}

  3. INSTRUCTIONS SPÉCIFIQUES :
  "${instructions || "Aucune."}"
  `;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL, // Modèle Pro pour la qualité rédactionnelle finale
    contents: finalPrompt,
    config: {
      temperature: 0.2, // Faible pour respecter les faits
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          header: {
            type: Type.OBJECT,
            properties: {
              jobTitle: { type: Type.STRING },
              name: { type: Type.STRING },
              yearsOfExp: { type: Type.STRING },
              availability: { type: Type.STRING }
            },
            required: ["jobTitle", "name", "yearsOfExp"]
          },
          pushContent: { type: Type.STRING, description: "Le contenu de l'email commercial 'Push' formaté." },
          sectors: { type: Type.ARRAY, items: { type: Type.STRING } },
          perimeters: { type: Type.ARRAY, items: { type: Type.STRING } },
          formations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                year: { type: Type.STRING },
                degree: { type: Type.STRING },
                university: { type: Type.STRING }
              }
            }
          },
          professionalSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
          softSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
          technicalSkills: {
            type: Type.OBJECT,
            properties: {
              langages: { type: Type.ARRAY, items: { type: Type.STRING } },
              sgbd: { type: Type.ARRAY, items: { type: Type.STRING } },
              devops: { type: Type.ARRAY, items: { type: Type.STRING } },
              outils: { type: Type.ARRAY, items: { type: Type.STRING } },
              systemes: { type: Type.ARRAY, items: { type: Type.STRING } },
              methodes: { type: Type.ARRAY, items: { type: Type.STRING } },
              securite: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
          },
          languages: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                language: { type: Type.STRING },
                level: { type: Type.STRING }
              }
            }
          },
          references: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                company: { type: Type.STRING },
                contact: { type: Type.STRING }
              }
            }
          },
          experiences: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                jobTitle: { type: Type.STRING },
                dates: { type: Type.STRING },
                duration: { type: Type.STRING },
                client: { type: Type.STRING },
                context: { type: Type.STRING },
                missions: { type: Type.ARRAY, items: { type: Type.STRING } },
                livrables: { type: Type.ARRAY, items: { type: Type.STRING } },
                results: { type: Type.ARRAY, items: { type: Type.STRING } },
                team: { type: Type.ARRAY, items: { type: Type.STRING } },
                technicalEnv: {
                  type: Type.OBJECT,
                  properties: {
                    languages: { type: Type.ARRAY, items: { type: Type.STRING } },
                    sgbd: { type: Type.ARRAY, items: { type: Type.STRING } },
                    tools: { type: Type.ARRAY, items: { type: Type.STRING } }
                  }
                }
              }
            }
          }
        },
        required: ["header", "pushContent", "sectors", "perimeters", "formations", "technicalSkills", "experiences"]
      },
    },
  });

  let text = response.text;
  if (!text) throw new Error("L'IA n'a pas retourné de contenu valide.");

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    text = text.substring(firstBrace, lastBrace + 1);
  }

  return JSON.parse(text) as TechnicalDossier;
};
