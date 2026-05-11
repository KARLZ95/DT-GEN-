import PptxGenJS from "pptxgenjs";
import { TechnicalDossier, Experience } from "../types";
import { COLORS } from "../constants";

const safeStr = (input: any): string => {
  if (input === null || input === undefined) return "";
  if (typeof input === "string") return input.trim();
  if (typeof input === "number") return String(input);
  if (Array.isArray(input)) return input.map(safeStr).join(" ");
  if (typeof input === "object") {
    return input.label || input.name || input.value || JSON.stringify(input);
  }
  return String(input);
};

export const generatePptx = async (data: TechnicalDossier) => {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 inches

  pres.author = '5 Degrés';
  pres.company = '5 Degrés';
  pres.title = `Dossier de Compétences - ${safeStr(data.header.name)}`;

  // --- CHARTE 5 DEGRÉS ---
  const c = (hex: string) => hex.replace('#', '');
  const FONT_MAIN = "Raleway";

  const COL_BRUNSWICK = c(COLORS.primary);  // 005953
  const COL_FAWN      = c(COLORS.accent);   // F7B17D
  const COL_ANTHRACITE = "010101";
  const COL_PILL_BG   = "F2F2F2";
  const COL_WHITE     = "FFFFFF";
  const COL_TEXT_MAIN = "374151";

  const SLIDE_W  = 13.33;
  const HEADER_H = 1.0;
  const MARGIN_X = 0.5;

  // ── MASTER SLIDE ──────────────────────────────────────────────
  pres.defineSlideMaster({
    title: "MASTER_5D",
    background: { color: COL_WHITE },
    slideNumber: {
      x: 12.8, y: 7.15, w: 0.4, h: 0.3,
      fontSize: 9, color: COL_ANTHRACITE, fontFace: FONT_MAIN, bold: true
    },
    objects: [
      // Bandeau vert
      { rect: { x: 0, y: 0, w: '100%', h: HEADER_H, fill: { color: COL_BRUNSWICK } } },
      // Logo texte
      { text: { text: "5", options: { x: 0.4, y: 0.12, fontSize: 40, color: COL_WHITE, bold: true, fontFace: FONT_MAIN } } },
      { text: { text: "cinq degrés", options: { x: 0.92, y: 0.28, fontSize: 18, color: COL_WHITE, bold: true, fontFace: FONT_MAIN } } },
      // Titre centré
      { text: { text: "DOSSIER DE COMPÉTENCES", options: { x: 0, y: 0.33, w: '100%', align: 'center' as const, fontSize: 18, color: COL_WHITE, fontFace: FONT_MAIN, bold: true } } },
      // Filigrane
      { text: { text: "5°", options: { x: 10.5, y: 4.5, w: 4, h: 4, fontSize: 160, color: "F3F4F6", fontFace: FONT_MAIN, bold: true, align: "center" as const, rotate: -15, transparency: 85 } } },
      // Footer
      { line: { x: MARGIN_X, y: 7.1, w: 12.33, h: 0, line: { color: "E5E7EB", width: 1 } } },
      { text: { text: "Document Confidentiel • 5 Degrés • Direction Technique", options: { x: MARGIN_X, y: 7.2, w: 7, fontSize: 8, color: "9CA3AF", fontFace: FONT_MAIN } } },
    ]
  });

  // ── HELPER : PILL ──────────────────────────────────────────────
  const drawPill = (slide: PptxGenJS.Slide, text: string, x: number, y: number, accent = false): number => {
    const txt = safeStr(text).trim();
    if (!txt) return 0;
    const width = Math.max(1.1, (txt.length * 0.09) + 0.4);
    const bg  = accent ? COL_FAWN : COL_PILL_BG;
    const col = accent ? COL_WHITE : COL_ANTHRACITE;
    slide.addShape('roundRect', { x, y, w: width, h: 0.32, fill: { color: bg }, line: { color: "E5E7EB", width: 0.5 }, rectRadius: 0.5 });
    slide.addText(txt, { x, y, w: width, h: 0.32, align: "center" as const, valign: "middle" as const, fontSize: 9, color: col, fontFace: FONT_MAIN, bold: true });
    return width + 0.12;
  };

  // ── HELPER : SECTION LABEL ─────────────────────────────────────
  const sectionLabel = (slide: PptxGenJS.Slide, label: string, x: number, y: number, w = 8) => {
    slide.addShape('line', { x, y: y + 0.22, w, h: 0, line: { color: COL_FAWN, width: 1.5 } });
    slide.addText(label, { x, y, w, fontSize: 10, color: COL_BRUNSWICK, bold: true, fontFace: FONT_MAIN });
  };

  // ══════════════════════════════════════════════════════════════
  // SLIDE 1 — COUVERTURE
  // ══════════════════════════════════════════════════════════════
  const slideCover = pres.addSlide();
  slideCover.background = { color: COL_BRUNSWICK };

  // Formes décoratives
  slideCover.addShape('ellipse', { x: -2.5, y: 2.5, w: 9, h: 9,   fill: { color: "FFFFFF", transparency: 93 }, line: { width: 0 } });
  slideCover.addShape('ellipse', { x: 9,    y: -2,   w: 6.5, h: 6.5, fill: { color: COL_FAWN, transparency: 78 }, line: { width: 0 } });
  slideCover.addShape('ellipse', { x: 11,   y: 5.5,  w: 3, h: 3,   fill: { color: COL_FAWN, transparency: 88 }, line: { width: 0 } });

  // Logo haut-droite
  slideCover.addText("5 DEGRÉS", { x: 10.5, y: 0.4, w: 2.5, fontSize: 15, color: COL_WHITE, bold: true, fontFace: FONT_MAIN, align: "right" as const });

  // Sous-titre label
  slideCover.addText("DOSSIER DE COMPÉTENCES", {
    x: 1, y: 1.8, w: 9,
    fontSize: 12, color: COL_FAWN, bold: true, fontFace: FONT_MAIN, charSpacing: 3
  });

  // Nom
  slideCover.addText(safeStr(data.header.name).toUpperCase(), {
    x: 1, y: 2.4, w: 11, h: 1.4,
    fontSize: 46, color: COL_WHITE, bold: true, fontFace: FONT_MAIN
  });

  // Titre de poste
  slideCover.addText(safeStr(data.header.jobTitle).toUpperCase(), {
    x: 1, y: 3.85, w: 10, h: 0.65,
    fontSize: 22, color: COL_FAWN, fontFace: FONT_MAIN, charSpacing: 2
  });

  // Ligne de séparation orange
  slideCover.addShape('line', { x: 1, y: 4.65, w: 3, h: 0, line: { color: COL_FAWN, width: 3 } });

  // Disponibilité + Années
  slideCover.addText(`Disponibilité : ${safeStr(data.header.availability || "Immédiate")}`, {
    x: 1, y: 5.0, w: 6,
    fontSize: 13, color: COL_WHITE, fontFace: FONT_MAIN
  });
  slideCover.addText(safeStr(data.header.yearsOfExp), {
    x: 10.5, y: 4.7, w: 2.3, h: 0.7,
    fontSize: 36, color: COL_FAWN, bold: true, fontFace: FONT_MAIN, align: "right" as const
  });
  slideCover.addText("ans d'expérience", {
    x: 9.5, y: 5.35, w: 3.3,
    fontSize: 11, color: COL_WHITE, fontFace: FONT_MAIN, align: "right" as const
  });

  // ══════════════════════════════════════════════════════════════
  // SLIDE 2 — PROFIL
  // ══════════════════════════════════════════════════════════════
  const slideProfile = pres.addSlide({ masterName: "MASTER_5D" });

  const COL_L_X = MARGIN_X;
  const COL_R_X = 4.6;
  const COL_R_W = SLIDE_W - COL_R_X - MARGIN_X;

  // Séparateur vertical
  slideProfile.addShape('line', { x: COL_R_X - 0.3, y: 1.1, w: 0, h: 6.0, line: { color: "E5E7EB", width: 1 } });

  // ─ Colonne gauche ─
  let py = 1.25;

  // Photo placeholder
  slideProfile.addShape('ellipse', { x: COL_L_X + 0.55, y: py, w: 2.8, h: 2.8, fill: { color: "F3F4F6" }, line: { color: COL_FAWN, width: 2 } });
  slideProfile.addText("Photo", { x: COL_L_X + 0.55, y: py + 1.1, w: 2.8, align: "center" as const, fontSize: 11, color: "AAAAAA", fontFace: FONT_MAIN });
  py += 3.1;

  // Disponibilité
  sectionLabel(slideProfile, "DISPONIBILITÉ", COL_L_X, py, 3.8);
  py += 0.35;
  slideProfile.addText(safeStr(data.header.availability || "Immédiate").toUpperCase(), {
    x: COL_L_X, y: py, w: 3.8, fontSize: 12, color: COL_ANTHRACITE, bold: true, fontFace: FONT_MAIN
  });
  py += 0.55;

  // Savoir-être
  sectionLabel(slideProfile, "SAVOIR-ÊTRE", COL_L_X, py, 3.8);
  py += 0.35;
  (Array.isArray(data.softSkills) ? data.softSkills : []).slice(0, 7).forEach(skill => {
    slideProfile.addText("• " + safeStr(skill), { x: COL_L_X, y: py, w: 3.8, h: 0.28, fontSize: 10, color: "525252", fontFace: FONT_MAIN });
    py += 0.3;
  });

  // ─ Colonne droite ─
  let rx = COL_R_X;
  let ry = 1.25;

  // Nom + titre
  slideProfile.addText(safeStr(data.header.name), { x: rx, y: ry, w: COL_R_W - 1.8, fontSize: 26, color: COL_BRUNSWICK, bold: true, fontFace: FONT_MAIN });
  slideProfile.addText(safeStr(data.header.jobTitle), { x: rx, y: ry + 0.65, w: COL_R_W - 1.8, fontSize: 15, color: COL_FAWN, bold: true, fontFace: FONT_MAIN });

  // Badge années
  slideProfile.addShape('ellipse', { x: SLIDE_W - 2.1, y: 1.2, w: 1.55, h: 1.55, fill: { color: COL_BRUNSWICK } });
  const yrsNum = safeStr(data.header.yearsOfExp).replace(/\D/g, '') || "?";
  slideProfile.addText(yrsNum, { x: SLIDE_W - 2.1, y: 1.5, w: 1.55, align: "center" as const, fontSize: 28, color: COL_WHITE, bold: true, fontFace: FONT_MAIN });
  slideProfile.addText("ANS", { x: SLIDE_W - 2.1, y: 2.0, w: 1.55, align: "center" as const, fontSize: 8, color: COL_WHITE, fontFace: FONT_MAIN });

  // Résumé professionnel
  ry += 1.4;
  const summaryLines = Array.isArray(data.professionalSkills) && data.professionalSkills.length > 0
    ? data.professionalSkills.slice(0, 3).map(s => `• ${safeStr(s)}`).join("\n")
    : (data.experiences[0]?.context
        ? safeStr(data.experiences[0].context).substring(0, 220)
        : `Expert ${safeStr(data.header.jobTitle)}.`);

  slideProfile.addShape('rect', { x: rx, y: ry, w: COL_R_W, h: 1.15, fill: { color: "F9FAFB" }, line: { color: "E5E7EB" } });
  slideProfile.addText(summaryLines, { x: rx + 0.15, y: ry + 0.1, w: COL_R_W - 0.3, h: 0.95, fontSize: 10.5, color: COL_TEXT_MAIN, italic: true, fontFace: FONT_MAIN });
  ry += 1.3;

  // Secteurs & Périmètres
  const sectors    = Array.isArray(data.sectors)    ? data.sectors    : [];
  const perimeters = Array.isArray(data.perimeters) ? data.perimeters : [];

  if (sectors.length > 0) {
    sectionLabel(slideProfile, "SECTEURS", rx, ry, COL_R_W);
    ry += 0.35;
    let px2 = rx;
    sectors.slice(0, 6).forEach(s => { const w = drawPill(slideProfile, s, px2, ry, true); px2 += w; });
    ry += 0.5;
  }

  if (perimeters.length > 0) {
    sectionLabel(slideProfile, "PÉRIMÈTRES", rx, ry, COL_R_W);
    ry += 0.35;
    let px2 = rx;
    perimeters.slice(0, 6).forEach(p => { const w = drawPill(slideProfile, p, px2, ry); px2 += w; });
    ry += 0.5;
  }

  // Formation
  if (ry < 6.5) {
    sectionLabel(slideProfile, "FORMATION ACADÉMIQUE", rx, ry, COL_R_W);
    ry += 0.38;
    (Array.isArray(data.formations) ? data.formations : []).slice(0, 3).forEach(f => {
      slideProfile.addText(safeStr(f.year), { x: rx, y: ry, w: 0.85, fontSize: 11, color: COL_FAWN, bold: true, fontFace: FONT_MAIN });
      slideProfile.addText(`${safeStr(f.degree).toUpperCase()} — ${safeStr(f.university)}`, { x: rx + 0.85, y: ry, w: COL_R_W - 0.85, fontSize: 10.5, color: COL_ANTHRACITE, fontFace: FONT_MAIN });
      ry += 0.45;
    });
  }

  // ══════════════════════════════════════════════════════════════
  // SLIDE 3 — MATRICE DE COMPÉTENCES
  // ══════════════════════════════════════════════════════════════
  const slideMatrix = pres.addSlide({ masterName: "MASTER_5D" });

  let matY = 1.25;
  slideMatrix.addText("MATRICE DE COMPÉTENCES", { x: MARGIN_X, y: matY, fontSize: 16, color: COL_BRUNSWICK, bold: true, fontFace: FONT_MAIN });
  matY += 0.55;

  const techCategories = [
    { key: "langages",  label: "LANGAGES & FRAMEWORKS" },
    { key: "outils",    label: "OUTILS & LIBRAIRIES" },
    { key: "devops",    label: "CLOUD & DEVOPS" },
    { key: "sgbd",      label: "DATA & SGBD" },
    { key: "methodes",  label: "MÉTHODES & GESTION" },
    { key: "systemes",  label: "SYSTÈMES" },
    { key: "securite",  label: "SÉCURITÉ" },
  ];

  // 2 colonnes pour la matrice
  const MAT_COL1_X = MARGIN_X;
  const MAT_COL2_X = 6.9;
  let col1Y = matY;
  let col2Y = matY;
  let useCol2 = false;

  techCategories.forEach(cat => {
    const items = (data.technicalSkills as any)[cat.key];
    const safeItems: any[] = Array.isArray(items) ? items : [];
    if (safeItems.length === 0) return;

    const colX = useCol2 ? MAT_COL2_X : MAT_COL1_X;
    let curY   = useCol2 ? col2Y : col1Y;
    if (curY > 6.6) return;

    slideMatrix.addText(cat.label, { x: colX, y: curY, w: 6, fontSize: 10, color: COL_BRUNSWICK, bold: true, fontFace: FONT_MAIN });
    slideMatrix.addShape('line', { x: colX, y: curY + 0.25, w: 5.8, h: 0, line: { color: COL_FAWN, width: 1 } });
    curY += 0.38;

    let px2 = colX;
    let py2 = curY;
    safeItems.forEach((item: any) => {
      const w = drawPill(slideMatrix, item, px2, py2);
      if (w > 0) {
        px2 += w;
        if (px2 > colX + 5.8) { px2 = colX; py2 += 0.42; }
      }
    });
    curY = py2 + 0.55;

    if (useCol2) col2Y = curY; else col1Y = curY;
    useCol2 = !useCol2;
  });

  // Langues
  const langs = Array.isArray(data.languages) ? data.languages : [];
  if (langs.length > 0) {
    const langY = Math.max(col1Y, col2Y);
    if (langY < 6.8) {
      slideMatrix.addText("LANGUES", { x: MARGIN_X, y: langY, w: 12, fontSize: 10, color: COL_BRUNSWICK, bold: true, fontFace: FONT_MAIN });
      slideMatrix.addShape('line', { x: MARGIN_X, y: langY + 0.25, w: 12.33, h: 0, line: { color: COL_FAWN, width: 1 } });
      let langX = MARGIN_X;
      langs.forEach(l => {
        const label = `${safeStr(l.language)} — ${safeStr(l.level)}`;
        const w = drawPill(slideMatrix, label, langX, langY + 0.38);
        langX += w;
      });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // SLIDES EXPÉRIENCES — LAYOUT 2 COLONNES
  // ══════════════════════════════════════════════════════════════

  const MISSIONS_W   = 7.5;   // Largeur colonne missions (gauche)
  const LIVRABLES_X  = 8.2;   // X colonne livrables (droite)
  const LIVRABLES_W  = SLIDE_W - LIVRABLES_X - MARGIN_X;

  const createExpSlide = (exp: Experience, idx: number, total: number, missions: string[]) => {
    const slide = pres.addSlide({ masterName: "MASTER_5D" });
    const suffix = total > 1 ? ` (${idx}/${total})` : "";

    let curY = 1.18;

    // En-tête expérience
    slide.addText(safeStr(exp.jobTitle).toUpperCase() + suffix, {
      x: MARGIN_X, y: curY, w: MISSIONS_W + 0.5, h: 0.42,
      fontSize: 14, color: COL_ANTHRACITE, bold: true, fontFace: FONT_MAIN
    });
    // Durée à droite
    if (exp.duration) {
      slide.addText(safeStr(exp.duration), {
        x: MISSIONS_W + 0.8, y: curY, w: 3.5,
        fontSize: 11, color: COL_FAWN, bold: true, fontFace: FONT_MAIN, align: "right" as const
      });
    }
    curY += 0.42;

    slide.addText(safeStr(exp.client).toUpperCase(), {
      x: MARGIN_X, y: curY, w: MISSIONS_W + 0.5, h: 0.35,
      fontSize: 12, color: COL_FAWN, bold: true, fontFace: FONT_MAIN
    });
    curY += 0.32;

    slide.addText(safeStr(exp.dates), {
      x: MARGIN_X, y: curY, w: MISSIONS_W + 0.5, h: 0.28,
      fontSize: 10.5, color: "6B7280", fontFace: FONT_MAIN
    });
    curY += 0.38;

    // Ligne de séparation
    slide.addShape('line', { x: MARGIN_X, y: curY, w: SLIDE_W - MARGIN_X * 2, h: 0, line: { color: "E5E7EB", width: 1 } });
    curY += 0.18;

    // Contexte (page 1 seulement)
    if (idx === 1 && exp.context) {
      slide.addText(safeStr(exp.context), {
        x: MARGIN_X, y: curY, w: MISSIONS_W + 0.5, h: 0.75,
        fontSize: 10, color: "4B5563", italic: true, fontFace: FONT_MAIN
      });
      curY += 0.82;
    }

    // ─ Colonne Gauche : Missions ─
    sectionLabel(slide, "MISSIONS", MARGIN_X, curY, MISSIONS_W);
    curY += 0.35;

    if (missions.length > 0) {
      const formatted = missions.map(m => ({
        text: safeStr(m),
        options: {
          bullet: { type: "bullet" as const, color: COL_FAWN },
          fontSize: 10.5, color: COL_TEXT_MAIN, paraSpaceBefore: 4, lineSpacing: 17
        }
      }));
      const h = Math.min(missions.length * 0.38, 4.2);
      slide.addText(formatted, { x: MARGIN_X, y: curY, w: MISSIONS_W, h });
      curY += h + 0.15;
    }

    // Résultats
    const results = Array.isArray(exp.results) ? exp.results : [];
    if (results.length > 0 && idx === total) {
      const resText = results.map(r => `■ ${safeStr(r)}`).join("   ");
      slide.addText(resText, {
        x: MARGIN_X, y: curY, w: MISSIONS_W, h: 0.38,
        fontSize: 9.5, color: "065F46", bold: true, fill: { color: "ECFDF5" }
      });
      curY += 0.45;
    }

    // Env technique
    const envStr = [
      ...(Array.isArray(exp.technicalEnv?.languages) ? exp.technicalEnv.languages : []),
      ...(Array.isArray(exp.technicalEnv?.sgbd)      ? exp.technicalEnv.sgbd      : []),
      ...(Array.isArray(exp.technicalEnv?.tools)     ? exp.technicalEnv.tools     : [])
    ].map(safeStr).filter(Boolean).join(" • ");

    if (envStr) {
      slide.addText(envStr, {
        x: MARGIN_X, y: curY, w: MISSIONS_W, h: 0.38,
        fontSize: 9, color: "6B7280", italic: true, fontFace: FONT_MAIN
      });
    }

    // ─ Colonne Droite : Livrables & Équipe ─
    slide.addShape('line', { x: LIVRABLES_X - 0.22, y: 1.1, w: 0, h: 6.2, line: { color: "E5E7EB", width: 1 } });

    let ry2 = 1.35;

    const livrables = Array.isArray(exp.livrables) ? exp.livrables : [];
    if (livrables.length > 0) {
      sectionLabel(slide, "LIVRABLES & CONTEXTE", LIVRABLES_X, ry2, LIVRABLES_W);
      ry2 += 0.35;
      livrables.slice(0, 8).forEach(l => {
        slide.addText("▸ " + safeStr(l), {
          x: LIVRABLES_X, y: ry2, w: LIVRABLES_W, h: 0.32,
          fontSize: 10, color: COL_TEXT_MAIN, fontFace: FONT_MAIN
        });
        ry2 += 0.33;
      });
      ry2 += 0.2;
    }

    const team = Array.isArray(exp.team) ? exp.team : [];
    if (team.length > 0 && ry2 < 6.8) {
      sectionLabel(slide, "ÉQUIPE", LIVRABLES_X, ry2, LIVRABLES_W);
      ry2 += 0.35;
      team.slice(0, 4).forEach(t => {
        slide.addText("• " + safeStr(t), {
          x: LIVRABLES_X, y: ry2, w: LIVRABLES_W, h: 0.28,
          fontSize: 9.5, color: "525252", fontFace: FONT_MAIN
        });
        ry2 += 0.3;
      });
    }
  };

  // Boucle génération slides expériences
  (Array.isArray(data.experiences) ? data.experiences : []).forEach(exp => {
    const items = Array.isArray(exp.missions) ? exp.missions : [];
    const MAX_ITEMS = 8;
    const pages = Math.max(1, Math.ceil(items.length / MAX_ITEMS));
    for (let i = 0; i < pages; i++) {
      createExpSlide(exp, i + 1, pages, items.slice(i * MAX_ITEMS, (i + 1) * MAX_ITEMS));
    }
  });

  const safeName = safeStr(data.header.name).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
  await pres.writeFile({ fileName: `DT_5D_${safeName}.pptx` });
};
