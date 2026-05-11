
export interface TechnicalSkillSet {
  langages: string[];
  sgbd: string[];
  devops: string[];
  outils: string[];
  systemes: string[];
  methodes: string[];
  securite: string[];
}

export interface Experience {
  jobTitle: string;
  dates: string;
  duration: string; // ex: "2 ans"
  client: string;
  context: string; // Description narrative
  missions: string[]; // Liste des tâches
  livrables: string[]; // Contexte et livrables (colonne droite)
  results?: string[]; // Added optional results field
  team: string[]; // Composition équipe
  technicalEnv: {
    languages: string[];
    sgbd: string[];
    tools: string[];
  };
}

export interface Formation {
  year: string;
  degree: string;
  university: string;
}

export interface Language {
  language: string;
  level: string;
}

export interface Reference {
  company: string;
  contact: string;
}

export interface TechnicalDossier {
  header: {
    jobTitle: string;
    name: string;
    yearsOfExp: string;
    availability: string;
  };
  pushContent: string; // Nouveau : Contenu du mail de Push
  sectors: string[]; // Nouveau: Secteurs (Banque, Energie...)
  perimeters: string[]; // Nouveau: Périmètres (Discovery, UX...)
  formations: Formation[];
  professionalSkills: string[];
  softSkills: string[];
  technicalSkills: TechnicalSkillSet;
  languages: Language[];
  references: Reference[];
  experiences: Experience[];
}

export type ProcessingStatus = 'idle' | 'analyzing' | 'generating' | 'completed' | 'error';
