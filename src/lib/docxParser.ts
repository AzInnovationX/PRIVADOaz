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
  let html = "";
  let rawText = "";

  // 1. Intentar procesar como archivo .docx moderno (ZIP XML) con mammoth
  try {
    const result = await mammoth.convertToHtml({ arrayBuffer });
    html = result.value;
    rawText = result.value.replace(/<[^>]+>/g, " ");
  } catch (docxErr: unknown) {
    console.warn("No es un archivo .docx ZIP estándar. Extrayendo texto directamente (Soporte .doc / binario)...", docxErr);
    // 2. Si falla (ej. es un archivo .doc antiguo de Word 97-2003 o texto binario), extraer el texto visible
    const decoder = new TextDecoder("utf-8", { fatal: false });
    rawText = decoder.decode(arrayBuffer);
    // Limpiar caracteres de control binarios
    rawText = rawText.replace(/[\x00-\x09\x0B-\x1F\x7F-\x9F]/g, " ");
  }

  const entries: ParsedVaultEntry[] = [];

  // Parsear mediante HTML si mammoth funcionó
  if (html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // a. Tablas
    const tables = doc.querySelectorAll("table");
    tables.forEach((table) => {
      const rows = table.querySelectorAll("tr");
      rows.forEach((row, rowIndex) => {
        const cols = Array.from(row.querySelectorAll("td, th")).map(c => c.textContent?.trim() || "");
        if (cols.length >= 2) {
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
  }

  // b. Si no se generaron registros por tablas o proviene de un archivo .doc binario/texto
  if (entries.length === 0 && rawText) {
    const lines = rawText.split(/\r?\n|\r/).map(l => l.trim()).filter(Boolean);
    let currentEntry: Partial<ParsedVaultEntry> = {};

    lines.forEach((line) => {
      const lower = line.toLowerCase();
      if (lower.includes("sitio:") || lower.includes("servicio:") || lower.includes("title:") || lower.includes("nombre:")) {
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
        currentEntry.title = line.substring(line.indexOf(":") + 1).trim();
      } else if (lower.includes("usuario:") || lower.includes("email:") || lower.includes("user:") || lower.includes("correo:")) {
        currentEntry.username = line.substring(line.indexOf(":") + 1).trim();
      } else if (lower.includes("contraseña:") || lower.includes("password:") || lower.includes("pass:") || lower.includes("clave:")) {
        currentEntry.password = line.substring(line.indexOf(":") + 1).trim();
      } else if (lower.includes("url:") || lower.includes("link:") || lower.includes("web:")) {
        currentEntry.url = line.substring(line.indexOf(":") + 1).trim();
      } else if (line.includes(":") || line.includes("-") || line.includes("\t") || line.includes(",")) {
        const parts = line.split(/[:,\t-]/).map(s => s.trim()).filter(Boolean);
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
