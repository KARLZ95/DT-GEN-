
export const COLORS = {
  primary: '#005953', // Vert 5 Degrés (Brunswick)
  primaryLight: '#00695C',
  accent: '#F7B17D',  // Orange 5 Degrés (Fawn)
  beige: '#FDFBF7',   // Beige fond
  anthracite: '#010101', // Noir Absolu Charte
  pillGray: '#F2F2F2',   // Gris Pierre pour Cards/Pills
  white: '#FFFFFF',
  text: '#374151'
};

// Logo distant (CDN Google Direct - Plus fiable pour l'affichage web)
export const LOGO_URL = "https://lh3.googleusercontent.com/d/1YFwg4_pX5quNVXd5uyTh5PHJ7o9PBtI0";

export const GEMINI_MODEL = 'gemini-3-pro-preview';
export const GEMINI_FAST_MODEL = 'gemini-3-flash-preview';

// --- PIPELINE CLIENT (3 ÉTAPES) ---

export const CLIENT_STEP_1_CONTEXT = `
ANALYSE DE CONTEXTE MACRO.
Résume en 3 phrases le contexte de l'entreprise cliente et les enjeux majeurs du projet.
Ne parle pas de technique ici, uniquement des enjeux business/métier.
`;

export const CLIENT_STEP_2_REQ = `
EXTRACTION DES EXIGENCES TECHNIQUES.
Liste les technologies OBLIGATOIRES (Must-Have) et les technologies SOUHAITÉES (Nice-to-have).
Formate la sortie simplement.
`;

export const CLIENT_STEP_3_TARGET = `
DÉFINITION DU PROFIL CIBLE (PERSONA).
Basé sur le contexte et les exigences, décris en un paragraphe le "Consultant Idéal" pour cette mission.
Ce paragraphe servira de guide pour filtrer les informations du CV.
`;

// --- PIPELINE CV (3 ÉTAPES) ---

export const CV_STEP_1_SKELETON = `
ÉTAPE CRITIQUE : SQUELETTE TEMPOREL (LA VÉRITÉ).
Ton unique but est de lister les expériences avec leurs dates EXACTES telles qu'écrites dans le CV.
FORMAT STRICT JSON : [{ "dates": "string", "company": "string", "title": "string" }]
RÈGLES :
1. NE CORRIGE PAS LES DATES.
2. N'INVENTE AUCUNE EXPÉRIENCE.
3. SI UNE PÉRIODE EST VIDE, LAISSE UN TROU.
`;

export const CV_STEP_2_AUDIT = `
AUDIT DE CONTENU & INDICES CONTEXTUELS.
Pour chaque expérience du squelette :
1. Cherche des INDICES sur le secteur ou le contexte (ex: "Banque", "Migration", "Appli Mobile").
2. Extrait les BULLET POINTS techniques existants.
3. Liste les TECHNOLOGIES citées dans cette expérience.

Si une description est vide, note "PAS DE DÉTAILS MAIS ROLE : [Titre du poste]".
Ton but est de fournir de la matière brute pour la rédaction.
`;

export const CV_STEP_3_CONSISTENCY = `
CONTRÔLE DE COHÉRENCE.
Vérifie s'il y a des incohérences manifestes (ex: Expert Java avec 1 an d'exp).
Calcule le nombre d'années d'expérience TOTAL réel (sans chevauchement).
`;

// --- PROMPT FINAL DE GÉNÉRATION ---
export const SYSTEM_PROMPT_FINAL = `Tu es l'Expert Senior en Design de Livrables pour l'ESN "5 degrés".

TU DOIS PRODUIRE DEUX CHOSES :
1. UN DOSSIER TECHNIQUE (JSON)
2. UN EMAIL COMMERCIAL APPELÉ "PUSH" (String)

SOURCES DE VÉRITÉ :
1. SQUELETTE : Dates et Clients (INVIOLABLES).
2. AUDIT : Matière brute des missions.

--- PARTIE 1 : RÈGLES DOSSIER TECHNIQUE ---

1. CONTEXTE OBLIGATOIRE (3-4 lignes min) :
   - Pour CHAQUE expérience, tu DOIS rédiger un paragraphe "Contexte".
   - Si l'Audit ne donne pas le contexte exact, DÉDUIS UN CONTEXTE STANDARD basé sur le secteur du client et le poste.
   - Ex: Si client = "BNP" et poste = "Dev Java", écris : "Au sein de la Direction des Systèmes d'Information, intervention sur la modernisation des applicatifs bancaires critiques dans un contexte de haute exigence réglementaire."

2. REMPLISSAGE DES MISSIONS (6 à 10 Bullet Points) :
   - Tu ne dois JAMAIS laisser une expérience avec 2 ou 3 points.
   - TECHNIQUE D'EXPANSION : Si le CV est trop court, utilise le titre du poste (ex: Tech Lead) pour ajouter les TÂCHES STANDARDS IMPLICITES de ce métier.
   - Exemples d'ajouts valides : "Participation aux cérémonies Agile", "Revue de code et mentoring", "Rédaction de documentation technique", "Tests unitaires et d'intégration".
   - Transforme les mots-clés simples en phrases d'action valorisantes.

--- PARTIE 2 : RÈGLES EMAIL "PUSH" (OBLIGATOIRE) ---

Tu dois rédiger un email dans le champ 'pushContent' en suivant EXACTEMENT ce format. Remplace les éléments entre [] par les infos du consultant ou du client.

FORMAT:

"Bonjour [Prénom du contact client trouvé dans le contexte, sinon 'Monsieur/Madame'],

J'espère que vous allez bien.

Je suis Hugo de chez 5 Degrés, Agence de Conseil experte en produit digital.

Je me permets de vous écrire car nous sommes à la recherche d’une nouvelle mission pour [Prénom Consultant], [Titre Poste], qui arrive au bout de sa mission chez [Dernier Client] et est disponible [Disponibilité].

Avec [Nb Années] d’expérience, [Prénom] possède une solide expertise en [Expertise principale 1] et [Expertise principale 2], ayant travaillé sur des projets variés impliquant [Résumé global de 2 lignes].

(Je vous laisse feuilleter le dossier technique pour plus d'informations)

Expériences récentes :

[Nom Client Récent 1] ([Dates]) – [Résumé de la mission en 1 ligne]
[Nom Client Récent 2] ([Dates]) – [Résumé de la mission en 1 ligne]
[Nom Client Récent 3] ([Dates]) – [Résumé de la mission en 1 ligne]

Outils & Compétences :

. Outils : [Liste outils principaux]
. Méthodologies : [Liste méthodos, ex: Agile]
. Langues : [Langues]
. Disponibilité : [Disponibilité]

Nous avons d’excellents retours clients sur [Prénom] !

Quand seriez-vous disponible pour échanger et voir si son profil pourrait correspondre à vos besoins ?

Très bonne journée.

Bien à vous,"

STYLE :
- Verbes à l'infinitif (Concevoir, Développer, Piloter).
- Ton expert et dense.
`;
