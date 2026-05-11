
import { 
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, 
  BorderStyle, WidthType, ShadingType, AlignmentType, Header, Footer, PageBreak,
  VerticalAlign, PageNumber, HeightRule, HeadingLevel, ImageRun, TextDirection
} from "docx";
import saveAs from "file-saver";
import { TechnicalDossier, Experience } from "../types";
import { COLORS, LOGO_URL } from "../constants";

const c = (hex: string) => hex.replace('#', '');

// PALETTE CHARTE 5 DEGRÉS
const COL_BRUNSWICK = "005953"; // Vert Principal
const COL_FAWN = "F7B17D";      // Orange Accent
const COL_NUANCE_BEIGE = "FBF0E5"; // Fond Beige
const COL_NUANCE_GREEN = "B7DEDE"; // Vert très clair
const COL_NEUTRAL = "F2F2F2";      // Gris Pierre
const COL_TEXT = "374151";
const COL_GRAY_TEXT = "6B7280";

// RESTAURATION DE LA POLICE DE LA CHARTE
const FONT_FAMILY = "Raleway"; 

// Logo Fallback (Carré Vert Simple - Base64)
const LOGO_FALLBACK_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH6AIXFh4xv4/u1gAAAB1pVFh0Q29tbWVudAAAAAAAQ3JlYXRlZCB3aXRoIEdJTVBkLmUHAAAAF0lEQVRo3u3BMQEAAADCoPVPbQ0PoAAAgGcaAAABt04OkwAAAABJRU5ErkJggg==";

const spacer = (size: number = 200) => new Paragraph({ text: "", spacing: { after: size } });

// --- UTILS LAYOUT PLEINE LARGEUR ---
const PAGE_MARGIN = 720;
const FULL_WIDTH_OPTS = {
    width: { size: 11906, type: WidthType.DXA }, // Largeur A4 totale
    indent: { size: -PAGE_MARGIN, type: WidthType.DXA } // Décalage vers la gauche pour couvrir la marge
};
const FULL_WIDTH_CELL_MARGINS = { top: 200, bottom: 200, left: PAGE_MARGIN, right: PAGE_MARGIN };


// --- CLEANER ---
const clean = (input: string | undefined): string => {
  if (!input) return "";
  return String(input).replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, "").trim();
};

