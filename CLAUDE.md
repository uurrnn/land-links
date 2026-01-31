# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install       # Install dependencies
npm run dev       # Start Vite dev server (http://localhost:5173)
npm run build     # Production build to dist/
npm run preview   # Preview production build
```

No test framework is configured. No linter is configured.

## Architecture

This is a **Phaser 3** web game (JavaScript ES Modules, bundled with Vite) implementing an isometric golf course level editor with playable golf simulation.

**Game resolution:** 1280x720, mounted to `#app` div. Physics: Phaser Arcade.

### Scene Flow

`MainMenuScene` -> `LevelEditorScene` <-> `PauseScene` (overlay via ESC) / `CourseCompleteScene` (overlay on course finish)

- **MainMenuScene** - Title screen, save slot management (3 localStorage slots), JSON import
- **LevelEditorScene** - Core editor: isometric grid rendering, tile painting, decoration placement, hole construction workflow (place tee -> place cup -> paint terrain -> press H to finalize), elevation control, camera pan/zoom/rotation. Contains playable golf mode with stroke tracking and multi-hole progression.
- **PauseScene** - Pause overlay with resume/save/quit
- **CourseCompleteScene** - Course completion summary showing hole-by-hole stroke breakdown and total score

### Core Systems

- **Isometric projection** (`src/utils/IsoUtils.js`) - Grid-to-screen coordinate conversion for the isometric view
- **Procedural asset generation** (`src/utils/AssetGenerator.js`) - All textures (tiles, decorations, actors) are generated at runtime via Phaser Graphics API; no image files are used
- **Golf mechanics** (`src/objects/GolfSystem.js`) - Ball physics, aiming arc, swing power, rolling simulation. Stroke tracking, multi-hole progression, out-of-bounds detection with penalty. Terrain physics (friction, bounce, roll) are configured via `TERRAIN_PHYSICS` in GameConfig. Completes with course summary showing stroke breakdown.
- **History/Undo** (`src/objects/HistoryManager.js`) - Batch-based undo/redo system for tile edits. Takes a scene reference and manages undo/redo stacks. Called via `this.history.startBatch()`, `endBatch()`, `getTileState()`, `recordChange()`, `undo()`, `redo()`
- **Save/Load** (`src/utils/SaveManager.js`) - Centralized save/load utilities: `serializeGrid()`, `saveToSlot()`, `loadSlotData()`, `exportToFile()`, `importFromFile()`, `findEmptySlot()`, `findMostRecentSave()`. All localStorage keys use the `SAVE_KEY_PREFIX` constant
- **Configuration** (`src/consts/GameConfig.js`) - Centralized constants for all shared values:
  - **Grid/Tile**: `GRID_SIZE` (72x72), `TILE_SIZE` (64x32), `TILE_TYPES`, `DECO_TYPES`, `DECO_NAMES`
  - **State Machine**: `EDITOR_STATES` (`IDLE`, `PLACING_TEE`, `CONSTRUCTING`, `PLAYING`)
  - **Physics**: `TERRAIN_PHYSICS` (friction, bounceMult, rollMult per terrain type)
  - **Save System**: `SAVE_KEY_PREFIX`, `SAVE_SLOTS` (array `[1, 2, 3]`), `AUTO_SLOT_ID` (string `'auto'` for autosave)
  - **UI Layout**: `UI_LAYOUT` (`SIDEBAR_WIDTH`, `SIDEBAR_PADDING`, `BUTTON_WIDTH`)
  - **Colors**: `UI_COLORS`, `NOTIFY_COLORS` (`error`, `success`, `info`, `warning`, `water`, `sand`)
  - **Styling**: `TEXT_STYLES` (presets: `title`, `heading`, `button`, `buttonSmall`, `sectionLabel`, `sidebarBtn`, `label`, `labelSmall`, `body`, `popup`, `popupBtn`, `notification`)
  - **Rendering**: `DEPTH` (`PREVIEW: 5000`, `UI: 10000`, `HUD: 10100`, `OVERLAY: 20000`)
  - **Factories**: `createEmptyTile()` - returns a default tile object
- **UI** (`src/ui/Button.js`) - Reusable button component used across scenes

### Utility Functions

**IsoUtils.js:**
- `isoToScreen(gridX, gridY, tileWidth, tileHeight, centerX, centerY, heightOffset)` - Convert grid to screen coordinates
- `screenToIso(screenX, screenY, tileWidth, tileHeight, centerX, centerY)` - Convert screen to grid coordinates

**LevelEditorScene.js (internal helpers):**
- `rotateCoord(x, y, rotation, maxW, maxH)` - Rotate grid coordinates by 90° increments (0-3)
- `inverseRotateCoord(x, y, rotation, maxW, maxH)` - Inverse rotation for grid coordinates
- `forEachTile(callback)` - Iterate over all grid tiles (supports early exit via `return false`)

