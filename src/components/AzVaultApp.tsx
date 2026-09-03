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

  // State del modal de importación removido por limpieza de interfaz

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

  // 2. VISTA PRINCIPAL DIRECTA TRAS AUTENTICACIÓN (PANEL MODERNO CYBER GLASS)
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header Superior Moderno */}
      <header className="bg-slate-900/80 border-b border-slate-800/80 backdrop-blur-md sticky top-0 z-30 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-slate-950 border border-cyan-500/40 rounded-xl shadow-md shadow-cyan-950/50">
              <Shield className="w-5 h-5 text-cyan-400 animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-widest text-white font-mono">AZ VAULT</h1>
              <p className="text-[10px] text-emerald-400 font-mono flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="uppercase tracking-wider">Cifrado AES-256 Activo</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden md:flex items-center space-x-2 bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800/80 font-mono text-xs text-slate-300">
              <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
              <span>{user.email}</span>
            </div>
            <button
              onClick={handleLogout}
              className="bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-rose-100 text-xs font-mono font-semibold px-3.5 py-2 rounded-xl border border-rose-800/60 flex items-center space-x-1.5 transition-all shadow-md active:scale-95"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        
        {/* Banner Superior & Barra de Acciones */}
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl backdrop-blur-md shadow-xl">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              placeholder="Buscar credencial por servicio, usuario o sitio web..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950/90 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors shadow-inner"
            />
          </div>

          <div className="flex items-center justify-between md:justify-end space-x-3">
            <span className="text-xs font-mono text-slate-400 px-2">
              Registros: <strong className="text-cyan-400">{filteredRecords.length}</strong>
            </span>
            <button
              onClick={() => {
                resetForm();
                setIsFormOpen(true);
              }}
              className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-bold px-5 py-2.5 rounded-xl flex items-center space-x-2 transition-all shadow-lg shadow-cyan-950/60 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Agregar Contraseña</span>
            </button>
          </div>
        </div>

        {decryptionError && (
          <div className="bg-rose-950/70 border border-rose-700 text-rose-200 text-xs p-4 rounded-2xl flex items-center space-x-2 font-mono">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
            <span>{decryptionError}</span>
          </div>
        )}

        {/* Tarjetas de Registros Cifrados (Cyber Glass Grid) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredRecords.map((rec) => {
            const isPasswordVisible = visiblePasswords[rec.id];
            const isCopiedPass = copiedId === rec.id;
            const isCopiedUser = copiedId === `${rec.id}-user`;

            return (
              <div
                key={rec.id}
                className="group relative bg-slate-900/70 border border-slate-800/80 hover:border-cyan-500/50 rounded-2xl p-5 flex flex-col justify-between transition-all duration-300 shadow-xl hover:shadow-2xl hover:shadow-cyan-950/30 backdrop-blur-sm space-y-4"
              >
                <div className="space-y-3">
                  {/* Título y Botones de Acción */}
                  <div className="flex items-start justify-between border-b border-slate-800/80 pb-3">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="p-2 bg-slate-950 rounded-lg border border-slate-800 group-hover:border-cyan-500/40 transition-colors">
                        <Key className="w-4 h-4 text-cyan-400" />
                      </div>
                      <h3 className="font-bold text-white text-base font-mono truncate">{rec.title}</h3>
                    </div>
                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        onClick={() => handleEditClick(rec)}
                        className="text-slate-400 hover:text-cyan-400 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                        title="Editar registro"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteRecord(rec.id)}
                        className="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                        title="Eliminar registro"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Campo de Usuario con Botón de Copiado */}
                  {rec.username && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono uppercase font-bold text-slate-400">Usuario / Email</span>
                      <div className="flex items-center justify-between bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-1.5">
                        <span className="text-xs font-mono text-slate-200 truncate select-all">{rec.username}</span>
                        <button
                          onClick={() => copyToClipboard(rec.username, `${rec.id}-user`)}
                          className="text-slate-400 hover:text-cyan-400 p-1 ml-2 shrink-0 transition-colors"
                          title="Copiar usuario"
                        >
                          {isCopiedUser ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Campo de Contraseña con Ojo y Copiado Rápido */}
                  {rec.password && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono uppercase font-bold text-slate-400">Contraseña</span>
                      <div className="flex items-center justify-between bg-slate-950/90 border border-slate-800 rounded-xl px-3 py-1.5">
                        <span className="text-xs font-mono text-cyan-300 truncate">
                          {isPasswordVisible ? rec.password : "••••••••••••••••"}
                        </span>
                        <div className="flex items-center space-x-1.5 ml-2 shrink-0">
                          <button
                            onClick={() => togglePasswordVisibility(rec.id)}
                            className="text-slate-400 hover:text-slate-200 p-1 transition-colors"
                            title={isPasswordVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
                          >
                            {isPasswordVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => copyToClipboard(rec.password, rec.id)}
                            className="text-slate-400 hover:text-cyan-400 p-1 transition-colors"
                            title="Copiar contraseña"
                          >
                            {isCopiedPass ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* URL / Sitio Web */}
                  {rec.url && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono uppercase font-bold text-slate-400">Sitio Web</span>
                      <p className="text-xs font-mono text-cyan-400 truncate">
                        <a href={rec.url.startsWith("http") ? rec.url : `https://${rec.url}`} target="_blank" rel="noreferrer" className="hover:underline">
                          {rec.url}
                        </a>
                      </p>
                    </div>
                  )}

                  {/* Notas Adicionales */}
                  {rec.notes && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono uppercase font-bold text-slate-400">Notas / Tokens</span>
                      <p className="text-xs font-mono text-slate-400 whitespace-pre-wrap bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
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
          <div className="text-center py-20 bg-slate-900/40 rounded-2xl border border-slate-800/60 space-y-3">
            <div className="inline-flex p-4 bg-slate-950 border border-slate-800 rounded-2xl">
              <Key className="w-10 h-10 text-slate-600" />
            </div>
            <p className="text-slate-200 font-mono font-bold text-sm">No hay contraseñas en tu bóveda</p>
            <p className="text-slate-500 font-mono text-xs max-w-sm mx-auto">
              Haz clic en <strong>"Agregar Contraseña"</strong> para guardar y cifrar tus credenciales de forma segura.
            </p>
          </div>
        )}
      </main>

      {/* Modal / Formulario para Agregar o Editar Registro */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <h3 className="font-bold font-mono text-base text-white">
                {editingId ? "Editar Credencial" : "Nueva Credencial Cifrada"}
              </h3>
              <button onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-white text-lg">✕</button>
            </div>

            <form onSubmit={handleSaveRecord} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold font-mono uppercase text-slate-400 mb-1">Título / Servicio *</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="ej. Banco, Facebook, GitHub..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold font-mono uppercase text-slate-400 mb-1">Usuario / Email</label>
                <input
                  type="text"
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  placeholder="ej. usuario@dominio.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold font-mono uppercase text-slate-400 mb-1">Contraseña</label>
                <input
                  type="text"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="Contraseña del servicio"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold font-mono uppercase text-slate-400 mb-1">URL / Sitio Web</label>
                <input
                  type="text"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://ejemplo.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold font-mono uppercase text-slate-400 mb-1">Notas / Claves Adicionales</label>
                <textarea
                  rows={3}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Preguntas de seguridad, tokens, NIPs..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500 resize-none"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-bold"
                >
                  Guardar Cifrado
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