export const generateDocx = async (data: TechnicalDossier): Promise<void> => {
  
  // 1. Récupération du Logo (URL distante ou Fallback)
  let logoBuffer: Uint8Array;
  let imgType: "png" | "jpeg" = "png";
  let finalWidth = 60;  // Taille par défaut si calcul impossible
  let finalHeight = 60;

  try {
     const response = await fetch(LOGO_URL, { referrerPolicy: "no-referrer" });
     if (!response.ok) throw new Error("Erreur réseau image");
     const blob = await response.blob();
     const arr = await blob.arrayBuffer();
     logoBuffer = new Uint8Array(arr);
     
     // Détection type
     if (blob.type.includes("jpeg") || blob.type.includes("jpg")) {
         imgType = "jpeg";
     }

     // Calcul du ratio pour ne pas déformer le logo
     const dimensions = await new Promise<{w: number, h: number}>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve({ w: 100, h: 100 });
        img.src = URL.createObjectURL(blob);
     });

     // Contraintes de la zone header (approx 200px large x 65px haut)
     const MAX_W = 200;
     const MAX_H = 65;
     const ratio = Math.min(MAX_W / dimensions.w, MAX_H / dimensions.h);
     
     finalWidth = dimensions.w * ratio;
     finalHeight = dimensions.h * ratio;

  } catch (e) {
     console.warn("Utilisation du logo fallback (erreur fetch)", e);
     logoBuffer = Uint8Array.from(atob(LOGO_FALLBACK_BASE64), c => c.charCodeAt(0));
     // Fallback est carré
     finalWidth = 50;
     finalHeight = 50;
  }
  
  // On crée l'objet Header une seule fois pour l'appliquer partout
  const mainHeader = createHeader(logoBuffer, finalWidth, finalHeight, imgType);

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT_FAMILY, size: 22, color: COL_TEXT },
          paragraph: { spacing: { after: 120, line: 320 } }
        },
        heading1: {
            run: { font: FONT_FAMILY, size: 28, bold: true, color: COL_BRUNSWICK },
            paragraph: { spacing: { before: 200, after: 100 } }
        }
      }
    },
    sections: [
      {
        properties: {
          titlePage: true, // Active headers.first et headers.default
          page: { 
            margin: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN, header: 0, footer: 700 } 
          }
        },
        headers: { 
            first: mainHeader, // Header page 1 (Grand bandeau Vert avec Logo)
            default: mainHeader // Header pages suivantes (Même grand bandeau Vert avec Logo)
        },
        footers: { default: createFooter() },
        children: [
          
          spacer(200),

          // --- PAGE 1 : PROFIL ---
          
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({ text: data.header.jobTitle.toUpperCase(), font: FONT_FAMILY, bold: true, size: 48, color: COL_BRUNSWICK }),
            ],
            spacing: { after: 100 }
          }),
          
          new Paragraph({
             alignment: AlignmentType.CENTER,
             children: [new TextRun({ text: data.header.name, font: FONT_FAMILY, size: 32, color: COL_FAWN, bold: true })], 
             spacing: { after: 400 }
          }),

          // COLONNES PROFIL
          new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE } },
              rows: [
                  new TableRow({
                      children: [
                          // GAUCHE
                          new TableCell({
                              width: { size: 35, type: WidthType.PERCENTAGE },
                              borders: { right: { style: BorderStyle.SINGLE, size: 6, color: COL_NUANCE_BEIGE } },
                              margins: { right: 200 },
                              children: [
                                  new Paragraph({
                                      children: [
                                          new TextRun({ text: (data.header.yearsOfExp || "0").replace(/[^0-9]/g, ''), font: FONT_FAMILY, bold: true, size: 60, color: COL_FAWN }),
                                          new TextRun({ text: " ans", font: FONT_FAMILY, size: 24, bold: true, color: COL_BRUNSWICK }),
                                          new TextRun({ text: "\nd'expérience", font: FONT_FAMILY, size: 20, color: "666666" })
                                      ],
                                      spacing: { after: 300 }
                                  }),

                                  new Paragraph({
                                      children: [
                                          new TextRun({ text: "DISPONIBILITÉ", font: FONT_FAMILY, color: COL_BRUNSWICK, bold: true, size: 20 }),
                                          new TextRun({ text: "\n" + (data.header.availability || "Immédiate"), font: FONT_FAMILY, size: 22, color: COL_TEXT })
                                      ],
                                      spacing: { after: 300 }
                                  }),

                                  // SECTEURS
                                  ...((data.sectors?.length > 0) ? [
                                    new Paragraph({
                                        children: [new TextRun({ text: "SECTEURS", font: FONT_FAMILY, color: COL_BRUNSWICK, bold: true, size: 20 })],
                                        spacing: { after: 100 }
                                    }),
                                    ...data.sectors.slice(0, 5).map(s => new Paragraph({
                                        children: [new TextRun({ text: "■  " + s, font: FONT_FAMILY, size: 20, color: COL_TEXT })],
                                        spacing: { after: 60 }
                                    })),
                                    spacer(300)
                                  ] : []),

                                  // LANGUES
                                  new Paragraph({
                                      children: [new TextRun({ text: "LANGUES", font: FONT_FAMILY, color: COL_BRUNSWICK, bold: true, size: 20 })],
                                      spacing: { after: 100 }
                                  }),
                                  ...data.languages.map(l => new Paragraph({
                                      children: [
                                          new TextRun({ text: l.language.toUpperCase(), font: FONT_FAMILY, bold: true, size: 18 }),
                                          new TextRun({ text: ` (${l.level})`, font: FONT_FAMILY, size: 18, italics: true, color: COL_GRAY_TEXT })
                                      ],
                                      spacing: { after: 60 }
                                  })),
                              ]
                          }),

                          // DROITE
                          new TableCell({
                              width: { size: 65, type: WidthType.PERCENTAGE },
                              margins: { left: 400 },
                              children: [
                                  new Paragraph({
                                      children: [ new TextRun({ text: "COMPÉTENCES CLÉS", font: FONT_FAMILY, color: COL_BRUNSWICK, bold: true, size: 24 }) ],
                                      spacing: { after: 200 }
                                  }),
                                  
                                  ...Object.entries(data.technicalSkills).flatMap(([cat, skills]) => {
                                      if(!skills || skills.length === 0) return [];
                                      return [
                                          new Paragraph({
                                              children: [new TextRun({ text: cat.toUpperCase(), font: FONT_FAMILY, size: 16, bold: true, color: "9CA3AF" })],
                                              spacing: { after: 50, before: 100 },
                                          }),
                                          new Paragraph({
                                              children: [ new TextRun({ text: skills.join("  •  "), font: FONT_FAMILY, size: 20, bold: true, color: COL_BRUNSWICK }) ],
                                              spacing: { after: 100 }
                                          })
                                      ];
                                  }),

                                  spacer(400),

                                  new Paragraph({
                                      children: [new TextRun({ text: "EXPERTISE MÉTIER", font: FONT_FAMILY, color: COL_BRUNSWICK, bold: true, size: 24 })],
                                      spacing: { after: 200 }
                                  }),
                                  ...data.professionalSkills.slice(0, 6).map(skill => new Paragraph({
                                      children: [ new TextRun({ text: "•  " + skill, font: FONT_FAMILY, size: 20 }) ],
                                      spacing: { after: 80 }
                                  })),
                              ]
                          })
                      ]
                  })
              ]
          }),

          // --- EXPÉRIENCES ---

          ...data.experiences.flatMap((exp, index) => {
             const blocks = [];

             blocks.push(new Paragraph({ children: [new PageBreak()] }));

             // 1. HEADER BARRE GRISE (FULL WIDTH)
             blocks.push(
               new Table({
                 ...FULL_WIDTH_OPTS,
                 borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE } },
                 rows: [
                   new TableRow({
                     children: [
                       new TableCell({
                         shading: { fill: COL_NEUTRAL, type: ShadingType.CLEAR },
                         margins: FULL_WIDTH_CELL_MARGINS,
                         children: [
                            new Table({
                                width: { size: 100, type: WidthType.PERCENTAGE },
                                borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE } },
                                rows: [
                                    new TableRow({
                                        children: [
                                            // COLONNE GAUCHE
                                            new TableCell({
                                                width: { size: 70, type: WidthType.PERCENTAGE },
                                                verticalAlign: VerticalAlign.CENTER,
                                                children: [
                                                    new Paragraph({ 
                                                        children: [new TextRun({ text: exp.jobTitle.toUpperCase(), font: FONT_FAMILY, bold: true, color: COL_BRUNSWICK, size: 26 })],
                                                        spacing: { after: 60 }
                                                    }),
                                                    new Paragraph({ 
                                                        children: [new TextRun({ text: exp.client.toUpperCase(), font: FONT_FAMILY, bold: true, color: COL_FAWN, size: 22 })]
                                                    })
                                                ]
                                            }),
                                            // COLONNE DROITE
                                            new TableCell({
                                                width: { size: 30, type: WidthType.PERCENTAGE },
                                                verticalAlign: VerticalAlign.CENTER,
                                                children: [ 
                                                    new Paragraph({ 
                                                        alignment: AlignmentType.RIGHT, 
                                                        children: [new TextRun({ text: exp.dates, font: FONT_FAMILY, size: 20, bold: true, color: "6B7280" })] 
                                                    }) 
                                                ]
                                            })
                                        ]
                                    })
                                ]
                            })
                         ]
                       })
                     ]
                   })
                 ]
               })
             );
             
             blocks.push(spacer(50));

             // 4. ENCART CONTEXTE (FULL WIDTH / BEIGE)
             if (exp.context) {
                blocks.push(
                    new Table({
                        ...FULL_WIDTH_OPTS,
                        borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE } },
                        rows: [
                            new TableRow({
                                children: [
                                    new TableCell({
                                        shading: { fill: COL_NUANCE_BEIGE, type: ShadingType.CLEAR },
                                        margins: { ...FULL_WIDTH_CELL_MARGINS, top: 240, bottom: 400 }, 
                                        children: [
                                            new Paragraph({
                                                children: [ 
                                                    new TextRun({ text: "Contexte : ", font: FONT_FAMILY, bold: true, size: 20, color: COL_TEXT }),
                                                    new TextRun({ text: exp.context, font: FONT_FAMILY, italics: true, size: 20, color: COL_TEXT }) 
                                                ],
                                                alignment: AlignmentType.JUSTIFIED
                                            })
                                        ]
                                    })
                                ]
                            })
                        ]
                    })
                );
                blocks.push(spacer(400));
             }

             // 5. MISSIONS & RÉSULTATS
             
             if (exp.results && exp.results.length > 0) {
                 blocks.push(
                    new Paragraph({
                        children: [new TextRun({ text: "RÉSULTATS CLÉS", font: FONT_FAMILY, color: COL_FAWN, bold: true, size: 20 })],
                        spacing: { after: 100 }
                    }),
                    ...exp.results.map(r => new Paragraph({
                        children: [new TextRun({ text: "• " + r, font: FONT_FAMILY, color: COL_TEXT, size: 20, bold: true })],
                        spacing: { after: 80 }
                    })),
                    spacer(300)
                 );
             }

             blocks.push(
                new Paragraph({
                   children: [new TextRun({ text: "MISSIONS", font: FONT_FAMILY, color: COL_BRUNSWICK, size: 20, bold: true })],
                   spacing: { after: 100 }
               }),
               ...exp.missions.map(m => new Paragraph({
                   children: [
                       new TextRun({ text: "●  ", font: FONT_FAMILY, color: COL_FAWN, size: 18 }),
                       new TextRun({ text: m, font: FONT_FAMILY, size: 20 })
                   ],
                   spacing: { after: 100, line: 320 }
               }))
             );

             blocks.push(spacer(300));

             blocks.push(
                new Paragraph({
                    shading: { fill: COL_NEUTRAL, type: ShadingType.CLEAR, color: "auto" },
                    border: { left: { color: COL_BRUNSWICK, space: 10, style: BorderStyle.SINGLE, size: 24 } },
                    children: [
                        new TextRun({ text: "  ENVIRONNEMENT :  ", font: FONT_FAMILY, color: COL_BRUNSWICK, bold: true, size: 18 }),
                        new TextRun({ text: [
                            ...(exp.technicalEnv.languages || []),
                            ...(exp.technicalEnv.tools || [])
                        ].join("  •  "), font: FONT_FAMILY, size: 18, color: COL_TEXT })
                    ],
                    spacing: { before: 200 }
                })
             );

             return blocks;
          })
        ]
      }
    ]
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `DT_5D_DOCX_${clean(data.header.name).replace(/\s/g, '_')}.docx`);
};

