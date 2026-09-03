/**
 * Módulo de Cifrado de la Bóveda con Web Crypto API (AES-GCM + PBKDF2).
 * 
 * - Deriva una clave simétrica de 256 bits a partir de la contraseña maestra utilizando PBKDF2 (SHA-256) y 100,000 iteraciones.
 * - Cifra las credenciales usando AES-GCM con un vector de inicialización (IV) aleatorio único de 12 bytes por cada registro.
 * - La contraseña maestra NUNCA se almacena en Firestore ni en disco.
 */

// Utilidades para conversión de ArrayBuffer y Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Derivar clave de cifrado AES-256-GCM usando PBKDF2
export async function deriveKey(masterPassword: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(masterPassword),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Cifrar un objeto o texto usando la clave derivada
export async function encryptData(data: string, masterPassword: string): Promise<{ ciphertext: string; salt: string; iv: string }> {
  const encoder = new TextEncoder();
  const encodedData = encoder.encode(data);

  // Generar Salt e IV criptográficamente seguros
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const key = await deriveKey(masterPassword, salt);

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv
    },
    key,
    encodedData
  );

  return {
    ciphertext: arrayBufferToBase64(encryptedBuffer),
    salt: arrayBufferToBase64(salt.buffer as ArrayBuffer),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer)
  };
}

// Descifrar el texto original usando la contraseña maestra y los parámetros (salt, iv)
export async function decryptData(ciphertext: string, saltBase64: string, ivBase64: string, masterPassword: string): Promise<string> {
  const salt = new Uint8Array(base64ToArrayBuffer(saltBase64));
  const iv = new Uint8Array(base64ToArrayBuffer(ivBase64));
  const encryptedBuffer = base64ToArrayBuffer(ciphertext);

  const key = await deriveKey(masterPassword, salt);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv
    },
    key,
    encryptedBuffer
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}