**GolfSystem.js:**
- `enterPlayMode(course)` - Initialize golf mode, reset stroke tracking, start at hole 1
- `swingAndHit(pointer)` - Execute golf swing, increment stroke counter
- `startNextHole()` - Advance to next hole, reset strokes, reposition golfer/ball
- `completeCourse()` - Launch CourseCompleteScene with stroke data
- `updateStrokeDisplay()` - Update HUD showing current hole and stroke count
- `getTerrainPhysics(terrain)` - Lookup terrain physics from TERRAIN_PHYSICS config (internal)
- `calculateArc(startX, startY, endX, endY, maxArcHeight)` - Calculate quadratic bezier arc parameters (internal)
- `bezierPoint(t, start, mid, end)` - Calculate point on quadratic bezier curve at parameter t (internal)

**HistoryManager.js:**
- `getTileState(x, y)` - Capture current tile state for undo/redo
- `tileStatesEqual(a, b)` - Compare tile states (shallow property comparison, not JSON.stringify)
- `recordChange(x, y, beforeState)` - Record a tile change in the current batch
- `undo()` / `redo()` - Navigate undo/redo stacks

**SaveManager.js:**
- `serializeGrid(gridData)` - Convert grid with sprite references to plain JSON
- `saveToSlot(slotId, data)` - Save to localStorage with timestamp
- `loadSlotData(slotId)` - Load from localStorage, returns null on error
- `exportToFile(data, clubName)` - Download JSON file
- `importFromFile()` - Returns Promise resolving with parsed JSON from file picker
- `findEmptySlot()` - Returns first empty slot (1-3) or null
- `findMostRecentSave()` - Returns data from most recently saved slot

### Key Conventions

**Architecture & Structure:**
- New game states should be separate classes extending `Phaser.Scene`, registered in the `scene` array in `src/main.js`
- LevelEditorScene UI is data-driven: `createToolSection()` generates sidebar button sections from arrays of tool names
- `paintTile()` dispatches to `paintHeight()`, `paintDecoration()`, or `paintTerrain()` sub-handlers
- Input setup is split: `setupKeyboardInput()`, `setupPointerInput()`, `setupEditorInput()`

**Constants (ALWAYS use from GameConfig.js, NEVER hardcode):**
- **State machine**: Use `EDITOR_STATES.*` enum, never raw strings (`'IDLE'`, etc.)
- **Text styles**: Use `TEXT_STYLES.*` presets (e.g. `...TEXT_STYLES.buttonSmall`) rather than inline style objects
- **Notification colors**: Use `NOTIFY_COLORS.*` (`error`, `success`, `info`, `warning`, `water`, `sand`) instead of hex strings
- **Depth values**: Use `DEPTH.*` (`PREVIEW`, `UI`, `HUD`, `OVERLAY`) instead of magic numbers
- **Auto-save slot**: Use `AUTO_SLOT_ID` constant instead of string `'auto'`
- **UI dimensions**: Use `UI_LAYOUT.*` for sidebar measurements

**Save/Load:**
- All save operations go through `SaveManager` utilities, never direct `localStorage` calls with hardcoded keys
- Use `saveToSlot(slotId, data)` instead of manual `localStorage.setItem()`
- Use `loadSlotData(slotId)` instead of manual `localStorage.getItem()` + `JSON.parse()`
- Save data is JSON in localStorage: clubName, gridData, course (holes with tee/cup positions), timestamps

**Assets & Styling:**
- Assets are procedurally generated, not loaded from files. Future static assets go in `public/` or are imported relative to source
- Font: "Outfit" loaded from Google Fonts in `index.html`

**Null Safety:**
- Use optional chaining for hole references: `hole.tee?.x`, `hole.cup?.y`
- Guard against missing course data: check `firstHole.tee` exists before using, check `currentHole?.cup` before accessing

### Code Quality Standards

**No Magic Values:**
- All constants must be defined in `GameConfig.js` and imported where needed
- Never hardcode strings for states, colors, slot IDs, or other repeated values
- Never hardcode depth values - use `DEPTH.*` constants

**Error Handling:**
- User-facing errors should use `showNotification()` with appropriate `NOTIFY_COLORS.*`
- Never use silent `console.error()` for errors the user should see
- Import failures and file operations should show visual feedback

**Performance:**
- Reuse single Graphics object for procedural asset generation (see AssetGenerator.js)
- Use `forEachTile()` with early exit instead of nested loops when searching
- Prefer shallow comparison (`tileStatesEqual()`) over `JSON.stringify()` for object equality

**Memory Management:**
- Clean up DOM elements after file picker operations (see `importFromFile()` cleanup pattern)
- Destroy Phaser objects when switching modes/scenes
- Use `removeIfExists()` pattern when regenerating textures
