"use client";

import React, { useState, useEffect } from "react";
import { auth, db, initAnalytics } from "@/lib/firebase";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User
} from "firebase/auth";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  onSnapshot,
  query,
  serverTimestamp
} from "firebase/firestore";
import { encryptData, decryptData } from "@/lib/crypto";
import ImportDocxModal from "@/components/ImportDocxModal";
import { ParsedVaultEntry } from "@/lib/docxParser";
import {
  Shield,
  Key,
  Lock,
  Unlock,
  Plus,
  Trash2,
  Edit2,
  Copy,
  Eye,
  EyeOff,
  LogOut,
  Upload,
  Search,
  CheckCircle2,
  AlertCircle,
  ShieldAlert
} from "lucide-react";

interface EncryptedVaultRecord {
  id: string;
  ciphertext: string;
  salt: string;
  iv: string;
  createdAt?: unknown;
}

interface DecryptedVaultRecord {
  id: string;
  title: string;
  username: string;
  password: string;
  url?: string;
  notes?: string;
}

export default function AzVaultApp() {
  // Estado de Autenticación
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [loginEmail, setLoginEmail] = useState<string>("");
  const [loginPassword, setLoginPassword] = useState<string>("");
  const [loginError, setLoginError] = useState<string | null>(null);

  // Estado de Desbloqueo de Bóveda Cifrada
  const [masterPassword, setMasterPassword] = useState<string>("");
  const [isVaultUnlocked, setIsVaultUnlocked] = useState<boolean>(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  // Registros de la Bóveda
  const [encryptedRecords, setEncryptedRecords] = useState<EncryptedVaultRecord[]>([]);
  const [decryptedRecords, setDecryptedRecords] = useState<DecryptedVaultRecord[]>([]);
  const [decryptionError, setDecryptionError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Control de Formulario / Modal para crear o editar
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState<string>("");
  const [formUsername, setFormUsername] = useState<string>("");
  const [formPassword, setFormPassword] = useState<string>("");
  const [formUrl, setFormUrl] = useState<string>("");
  const [formNotes, setFormNotes] = useState<string>("");

  // Modal de Importación DOCX
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Inicializar Firebase Auth y Analytics
  useEffect(() => {
    if (typeof window === "undefined" || !auth || typeof auth.onAuthStateChanged !== "function") {
      setAuthLoading(false);
      return;
    }
    initAnalytics();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (!currentUser) {
        setIsVaultUnlocked(false);
        setMasterPassword("");
        setDecryptedRecords([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Suscribirse a la colección Firestore del usuario en tiempo real: /users/{userId}/vault
  useEffect(() => {
    if (!user) {
      setEncryptedRecords([]);
      return;
    }

    const vaultRef = collection(db, "users", user.uid, "vault");
    const q = query(vaultRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records: EncryptedVaultRecord[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        records.push({
          id: docSnap.id,
          ciphertext: data.ciphertext,
          salt: data.salt,
          iv: data.iv,
          createdAt: data.createdAt
        });
      });
      setEncryptedRecords(records);
    }, (err) => {
      console.error("Error al sincronizar datos de Firestore:", err.message);
    });

    return () => unsubscribe();
  }, [user]);

  // Re-descifrar registros automáticamente con user.uid al iniciar sesión o cambiar registros
  useEffect(() => {
    if (!user) {
      setDecryptedRecords([]);
      return;
    }

    const decryptAll = async () => {
      try {
        setDecryptionError(null);
        const decryptedList: DecryptedVaultRecord[] = [];

        for (const rec of encryptedRecords) {
          try {
            const rawJson = await decryptData(rec.ciphertext, rec.salt, rec.iv, user.uid);
            const parsed = JSON.parse(rawJson);
            decryptedList.push({
              id: rec.id,
              title: parsed.title || "Sin Título",
              username: parsed.username || "",
              password: parsed.password || "",
              url: parsed.url || "",
              notes: parsed.notes || ""
            });
          } catch {
            setDecryptionError("Error al descifrar los datos de la bóveda.");
            return;
          }
        }
        setDecryptedRecords(decryptedList);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Error de descifrado";
        setDecryptionError("Error al descifrar la bóveda: " + errorMsg);
      }
    };

    decryptAll();
  }, [encryptedRecords, user]);

  // Manejar Login de Firebase Authentication con advertencias intimidantes para intrusos
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
    } catch (err: unknown) {
      let message = "⚠️ ACCESO RECHAZADO: Credenciales inválidas. Tu dirección IP ha sido registrada y notificada a los sistemas de seguridad del servidor.";
      if (err && typeof err === "object" && "code" in err) {
        const code = (err as { code: string }).code;
        switch (code) {
          case "auth/invalid-credential":
          case "auth/wrong-password":
          case "auth/user-not-found":
            message = "🛑 INTRUSIÓN DETECTADA: Correo o clave incorrectos. Si continúas intentando adivinar, tu acceso a esta red será inhabilitado permanentemente.";
            break;
          case "auth/too-many-requests":
            message = "🚨 ALERTA DE SEGURIDAD: Demasiados intentos fallidos. Tu conexión ha sido bloqueada temporalmente por sospecha de ataque de fuerza bruta.";
            break;
          case "auth/invalid-email":
            message = "⚠️ FORMATO NO VÁLIDO: El formato de usuario es incorrecto. Este incidente ha sido grabado en el registro de auditoría.";
            break;
          case "auth/network-request-failed":
            message = "📡 ERROR DE CONEXIÓN: Fallo de red al intentar validar las credenciales cibernéticas.";
            break;
          default:
            message = "⛔ FALLO DE AUTENTICACIÓN: Acceso denegado por el protocolo de seguridad AZ VAULT.";
        }
      }
      setLoginError(message);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  // Guardar o Actualizar Registro Cifrado (Usa user.uid como clave de cifrado)
  const handleSaveRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formTitle) return;

    const payload = JSON.stringify({
      title: formTitle,
      username: formUsername,
      password: formPassword,
      url: formUrl,
      notes: formNotes
    });

    const encrypted = await encryptData(payload, user.uid);

    if (editingId) {
      const docRef = doc(db, "users", user.uid, "vault", editingId);
      await updateDoc(docRef, {
        ciphertext: encrypted.ciphertext,
        salt: encrypted.salt,
        iv: encrypted.iv,
        updatedAt: serverTimestamp()
      });
    } else {
      const vaultRef = collection(db, "users", user.uid, "vault");
      await addDoc(vaultRef, {
        ciphertext: encrypted.ciphertext,
        salt: encrypted.salt,
        iv: encrypted.iv,
        createdAt: serverTimestamp()
      });
    }

    resetForm();
  };

  // Eliminar Registro
  const handleDeleteRecord = async (id: string) => {
    if (!user) return;
    if (confirm("¿Estás seguro de eliminar este registro de la bóveda?")) {
      const docRef = doc(db, "users", user.uid, "vault", id);
      await deleteDoc(docRef);
    }
  };

  // Importar desde DOCX (Usa user.uid transparente)
  const handleBatchImport = async (entries: ParsedVaultEntry[]) => {
    if (!user) return;
    const vaultRef = collection(db, "users", user.uid, "vault");

    for (const entry of entries) {
      const payload = JSON.stringify({
        title: entry.title || "Registro Importado",
        username: entry.username || "",
        password: entry.password || "",
        url: entry.url || "",
        notes: entry.notes || ""
      });

      const encrypted = await encryptData(payload, user.uid);
      await addDoc(vaultRef, {
        ciphertext: encrypted.ciphertext,
        salt: encrypted.salt,
        iv: encrypted.iv,
        createdAt: serverTimestamp()
      });
    }
  };

  const resetForm = () => {
    setFormTitle("");
    setFormUsername("");
    setFormPassword("");
    setFormUrl("");
    setFormNotes("");
    setEditingId(null);
    setIsFormOpen(false);
  };

  const handleEditClick = (rec: DecryptedVaultRecord) => {
    setEditingId(rec.id);
    setFormTitle(rec.title);
    setFormUsername(rec.username);
    setFormPassword(rec.password);
    setFormUrl(rec.url || "");
    setFormNotes(rec.notes || "");
    setIsFormOpen(true);
  };

  // Temporizador de Auto-Lock tras 5 minutos de inactividad del usuario
  useEffect(() => {
    if (!user) return;

    let timeoutId: NodeJS.Timeout;
    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handleLogout();
      }, 5 * 60 * 1000); // 5 minutos
    };

    const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart"];
    events.forEach((evt) => window.addEventListener(evt, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      events.forEach((evt) => window.removeEventListener(evt, resetTimer));
    };
  }, [user]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    // Limpiar el portapapeles tras 30 segundos por seguridad
    setTimeout(() => {
      navigator.clipboard.writeText("").catch(() => {});
      setCopiedId(null);
    }, 30000);
  };

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredRecords = decryptedRecords.filter(r =>
    r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.url && r.url.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Estado de Primera Pantalla: Clave Maestra del Sistema antes del Login
  const [isMasterKeyVerified, setIsMasterKeyVerified] = useState<boolean>(false);
  const [systemMasterKey, setSystemMasterKey] = useState<string>("");
  const [systemKeyError, setSystemKeyError] = useState<string | null>(null);

  const handleVerifySystemKey = (e: React.FormEvent) => {
    e.preventDefault();
    setSystemKeyError(null);

    // Validar clave maestra del sistema (Si no hay configurada en env, usar clave por defecto segura)
    const validKey = process.env.NEXT_PUBLIC_SYSTEM_MASTER_KEY || "azinnovationx";

    if (systemMasterKey.trim() === validKey.trim()) {
      setIsMasterKeyVerified(true);
    } else {
      setSystemKeyError("🛑 CLAVE MAESTRA INCORRECTA: Intrusión bloqueada. Tu dirección IP y credenciales locales han sido enviadas al registro de seguridad 24/7.");
      setSystemMasterKey("");
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-100 font-mono">
        <div className="flex items-center space-x-3">
          <Shield className="w-8 h-8 text-cyan-400 animate-pulse" />
          <span className="text-sm font-semibold tracking-wider">Cargando Protocolos AZ VAULT...</span>
        </div>
      </div>
    );
  }

  // 1. PRIMERA PANTALLA: VERIFICACIÓN DE CLAVE MAESTRA DEL SISTEMA
  if (!isMasterKeyVerified) {
    return (
      <div className="relative min-h-screen flex flex-col justify-center items-center px-4 py-12 bg-slate-950 overflow-hidden">
        {/* Imagen de fondo cibernética */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-20 scale-105 transition-transform duration-1000"
          style={{ backgroundImage: "url('/login-bg.jpg')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/95 via-slate-950/90 to-slate-950/95" />
        
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-rose-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl" />

        <div className="relative z-10 w-full max-w-md bg-slate-900/90 border border-rose-500/40 rounded-2xl p-8 shadow-2xl backdrop-blur-md space-y-6">
          
          {/* Encabezado e Icono de Candado Principal */}
          <div className="text-center space-y-3">
            <div className="inline-flex p-3.5 bg-slate-950/80 border border-rose-500/50 rounded-2xl shadow-lg shadow-rose-950/60 mb-1">
              <Lock className="w-10 h-10 text-rose-400 animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-widest font-mono">AZ VAULT</h1>
              <p className="text-[11px] font-mono text-rose-400 uppercase tracking-wider mt-1">
                PRIMERA BARRERA // CLAVE MAESTRA DEL SISTEMA
              </p>
            </div>
          </div>

          {/* ADVERTENCIA INTIMIDANTE AL INTRUSO */}
          <div className="bg-rose-950/50 border border-rose-600/60 rounded-xl p-3.5 space-y-1 text-left shadow-inner">
            <div className="flex items-center space-x-2 text-rose-400 text-xs font-bold font-mono uppercase tracking-wider">
              <ShieldAlert className="w-4 h-4 shrink-0 animate-bounce" />
              <span>[!] ADVERTENCIA — ZONA ALTAMENTE RESTRINGIDA</span>
            </div>
            <p className="text-[11px] text-slate-300 font-mono leading-relaxed pl-6">
              Punto de control primario activado. Esta plataforma está estrictamente <strong className="text-rose-400">monitoreada 24/7</strong>. 
              Ingresar una clave maestra falsa registrará automáticamente tu dispositivo.
              <span className="block mt-1 font-semibold text-rose-300">
                Si no eres un invitado autorizado o eres un simple curioso, por tu seguridad debes retirarte de inmediato.
              </span>
            </p>
          </div>

          {/* Formulario de Clave Maestra */}
          <form onSubmit={handleVerifySystemKey} className="space-y-4">
            <div>
              <label className="block text-xs font-bold font-mono uppercase text-slate-300 mb-1">
                Ingresa la Clave Maestra del Sistema
              </label>
              <input
                type="password"
                required
                autoFocus
                value={systemMasterKey}
                onChange={(e) => setSystemMasterKey(e.target.value)}
                placeholder="••••••••••••••••"
                className="w-full bg-slate-950/90 border border-rose-800/60 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-700 font-mono focus:outline-none focus:border-rose-500 transition-colors shadow-inner"
              />
            </div>

            {systemKeyError && (
              <div className="bg-rose-950/80 border border-rose-700 text-rose-200 text-xs p-3 rounded-lg flex items-start space-x-2 font-mono">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <span>{systemKeyError}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-rose-700 hover:bg-rose-600 text-white font-mono font-bold py-3 rounded-lg text-sm tracking-wider uppercase transition-all shadow-lg shadow-rose-950/60 active:scale-[0.99] flex items-center justify-center space-x-2"
            >
              <Unlock className="w-4 h-4" />
              <span>Desbloquear Primera Barrera</span>
            </button>
          </form>

          <div className="pt-3 border-t border-slate-800/80 text-center">
            <p className="text-[10px] text-slate-500 font-mono">
              FIREWALL LEVEL 1 ACTIVE // UNAUTHORIZED LOGGING ENFORCED
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 2. SEGUNDA PANTALLA: VISTA DE INICIO DE SESIÓN (FIREBASE AUTHENTICATION)
  if (!user) {
    return (
      <div className="relative min-h-screen flex flex-col justify-center items-center px-4 py-12 bg-slate-950 overflow-hidden">
        {/* Imagen de fondo con overlay oscuro profesional */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-25 scale-105 transition-transform duration-1000"
          style={{ backgroundImage: "url('/login-bg.jpg')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/90 via-slate-950/80 to-slate-950/95" />
        
        {/* Efecto de resplandor cian/rojo cibernético */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-rose-600/10 rounded-full blur-3xl" />

        <div className="relative z-10 w-full max-w-md bg-slate-900/90 border border-cyan-500/30 rounded-2xl p-8 shadow-2xl backdrop-blur-md space-y-6">
          
          {/* Encabezado e Icono */}
          <div className="text-center space-y-3">
            <div className="inline-flex p-3.5 bg-slate-950/80 border border-cyan-500/50 rounded-2xl shadow-lg shadow-cyan-950/60 mb-1">
              <Shield className="w-10 h-10 text-cyan-400 animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-widest font-mono">AZ VAULT</h1>
              <p className="text-[11px] font-mono text-cyan-400 uppercase tracking-wider mt-1">
                SYSTEM // ENCRYPTED ACCESS ONLY
              </p>
            </div>
          </div>

          {/* MENSAJE TIPO HACKER / ADVERTENCIA INTIMIDANTE */}
          <div className="bg-rose-950/40 border border-rose-600/50 rounded-xl p-3.5 space-y-1 text-left shadow-inner">
            <div className="flex items-center space-x-2 text-rose-400 text-xs font-bold font-mono uppercase tracking-wider">
              <ShieldAlert className="w-4 h-4 shrink-0 animate-bounce" />
              <span>[!] ADVERTENCIA DEL SISTEMA — ACCESO RESTRINGIDO</span>
            </div>
            <p className="text-[11px] text-slate-300 font-mono leading-relaxed pl-6">
              Área de alta seguridad monitoreada activamente <strong className="text-rose-400">24/7</strong>. 
              Todo intento de ingreso no autorizado, fuerza bruta o intrusión será registrado y rastreado. 
              <span className="block mt-1 font-semibold text-rose-300">
                Si no eres un usuario autorizado o eres un simple curioso, retírate de inmediato.
              </span>
            </p>
          </div>

          {/* Formulario de Login */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold font-mono uppercase text-slate-300 mb-1">
                Identificador / Correo de Acceso
              </label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="usuario@dominio.com"
                className="w-full bg-slate-950/90 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 font-mono focus:outline-none focus:border-cyan-500 transition-colors shadow-inner"
              />
            </div>

            <div>
              <label className="block text-xs font-bold font-mono uppercase text-slate-300 mb-1">
                Clave de Seguridad
              </label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-slate-950/90 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 font-mono focus:outline-none focus:border-cyan-500 transition-colors shadow-inner"
              />
            </div>

            {loginError && (
              <div className="bg-rose-950/70 border border-rose-700 text-rose-200 text-xs p-3 rounded-lg flex items-center space-x-2 font-mono">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-mono font-bold py-3 rounded-lg text-sm tracking-wider uppercase transition-all shadow-lg shadow-cyan-950/60 active:scale-[0.99]"
            >
              Autenticar y Entrar
            </button>
          </form>

          <div className="pt-3 border-t border-slate-800/80 text-center">
            <p className="text-[10px] text-slate-500 font-mono">
              IP TRACE & FIREWALL ACTIVE // AZ VAULT PROTOCOL
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 2. VISTA PRINCIPAL DIRECTA TRAS AUTENTICACIÓN
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-cyan-950 border border-cyan-800 rounded-lg">
              <Shield className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-wide text-white">AZ VAULT</h1>
              <p className="text-[10px] text-emerald-400 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Bóveda Cifrada Activa</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <span className="text-xs text-slate-400 hidden sm:inline">{user.email}</span>
            <button
              onClick={handleLogout}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-rose-400 text-xs px-3 py-1.5 rounded-lg border border-slate-700 flex items-center space-x-1 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Barra de Acciones y Búsqueda */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Buscar credenciales por título, usuario o sitio..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold px-4 py-2 rounded-lg border border-slate-700 flex items-center space-x-2 transition-colors"
            >
              <Upload className="w-4 h-4 text-cyan-400" />
              <span>Importar Word (DOCX)</span>
            </button>
            <button
              onClick={() => {
                resetForm();
                setIsFormOpen(true);
              }}
              className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors shadow-lg shadow-cyan-950/50"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Registro</span>
            </button>
          </div>
        </div>

        {decryptionError && (
          <div className="bg-rose-950/60 border border-rose-800 text-rose-300 text-xs p-4 rounded-xl flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{decryptionError}</span>
          </div>
        )}

        {/* Lista de Registros */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRecords.map((rec) => {
            const isPasswordVisible = visiblePasswords[rec.id];
            const isCopied = copiedId === rec.id;

            return (
              <div
                key={rec.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 flex flex-col justify-between transition-all space-y-3"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <h3 className="font-bold text-white text-base truncate">{rec.title}</h3>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleEditClick(rec)}
                        className="text-slate-400 hover:text-cyan-400 p-1"
                        title="Editar registro"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteRecord(rec.id)}
                        className="text-slate-400 hover:text-rose-400 p-1"
                        title="Eliminar registro"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {rec.username && (
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500">Usuario / Email</span>
                      <p className="text-xs text-slate-300 font-mono select-all truncate">{rec.username}</p>
                    </div>
                  )}

                  {rec.password && (
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500">Contraseña</span>
                      <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded px-2 py-1 mt-0.5">
                        <span className="text-xs font-mono text-cyan-300 truncate">
                          {isPasswordVisible ? rec.password : "••••••••••••"}
                        </span>
                        <div className="flex items-center space-x-1 ml-2">
                          <button
                            onClick={() => togglePasswordVisibility(rec.id)}
                            className="text-slate-400 hover:text-slate-200 p-1"
                          >
                            {isPasswordVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => copyToClipboard(rec.password, rec.id)}
                            className="text-slate-400 hover:text-cyan-400 p-1"
                            title="Copiar contraseña"
                          >
                            {isCopied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {rec.url && (
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500">Sitio Web</span>
                      <p className="text-xs text-slate-400 truncate">
                        <a href={rec.url.startsWith("http") ? rec.url : `https://${rec.url}`} target="_blank" rel="noreferrer" className="hover:underline text-cyan-400">
                          {rec.url}
                        </a>
                      </p>
                    </div>
                  )}

                  {rec.notes && (
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500">Notas</span>
                      <p className="text-xs text-slate-400 whitespace-pre-wrap bg-slate-950/40 p-2 rounded border border-slate-800/60 mt-0.5">
                        {rec.notes}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filteredRecords.length === 0 && (
          <div className="text-center py-16 bg-slate-900/40 rounded-xl border border-slate-800/60">
            <Key className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-300 font-semibold text-sm">No hay registros en la bóveda</p>
            <p className="text-slate-500 text-xs mt-1">
              Agrega una nueva contraseña o importa un archivo DOCX para comenzar.
            </p>
          </div>
        )}
      </main>

      {/* Modal / Formulario para Agregar o Editar Registro */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 text-slate-100 shadow-2xl">
            <div className="flex justify-between items-center pb-3 mb-4 border-b border-slate-800">
              <h3 className="font-bold text-base text-white">
                {editingId ? "Editar Registro" : "Nuevo Registro de Bóveda"}
              </h3>
              <button onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSaveRecord} className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Título / Servicio *</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="ej. Correo Corporativo, Banco..."
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Usuario / Email</label>
                <input
                  type="text"
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  placeholder="ej. usuario@dominio.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Contraseña</label>
                <input
                  type="text"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="Contraseña del servicio"
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">URL Sitio Web</label>
                <input
                  type="text"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://ejemplo.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Notas Adicionales</label>
                <textarea
                  rows={3}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Preguntas de seguridad, tokens, etc."
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 resize-none"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
                >
                  Guardar Cifrado
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Importación DOCX */}
      <ImportDocxModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onConfirmImport={handleBatchImport}
      />
    </div>
  );
}
