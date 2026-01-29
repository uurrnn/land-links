# Isometric Golf Game - Project Overview

## Project Description
This project is a web-based isometric golf game developed using **Phaser 3** and **Vite**. The current implementation focuses on a **Level Editor** that allows users to design golf courses on an isometric grid.

## Tech Stack
*   **Language:** JavaScript (ES Modules)
*   **Game Framework:** [Phaser 3](https://phaser.io/)
*   **Build Tool:** [Vite](https://vitejs.dev/)

## Architecture & Key Files

### Entry Point
*   `index.html`: The HTML entry point. It contains the `#app` container where the game renders.
*   `src/main.js`: The JavaScript entry point. It initializes the `Phaser.Game` instance, configures the game (dimensions, physics, parent container), and registers the scenes.

### Scenes (`src/scenes/`)
The game logic is divided into Phaser Scenes:

1.  **`MainMenuScene.js`**:
    *   The initial scene.
    *   Displays the game title.
    *   Provides a "Level Editor" button to transition to the editor scene.

2.  **`LevelEditorScene.js`**:
    *   **Core Functionality:** Implements the isometric grid and editing tools.
    *   **Texture Generation:** Programmatically generates textures for tiles (grass, sand, water, etc.) and decorations (trees, bushes) using `Phaser.GameObjects.Graphics` in the `generateTileTextures` method.
    *   **Grid System:** Manages a 2D array (`this.gridData`) representing the map. Converts grid coordinates to isometric screen coordinates (`gridToIso`).
    *   **Camera:** Supports panning via arrow keys and middle-mouse drag.
    *   **Interaction:**
        *   **UI:** Left-side panel for selecting tile types, changing elevation, and placing decorations.
        *   **Painting:** Left-click (or drag) on the grid to apply the selected tile/decoration.

## Building and Running

### Prerequisites
*   Node.js and npm installed.

### Commands
*   **Install Dependencies:**
    ```bash
    npm install
    ```
*   **Start Development Server:**
    ```bash
    npm run dev
    ```
    This starts a local server (typically at `http://localhost:5173`) with hot module replacement.
*   **Build for Production:**
    ```bash
    npm run build
    ```
    Generates optimized static assets in the `dist/` directory.
*   **Preview Production Build:**
    ```bash
    npm run preview
    ```

## Development Conventions
*   **Scene Management:** New game states should be created as separate classes extending `Phaser.Scene` and added to the `scene` array in `src/main.js`.
*   **Assets:** Currently, assets are generated procedurally. Future static assets (images, audio) should be placed in the `public/` directory or imported relative to the source files.
*   **Input Handling:** Phaser's input system is used. Note the distinction between pointer events on GameObjects (`gameobjectdown`) and global input events.