// --- HEADER PAGE 1 & SUIVANTES (PLEINE LARGEUR) ---
function createHeader(logoBuffer: Uint8Array, imgWidth: number, imgHeight: number, imgType: "png" | "jpeg" = "png") {
    return new Header({
        children: [
            new Table({
                ...FULL_WIDTH_OPTS, // FULL WIDTH
                borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE } },
                rows: [
                    new TableRow({
                        height: { value: 1600, rule: HeightRule.EXACT },
                        children: [
                            new TableCell({
                                width: { size: 30, type: WidthType.PERCENTAGE },
                                shading: { fill: COL_BRUNSWICK, type: ShadingType.CLEAR },
                                verticalAlign: VerticalAlign.CENTER,
                                margins: { left: FULL_WIDTH_CELL_MARGINS.left }, // Alignement logo
                                children: [
                                    new Paragraph({
                                        children: [
                                            new ImageRun({
                                                data: logoBuffer,
                                                transformation: { width: imgWidth, height: imgHeight }, // Ratio respecté
                                                type: imgType
                                            })
                                        ]
                                    })
                                ]
                            }),
                            new TableCell({
                                width: { size: 70, type: WidthType.PERCENTAGE },
                                shading: { fill: COL_BRUNSWICK, type: ShadingType.CLEAR },
                                verticalAlign: VerticalAlign.CENTER,
                                margins: { right: FULL_WIDTH_CELL_MARGINS.right },
                                children: [
                                    new Paragraph({
                                        alignment: AlignmentType.RIGHT,
                                        children: [
                                            new TextRun({ text: "Dossier de compétences", color: "FFFFFF", size: 32, font: FONT_FAMILY }),
                                            new TextRun({ text: " ●", color: COL_FAWN, size: 32, font: FONT_FAMILY })
                                        ]
                                    })
                                ]
                            })
                        ]
                    })
                ]
            })
        ]
    });
}

// --- FOOTER STANDARD ---
function createFooter() {
    return new Footer({
        children: [
            new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                    new TextRun({ text: "Pas à pas, agissons au quotidien pour préserver notre environnement.", font: FONT_FAMILY, size: 14, color: "9CA3AF", italics: true }),
                    new TextRun({ text: "   " }),
                    new TextRun({ children: ["Page ", PageNumber.CURRENT, " sur ", PageNumber.TOTAL_PAGES], font: FONT_FAMILY, size: 14, color: "9CA3AF" })
                ],
                border: { top: { color: "E5E7EB", space: 1, style: BorderStyle.SINGLE, size: 6 } },
                spacing: { before: 200 }
            })
        ]
    });
}
