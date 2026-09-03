import mammoth from "mammoth";

export interface ParsedVaultEntry {
  title: string;
  username: string;
  password: string;
  url?: string;
  notes?: string;
}

/**
 * Procesa un archivo DOCX o DOC localmente en el navegador usando mammoth.
 * Extrae tablas o texto estructurado (ej. Servicio: ..., Usuario: ..., Contraseña: ...).
 * No sube el archivo a ningún servidor ni a Firebase Storage.
 */
export async function parseDocxFile(file: File): Promise<ParsedVaultEntry[]> {
  const arrayBuffer = await file.arrayBuffer();
  
  // Extraer el texto bruto e HTML formateado del documento
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const html = result.value;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const entries: ParsedVaultEntry[] = [];

  // 1. Extraer desde tablas si el documento contiene filas de datos
  const tables = doc.querySelectorAll("table");
  tables.forEach((table) => {
    const rows = table.querySelectorAll("tr");
    rows.forEach((row, rowIndex) => {
      const cols = Array.from(row.querySelectorAll("td, th")).map(c => c.textContent?.trim() || "");
      if (cols.length >= 2) {
        // Evitar la fila de encabezados si dice usuario/contraseña
        const firstColLower = cols[0].toLowerCase();
        if (firstColLower.includes("servicio") || firstColLower.includes("sitio") || firstColLower.includes("usuario") || firstColLower.includes("title")) {
          if (rowIndex === 0) return;
        }

        if (cols.length >= 3) {
          entries.push({
            title: cols[0] || "Registro Importado",
            username: cols[1] || "",
            password: cols[2] || "",
            url: cols[3] || "",
            notes: cols.slice(4).join(" ") || ""
          });
        } else if (cols.length === 2) {
          entries.push({
            title: "Registro Importado",
            username: cols[0] || "",
            password: cols[1] || ""
          });
        }
      }
    });
  });

  // 2. Si no se encontraron tablas, parsear líneas de texto por separadores comunes
  if (entries.length === 0) {
    const paragraphs = doc.querySelectorAll("p, li");
    let currentEntry: Partial<ParsedVaultEntry> = {};

    paragraphs.forEach((p) => {
      const text = p.textContent?.trim();
      if (!text) return;

      const lower = text.toLowerCase();
      if (lower.includes("sitio:") || lower.includes("servicio:") || lower.includes("title:")) {
        if (currentEntry.title || currentEntry.username || currentEntry.password) {
          if (currentEntry.username || currentEntry.password) {
            entries.push({
              title: currentEntry.title || "Registro Importado",
              username: currentEntry.username || "",
              password: currentEntry.password || "",
              url: currentEntry.url || "",
              notes: currentEntry.notes || ""
            });
          }
          currentEntry = {};
        }
        currentEntry.title = text.split(":")[sliceAfterColon(text)].trim();
      } else if (lower.includes("usuario:") || lower.includes("email:") || lower.includes("user:")) {
        currentEntry.username = text.substring(text.indexOf(":") + 1).trim();
      } else if (lower.includes("contraseña:") || lower.includes("password:") || lower.includes("pass:")) {
        currentEntry.password = text.substring(text.indexOf(":") + 1).trim();
      } else if (lower.includes("url:") || lower.includes("link:")) {
        currentEntry.url = text.substring(text.indexOf(":") + 1).trim();
      } else if (text.includes(":") || text.includes("-") || text.includes(",")) {
        // Probar si la línea es formato: Titulo, Usuario, Contraseña
        const parts = text.split(/[:,-]/).map(s => s.trim());
        if (parts.length >= 3) {
          entries.push({
            title: parts[0],
            username: parts[1],
            password: parts[2],
            url: parts[3] || ""
          });
        }
      }
    });

    if (currentEntry.username || currentEntry.password) {
      entries.push({
        title: currentEntry.title || "Registro Importado",
        username: currentEntry.username || "",
        password: currentEntry.password || "",
        url: currentEntry.url || "",
        notes: currentEntry.notes || ""
      });
    }
  }

  return entries;
}

function sliceAfterColon(str: string): number {
  return str.indexOf(":") !== -1 ? 1 : 0;
}
