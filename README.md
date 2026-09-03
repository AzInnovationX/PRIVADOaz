# AZ VAULT — Bóveda Cifrada de Contraseñas

Az Vault es una aplicación web segura para la gestión de contraseñas y credenciales cifradas con integración directa al proyecto Firebase **`contraaz`**.

## 🚀 Características Principales

1. **Autenticación con Firebase Authentication**: Control de acceso estricto mediante Email y Contraseña. NINGUNA credencial está codificada en el código fuente.
2. **Bóveda Cifrada de Extremo a Extremo**:
   - Cifrado local utilizando la **Web Crypto API (AES-GCM 256 bits + PBKDF2)**.
   - La **Contraseña Maestra** se procesa en la memoria local del navegador y NUNCA se envía a Firestore ni a ningún servidor.
3. **Reglas de Seguridad de Firestore**:
   - Acceso restringido por usuario en `/users/{userId}/vault/{entryId}`.
   - Las reglas comprueban `request.auth.uid == userId` impidiendo la lectura o modificación cruzada entre usuarios.
4. **Importación Local de Documentos Word (DOC/DOCX)**:
   - Procesamiento e importación en cliente con `mammoth`.
   - Muestra previsualización y permite edición previa a la importación.
   - **No usa Firebase Storage**: El archivo Word no se sube ni se almacena externamente. Los datos se cifran localmente y la memoria temporal del archivo se libera.
5. **Privacidad & Analytics Cero Sensible**:
   - Integración opcional de Google Analytics sin registrar eventos con contraseñas, correos ni datos privados.

---

## ⚙️ Configuración del Entorno

1. Copiar el archivo de plantilla a `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Completar las variables de entorno en `.env.local` con las credenciales de Firebase:
   ```text
   NEXT_PUBLIC_FIREBASE_API_KEY=TU_API_KEY_DE_FIREBASE
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=contraaz.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=contraaz
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=contraaz.firebasestorage.app
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=189421046439
   NEXT_PUBLIC_FIREBASE_APP_ID=1:189421046439:web:8cc25524e0dc3768f4a982
   NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-3C4ETYPWRR
   ```
   > ⚠️ **Nota:** El archivo `.env.local` está incluido en `.gitignore` y **NUNCA** debe subirse a GitHub.

---

## 🔒 Datos Ficticios de Desarrollo

Durante el desarrollo o pruebas locales se utilizan únicamente credenciales ficticias:

- **Correo demo:** `demo@example.com`
- **Contraseña demo:** `PASSWORD-DEMO-123`

La cuenta administrativa real se debe dar de alta directamente en el panel de **Firebase Authentication**.

---

## 🛠️ Ejecución Local y Despliegue en Vercel

### Desarrollo Local
```bash
npm install
npm run dev
```

### Compilación y Prueba de Producción
```bash
npm run build
npm run start
```

### Despliegue en Vercel
1. Conectar el repositorio de GitHub a Vercel.
2. Agregar las variables de entorno `NEXT_PUBLIC_FIREBASE_*` en los ajustes del proyecto en Vercel.
3. Desplegar.

---

## 🛡️ Reglas de Seguridad de Firestore (`firestore.rules`)

Asegurar las reglas en el panel de Firebase console:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/vault/{entryId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```
