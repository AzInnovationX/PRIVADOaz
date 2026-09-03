"use client";

import React, { useState } from "react";
import { parseDocxFile, ParsedVaultEntry } from "@/lib/docxParser";
import { Upload, FileText, Check, Trash2, Edit3, ShieldAlert } from "lucide-react";

interface ImportDocxModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmImport: (entries: ParsedVaultEntry[]) => Promise<void>;
}

export default function ImportDocxModal({ isOpen, onClose, onConfirmImport }: ImportDocxModalProps) {
  const [parsedEntries, setParsedEntries] = useState<ParsedVaultEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsLoading(true);
    setError(null);

    try {
      const entries = await parseDocxFile(file);
      if (entries.length === 0) {
        setError("No se encontraron registros de contraseñas reconocibles en el documento DOCX.");
      } else {
        setParsedEntries(entries);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Error al procesar el documento Word.";
      setError("Error al procesar el archivo DOCX: " + errorMsg);
    } finally {
      setIsLoading(false);
      // Limpiar el input para que no mantenga referencia persistente en memoria DOM
      e.target.value = "";
    }
  };

  const handleEntryChange = (index: number, field: keyof ParsedVaultEntry, value: string) => {
    const updated = [...parsedEntries];
    updated[index] = { ...updated[index], [field]: value };
    setParsedEntries(updated);
  };

  const handleDeleteEntry = (index: number) => {
    setParsedEntries(parsedEntries.filter((_, i) => i !== index));
  };

  const handleConfirm = async () => {
    if (parsedEntries.length === 0) return;
    setIsLoading(true);
    try {
      await onConfirmImport(parsedEntries);
      setParsedEntries([]);
      setFileName(null);
      onClose();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Error desconocido al importar.";
      setError("Error al cifrar e importar los datos: " + errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-3xl w-full p-6 text-slate-100 shadow-2xl my-8">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center space-x-2">
            <FileText className="w-6 h-6 text-cyan-400" />
            <h2 className="text-xl font-bold text-white">Importar Documento Word (DOC/DOCX)</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-lg">✕</button>
        </div>

        <div className="mb-4 bg-cyan-950/40 border border-cyan-800/60 rounded-lg p-3 text-xs text-cyan-300 flex items-start space-x-2">
          <ShieldAlert className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <span>
            <strong>Privacidad garantizada:</strong> El archivo se procesa 100% de manera local en tu navegador. 
            El documento nunca se envía a ningún servidor ni a Firebase Storage. Los registros se cifran con tu Contraseña Maestra antes de sincronizarse.
          </span>
        </div>

        {parsedEntries.length === 0 ? (
          <div className="border-2 border-dashed border-slate-700 hover:border-cyan-500 rounded-xl p-8 text-center transition-colors">
            <Upload className="w-12 h-12 text-slate-500 mx-auto mb-3" />
            <p className="text-sm text-slate-300 font-medium mb-1">
              Selecciona tu archivo Word de contraseñas (.docx / .doc)
            </p>
            <p className="text-xs text-slate-500 mb-4">
              Soporta tablas o texto estructurado (Título, Usuario, Contraseña)
            </p>
            <label className="bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold px-4 py-2 rounded-lg cursor-pointer transition-colors inline-flex items-center space-x-2">
              <span>Seleccionar Archivo</span>
              <input type="file" accept=".docx,.doc" onChange={handleFileChange} className="hidden" />
            </label>
            {isLoading && <p className="text-cyan-400 text-xs mt-3">Analizando archivo localmente...</p>}
            {error && <p className="text-rose-400 text-xs mt-3">{error}</p>}
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs text-slate-400">
                Archivo: <strong>{fileName}</strong> ({parsedEntries.length} registros detectados)
              </span>
              <button
                onClick={() => setParsedEntries([])}
                className="text-xs text-slate-400 hover:text-slate-200 underline"
              >
                Cargar otro archivo
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-3">
              Previsualiza y corrige los datos antes de cifrarlos e importarlos a la bóveda:
            </p>

            <div className="max-h-80 overflow-y-auto space-y-3 pr-2 mb-4">
              {parsedEntries.map((entry, idx) => (
                <div key={idx} className="bg-slate-800/80 border border-slate-700 rounded-lg p-3 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-400">Título / Servicio</label>
                      <input
                        type="text"
                        value={entry.title}
                        onChange={(e) => handleEntryChange(idx, "title", e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-400">Usuario / Email</label>
                      <input
                        type="text"
                        value={entry.username}
                        onChange={(e) => handleEntryChange(idx, "username", e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div className="flex items-end space-x-2">
                      <div className="flex-1">
                        <label className="text-[10px] uppercase font-bold text-slate-400">Contraseña</label>
                        <input
                          type="text"
                          value={entry.password}
                          onChange={(e) => handleEntryChange(idx, "password", e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                        />
                      </div>
                      <button
                        onClick={() => handleDeleteEntry(idx)}
                        className="bg-rose-900/50 hover:bg-rose-800 text-rose-300 p-1.5 rounded"
                        title="Eliminar este registro"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                disabled={isLoading}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center space-x-2 transition-colors disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{isLoading ? "Cifrando e Importando..." : `Confirmar Importación (${parsedEntries.length})`}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
