# DeskAll

Launcher de escritorio + gestor de clipboard para **Windows** y **macOS**, hecho con **Tauri 2** + React + TypeScript.

## Qué hace

- **Escritorio / launcher**: añade apps, juegos, carpetas, archivos y URLs. Doble clic para abrir, arrastra para reordenar, menú contextual para renombrar o eliminar.
- **Clipboard**: captura el historial de texto, fijar favoritos, buscar y volver a copiar con un clic.
- Datos guardados en local con `tauri-plugin-store`.

## Requisitos

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install)
- Windows: WebView2 + **MSVC** (Visual Studio Build Tools / Community con “Desktop development with C++”)
  - No uses el toolchain GNU/MinGW: falla con `export ordinal too large`
  - Actívalo con: `rustup default stable-x86_64-pc-windows-msvc`
- macOS 10.15+

## Desarrollo

```bash
npm install
npm run tauri dev
```

## Build (instalador)

```bash
# Windows (.msi / .exe)
npm run tauri build

# En un Mac, el mismo comando genera .app / .dmg
npm run tauri build
```

Los artefactos quedan en `src-tauri/target/release/bundle/`.

## Uso rápido

1. En **Escritorio**, pulsa **Añadir** o arrastra archivos/carpetas a la ventana.
2. Doble clic en un icono para lanzarlo.
3. Cambia a **Clipboard**, copia texto en cualquier app y reutilízalo desde el historial.

## Stack

- Tauri 2
- React 19 + Vite 7 + Tailwind CSS 4
- Plugins: dialog, clipboard-manager, store, fs, opener
