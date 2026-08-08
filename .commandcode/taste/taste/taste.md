# Taste
- Communicates in Spanish and expects responses in Spanish. Confidence: 0.85
- Sends screenshots/images with brief text instructions ("arregla opciones", etc.) to report UI issues, expecting the assistant to visually inspect the image to understand the problem. Confidence: 0.8
- Prefers context-sensitive UI: options and actions in context menus should only appear when they make sense for the selected item type (e.g., "Mover a Apps"/"Mover a Juegos" hidden for folders and regular files like PDFs/docs/images, shown only for game/app items). Confidence: 0.65
- Prefers custom in-app modals/dialogs styled consistently with the app's design system over invoking system-native dialogs (e.g., a custom "Abrir con…" modal instead of the Windows `OpenAs` system dialog). Confidence: 0.75
- For "Abrir con…" (Open With) functionality, prefers showing only the applications the operating system suggests for that specific file type or folder (e.g., via Windows registry ProgIDs, OpenWithProgids, and user MRU data), rather than listing all installed applications. Confidence: 0.8
- DeskAll itself should never appear in its own selection lists, pickers, or dialogs (e.g., the "Abrir con…" modal should filter out DeskAll entries by name and path). Confidence: 0.7
- Prefers disabling text/element selection across the entire app UI so that no blue browser-like selection highlight appears when clicking or dragging the mouse (app-like feel, not web-like). Confidence: 0.7
- Prefers that the close button (X) minimizes to tray by default. Explicit quit should be a secondary action (e.g., via Shift+click or a separate "Quit" menu item). Confidence: 0.85
