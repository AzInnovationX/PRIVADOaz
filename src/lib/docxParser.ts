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
    // Convertir el HTML a texto conservando saltos de línea para secciones
    const tempDiv = typeof window !== "undefined" ? document.createElement("div") : null;
    if (tempDiv) {
      tempDiv.innerHTML = html.replace(/<\/(p|tr|li|h1|h2|h3|div)>/gi, "\n");
      rawText = tempDiv.textContent || "";
    } else {
      rawText = result.value.replace(/<[^>]+>/g, "\n");
    }
  } catch (docxErr: unknown) {
    console.warn("Extrayendo texto directamente (Soporte .doc / binario)...", docxErr);
    const decoder = new TextDecoder("utf-8", { fatal: false });
    rawText = decoder.decode(arrayBuffer);
    // Limpiar caracteres de control binarios pero conservar saltos de línea
    rawText = rawText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, " ");
  }

  const entries: ParsedVaultEntry[] = [];

  // a. Extraer desde tablas HTML si mammoth funcionó
  if (html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
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

  // b. Algoritmo inteligente por bloques para documentos en formato de texto / viñetas
  if (rawText) {
    const lines = rawText
      .split(/\r?\n/)
      .map(l => l.replace(/^[•\-\*═\s]+/, "").trim())
      .filter(l => l.length > 0 && !l.startsWith("═"));

    let currentSection = "";
    let currentTitle = "";
    let currentUsername = "";
    let currentPassword = "";
    let currentUrl = "";
    const currentNotes: string[] = [];

    const flushCurrent = () => {
      if (currentTitle || currentUsername || currentPassword) {
        const finalTitle = currentTitle || currentSection || "Registro Importado";
        entries.push({
          title: finalTitle,
          username: currentUsername,
          password: currentPassword,
          url: currentUrl,
          notes: currentNotes.join(" | ")
        });
      }
      currentTitle = "";
      currentUsername = "";
      currentPassword = "";
      currentUrl = "";
      currentNotes.length = 0;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();

      // Ignorar encabezados estéticos o notas al pie generales
      if (lower.includes("información de negocio") || lower.includes("documento confidencial") || lower.includes("nota importante")) {
        continue;
      }

      // Si es un título de sección en mayúsculas (ej: REDES SOCIALES, GITHUB, BANCA Y FINANZAS)
      if (line === line.toUpperCase() && line.length > 3 && !line.includes(":") && !line.includes("@")) {
        currentSection = line;
        continue;
      }

      // 1. Detectar líneas con formato directo: "Cuenta STRIPE usuario@gmail.com password123"
      if (lower.startsWith("cuenta ") || lower.startsWith("correo ")) {
        flushCurrent();
        const parts = line.split(/\s+/);
        currentTitle = parts.slice(0, 2).join(" ");
        for (let p = 2; p < parts.length; p++) {
          if (parts[p].includes("@")) {
            currentUsername = parts[p];
          } else if (!currentPassword && parts[p].length > 3) {
            currentPassword = parts[p];
          }
        }
        flushCurrent();
        continue;
      }

      // 2. Detectar etiquetas clave: Email:, Contraseña:, Usuario:, Teléfono:, Banca:
      if (lower.startsWith("email:") || lower.startsWith("correo:") || lower.startsWith("usuario:") || lower.startsWith("user:") || lower.startsWith("banca móvil:") || lower.startsWith("banca:")) {
        const val = line.substring(line.indexOf(":") + 1).trim();
        if (!currentUsername) currentUsername = val;
        else currentNotes.push(line);
      } else if (lower.startsWith("contraseña:") || lower.startsWith("password:") || lower.startsWith("pass:") || lower.startsWith("clave:") || lower.startsWith("pin:") || lower.startsWith("código:") || lower.startsWith("token:")) {
        const val = line.substring(line.indexOf(":") + 1).trim();
        if (!currentPassword) currentPassword = val;
        else currentNotes.push(line);
      } else if (lower.startsWith("url:") || lower.startsWith("link:") || lower.startsWith("sitio:") || lower.startsWith("web:")) {
        currentUrl = line.substring(line.indexOf(":") + 1).trim();
      } else if (lower.startsWith("teléfono:") || lower.startsWith("número:") || lower.startsWith("firma:") || lower.startsWith("kali mensajes:")) {
        currentNotes.push(line);
      } else if (line.includes(":") && !line.includes("http")) {
        // Línea con formato "Clave: Valor"
        const parts = line.split(":");
        const label = parts[0].trim();
        const value = parts.slice(1).join(":").trim();

        if (label === label.toUpperCase() && label.length > 2) {
          // Es un título de servicio (ej: GOOGLE ADMOB, PAYPAL, FACEBOOK PRINCIPAL)
          flushCurrent();
          currentTitle = label;
          if (value) currentNotes.push(value);
        } else {
          currentNotes.push(line);
        }
      } else {
        // Si es un nombre de servicio solo (ej: GOOGLE ADMOB, BANCOMER, SANTANDER, TIK TOK)
        if (line === line.toUpperCase() && line.length > 2 && !line.includes("@")) {
          flushCurrent();
          currentTitle = line;
        } else if (line.includes("@")) {
          // Si contiene un email suelto
          if (!currentUsername) {
            currentUsername = line;
          } else {
            flushCurrent();
            currentUsername = line;
          }
        } else {
          // Si es un dato suelto (ej. contraseña suelta o nota)
          if (!currentPassword && line.length > 3 && !line.includes(" ")) {
            currentPassword = line;
          } else {
            currentNotes.push(line);
          }
        }
      }
    }

    flushCurrent();
  }

  return entries;
}
