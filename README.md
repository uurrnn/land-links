# Isometric Golf Game - Level Editor

A web-based isometric level editor for a golf game, built with [Phaser 3](https://phaser.io/) and [Vite](https://vitejs.dev/).

## 🎮 Features

- **Isometric Grid System:** 50x50 tile grid with depth sorting.
- **Terrain Painting:** multiple terrain types including Grass, Fairway, Rough, Sand, and Water.
- **Hole Construction Workflow:**
  1.  **Place Tee**: Start a new hole.
  2.  **Place Cup**: Defines the target. Auto-generates a Green tile.
  3.  **Build Hole**: Paint fairways, rough, and hazards.
  4.  **Finalize**: Press `H` to complete the hole.
- **Elevation Control:** Raise and lower terrain height.
- **Decorations:** Place Trees, Bushes, Benches to populate the world.
- **Dynamic Preview:** See a ghosted preview of your selected tool before placing.
- **Editing:** Click existing Tees to edit previously finalized holes.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- [npm](https://www.npmjs.com/)

### Installation

1.  Clone the repository (if applicable) or download the source.
2.  Install dependencies:
    ```bash
    npm install
    ```

### Running the Editor

Start the development server:
```bash
npm run dev
```
Open your browser and navigate to the URL shown in the terminal (usually `http://localhost:5173`).

## 🕹️ Controls

| Input | Action |
| :--- | :--- |
| **Left Click** | Paint Tile / Place Object / Select Button |
| **Middle Click + Drag** | Pan Camera |
| **WASD / Arrows** | Pan Camera |
| **H Key** | Finalize Current Hole |
| **ESC Key** | Pause Game |

## 🛠️ Project Structure

- `src/main.js`: Entry point, game configuration.
- `src/scenes/`: Phaser Scenes (MainMenu, LevelEditor, Pause).
- `src/objects/`: Custom game objects (if any).
- `src/consts/GameConfig.js`: Global constants (Colors, Grid Size, Tile Types).
- `src/utils/IsoUtils.js`: Isometric projection math.
- `src/assets/`: Static assets (images, audio).

## 🎨 Customization

You can tweak game constants in `src/consts/GameConfig.js`:
- Change tile colors (`TILE_TYPES`)
- Adjust grid size (`GRID_SIZE`)
- Modify UI colors (`UI_COLORS`)

## 📜 License

Private / Proprietary
