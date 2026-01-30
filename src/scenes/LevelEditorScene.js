import Phaser from 'phaser';
import { isoToScreen, screenToIso } from '../utils/IsoUtils.js';
import AssetGenerator from '../utils/AssetGenerator.js';
import GolfSystem from '../objects/GolfSystem.js';
import { 
    GRID_SIZE, 
    TILE_SIZE, 
    TILE_TYPES, 
    DECO_TYPES, 
    TILE_NAMES, 
    DECO_NAMES 
} from '../consts/GameConfig.js';

export default class LevelEditorScene extends Phaser.Scene {
    constructor() {
        super({ key: 'LevelEditorScene' });
    }

    init(data) {
        // Reset/Initialize State
        this.gridData = [];
        this.tileSprites = [];
        this.selectedTileType = 'grass';
        this.editorState = 'IDLE';
        this.course = { holes: [] };
        this.currentHole = null;
        this.popup = null;
        this.viewRotation = 0;
        this.currentSlot = data.slotId || 'auto'; // Remember which slot we are playing in
        this.clubName = data.clubName || (data.initialData && data.initialData.clubName) || 'Unnamed Club';

        // Golf System
        this.golfSystem = new GolfSystem(this);
        
        // UI References
        this.notificationText = null;
        this.uiContainer = null;
        this.worldContainer = null;
        this.editorUI = null;

        this.showEditor = data.startInEditor !== undefined ? data.startInEditor : true;
        this.pendingLoadData = data.initialData || null;

        // History / Undo-Redo
        this.history = {
            undoStack: [],
            redoStack: [],
            currentBatch: null
        };
    }

    preload() {
        new AssetGenerator(this).generateAll();
    }

    createPopup(screenX, screenY, hole, onEdit) {
        if (this.popup) this.popup.destroy();

        this.popup = this.add.container(screenX, screenY).setDepth(20000); // Higher than UI

        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 0.9);
        bg.lineStyle(2, 0xffffff);
        bg.fillRoundedRect(0, 0, 150, 80, 5);
        bg.strokeRoundedRect(0, 0, 150, 80, 5);

        const text = this.add.text(75, 20, `Hole ${hole.number}`, { 
            fontFamily: '"Outfit", sans-serif',
            fontSize: '18px', 
            fill: '#fff', 
            fontStyle: 'bold' 
        }).setOrigin(0.5);
        
        const editBtn = this.add.text(75, 55, 'EDIT', { 
            fontFamily: '"Outfit", sans-serif',
            fontSize: '16px', 
            fill: '#000', 
            backgroundColor: '#fff', 
            padding: { x: 10, y: 5 } 
        })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });
        
        editBtn.on('pointerdown', () => {
            onEdit();
            this.popup.destroy();
            this.popup = null;
        });

        this.popup.add([bg, text, editBtn]);
        
        // Prevent click propagation to game
        this.popup.setInteractive(new Phaser.Geom.Rectangle(0, 0, 150, 80), Phaser.Geom.Rectangle.Contains);
        
        this.uiCamera.ignore(this.popup);
        if (this.bgCamera) this.bgCamera.ignore(this.popup);
    }

    editHole(hole) {
        // Remove from finalized list
        this.course.holes = this.course.holes.filter(h => h !== hole);
        
        // Set as current
        this.currentHole = hole;
        this.editorState = 'CONSTRUCTING'; 
        
        // Visual updates
        this.showNotification(`Editing Hole ${hole.number}`, '#ffff00');
        this.updateChecklist();
        
        this.selectedTileType = 'tee'; 
        this.updateButtonStyles();
    }

    showNotification(message, color) {
        if (!this.notificationText) {
             this.notificationText = this.add.text(this.scale.width / 2, 80, '', { 
                fontFamily: '"Outfit", sans-serif',
                fontSize: '24px', 
                fill: '#ffffff', 
                backgroundColor: '#000000',
                padding: { x: 10, y: 5 }
            }).setOrigin(0.5).setAlpha(0).setDepth(20000);
            this.uiContainer.add(this.notificationText);
        }
        
        this.notificationText.setText(message);
        this.notificationText.setStyle({ fill: color });
        this.notificationText.setAlpha(1);
        
        this.tweens.add({
            targets: this.notificationText,
            alpha: 0,
            duration: 1000,
            delay: 2000
        });
    }

    create() {
        this.setupWorldAndCamera();
        
        // World Container (Zoomable/Rotatable)
        this.worldContainer = this.add.container(0, 0);
        
        // UI Container (Static)
        this.uiContainer = this.add.container(0, 0);
        this.uiContainer.setScrollFactor(0); // Extra safety
        
        // Sub-container for editor tools
        this.editorUI = this.add.container(0, 0);
        this.uiContainer.add(this.editorUI);

        this.createBackground();
        this.createGrid();
        this.createTilemap();
        this.createUI();
        this.createPreviewActor();
        this.setupInput();

        // Background Camera (Bottom)
        this.bgCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
        
        // UI Camera (Top)
        this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);

        // Sort Cameras: [BG, Main (World), UI]
        this.cameras.cameras = [this.bgCamera, this.cameras.main, this.uiCamera];
        
        // Ignore Rules
        this.cameras.main.ignore([this.bg, this.uiContainer]);
        this.bgCamera.ignore([this.worldContainer, this.uiContainer, this.previewActor]);
        this.uiCamera.ignore([this.bg, this.worldContainer, this.previewActor]);

        // Initial Visibility
        this.editorUI.setVisible(this.showEditor);

        // Load pending data if coming from Main Menu
        if (this.pendingLoadData) {
            this.time.delayedCall(100, () => {
                if (this.scene.isActive()) {
                    this.importCourse(this.pendingLoadData);
                    this.pendingLoadData = null;
                }
            });
        }
    }

    createBackground() {
        this.bg = this.add.tileSprite(0, 0, this.cameras.main.width, this.cameras.main.height, 'bg').setOrigin(0).setScrollFactor(0);
    }

    update(time, delta) {
        this.handleCameraMovement(delta);
        if (this.editorState === 'PLAYING') {
            this.golfSystem.update(delta);
        }
    }

    enterPlayMode() {
        if (this.golfSystem.enterPlayMode(this.course)) {
            this.editorUI.setVisible(false);
            this.editorState = 'PLAYING';
        }
    }

    exitPlayMode() {
        this.editorState = 'IDLE';
        this.editorUI.setVisible(this.showEditor);
        this.golfSystem.exitPlayMode();
    }

    setupWorldAndCamera() {
        const worldWidth = GRID_SIZE.width * TILE_SIZE.width;
        const worldHeight = GRID_SIZE.height * TILE_SIZE.height;
        const margin = 1000;

        this.cameras.main.setBounds(-margin, -margin, worldWidth + margin * 2, worldHeight + margin * 2);
        this.physics.world.setBounds(-margin, -margin, worldWidth + margin * 2, worldHeight + margin * 2);

        const centerX = (GRID_SIZE.width * TILE_SIZE.width) / 2;
        const centerY = worldHeight / 4; // Start a bit higher up for isometric view
        this.cameras.main.centerOn(centerX, centerY);
    }

    createGrid() {
        for (let y = 0; y < GRID_SIZE.height; y++) {
            this.gridData[y] = [];
            for (let x = 0; x < GRID_SIZE.width; x++) {
                this.gridData[y][x] = {
                    type: 'grass',
                    height: 0,
                    decoration: null,
                    holeId: null
                };
            }
        }
    }

    createTilemap() {
        for (let y = 0; y < GRID_SIZE.height; y++) {
            this.tileSprites[y] = [];
            for (let x = 0; x < GRID_SIZE.width; x++) {
                const isoPos = this.gridToIso(x, y);
                const tile = this.add.sprite(isoPos.x, isoPos.y, this.gridData[y][x].type);
                tile.setOrigin(0.5, 0.5);
                tile.setData('gridX', x);
                tile.setData('gridY', y);
                
                const halfW = TILE_SIZE.width / 2;
                const halfH = TILE_SIZE.height / 2;
                
                const shape = new Phaser.Geom.Polygon([
                    halfW, 0,                 // Top
                    TILE_SIZE.width, halfH,   // Right
                    halfW, TILE_SIZE.height,  // Bottom
                    0, halfH                  // Left
                ]);
                tile.setInteractive(shape, Phaser.Geom.Polygon.Contains);

                this.worldContainer.add(tile);
                this.tileSprites[y][x] = tile;
            }
        }
    }

    createUI() {
        const uiDepth = 10000;
        this.uiButtons = {}; // Store button references

        // --- HUD ELEMENTS (Always Visible) ---
        const btnY = this.cameras.main.height - 50;
        const centerX = this.cameras.main.width / 2;

        const toggleEditorBtn = this.add.text(centerX - 70, btnY, 'EDITOR', {
            fontFamily: '"Outfit", sans-serif',
            fontSize: '16px',
            fill: '#fff',
            backgroundColor: '#34495e',
            padding: { x: 15, y: 10 },
            fontStyle: 'bold'
        })
        .setOrigin(0.5, 0)
        .setInteractive({ useHandCursor: true })
        .setDepth(uiDepth + 100);
        
        const playCourseBtn = this.add.text(centerX + 70, btnY, 'PLAY', {
            fontFamily: '"Outfit", sans-serif',
            fontSize: '16px',
            fill: '#fff',
            backgroundColor: '#2980b9',
            padding: { x: 15, y: 10 },
            fontStyle: 'bold'
        })
        .setOrigin(0.5, 0)
        .setInteractive({ useHandCursor: true })
        .setDepth(uiDepth + 100);

        this.uiContainer.add([toggleEditorBtn, playCourseBtn]);
        
        toggleEditorBtn.on('pointerdown', () => this.toggleEditor());
        playCourseBtn.on('pointerdown', () => this.enterPlayMode());

        // --- EDITOR UI (Toggable) ---
        
        // Sidebar Background
        const uiPanel = this.add.graphics();
        uiPanel.fillStyle(0x222222, 0.95);
        uiPanel.fillRect(0, 0, 250, this.cameras.main.height);
        uiPanel.lineStyle(2, 0x4a90e2, 0.5);
        uiPanel.strokeLineShape(new Phaser.Geom.Line(250, 0, 250, this.cameras.main.height));
        uiPanel.setDepth(uiDepth);
        uiPanel.setInteractive(new Phaser.Geom.Rectangle(0, 0, 250, this.cameras.main.height), Phaser.Geom.Rectangle.Contains);
        this.editorUI.add(uiPanel);

        let yPos = 20;
        const xPos = 25;
        const btnWidth = 200;

        // --- ACTIONS ---
        const actionsLabel = this.add.text(xPos, yPos, 'ACTIONS', { fontFamily: '"Outfit", sans-serif', fontSize: '12px', fill: '#888', fontStyle: 'bold' }).setDepth(uiDepth);
        this.editorUI.add(actionsLabel);
        yPos += 20;

        const newHoleBtn = this.add.text(xPos, yPos, '+ NEW HOLE', { 
            fontFamily: '"Outfit", sans-serif',
            fontSize: '16px', 
            fill: '#fff', 
            backgroundColor: '#27ae60', 
            padding: { x: 10, y: 8 },
            fixedWidth: btnWidth,
            align: 'center',
            fontStyle: 'bold'
        })
        .setInteractive({ useHandCursor: true })
        .setDepth(uiDepth);
        this.editorUI.add(newHoleBtn);
        
        newHoleBtn.on('pointerdown', () => this.startNewHole());
        newHoleBtn.on('pointerover', () => newHoleBtn.setAlpha(0.8));
        newHoleBtn.on('pointerout', () => newHoleBtn.setAlpha(1));
        
        yPos += 45;

        const undoBtn = this.add.text(xPos, yPos, '↶ UNDO', { 
            fontFamily: '"Outfit", sans-serif',
            fontSize: '14px', fill: '#fff', backgroundColor: '#333', padding: { x: 10, y: 5 }, fixedWidth: 95, align: 'center' 
        }).setInteractive({ useHandCursor: true }).setDepth(uiDepth);
        
        const redoBtn = this.add.text(xPos + 105, yPos, '↷ REDO', { 
            fontFamily: '"Outfit", sans-serif',
            fontSize: '14px', fill: '#fff', backgroundColor: '#333', padding: { x: 10, y: 5 }, fixedWidth: 95, align: 'center' 
        }).setInteractive({ useHandCursor: true }).setDepth(uiDepth);
        
        this.editorUI.add(undoBtn);
        this.editorUI.add(redoBtn);

        undoBtn.on('pointerdown', () => this.undo());
        redoBtn.on('pointerdown', () => this.redo());

        yPos += 50;

        // --- HOLE ELEMENTS ---
        const holeLabel = this.add.text(xPos, yPos, 'HOLE ELEMENTS', { fontFamily: '"Outfit", sans-serif', fontSize: '12px', fill: '#888', fontStyle: 'bold' }).setDepth(uiDepth);
        this.editorUI.add(holeLabel);
        yPos += 20;

        const holeElements = ['tee', 'green', 'cup'];
        holeElements.forEach(type => {
            const btn = this.add.text(xPos, yPos, type.toUpperCase(), { 
                fontFamily: '"Outfit", sans-serif',
                fontSize: '14px', 
                fill: '#fff',
                backgroundColor: '#333',
                padding: { x: 10, y: 5 },
                fixedWidth: btnWidth
            })
            .setInteractive({ useHandCursor: true })
            .setDepth(uiDepth);
            
            this.uiButtons[type] = btn;
            this.editorUI.add(btn);

            btn.on('pointerdown', () => {
                this.selectedTileType = type;
                this.updateButtonStyles();
            });

            yPos += 30;
        });

        yPos += 20;

        // --- TERRAIN ---
        const terrainLabel = this.add.text(xPos, yPos, 'TERRAIN', { fontFamily: '"Outfit", sans-serif', fontSize: '12px', fill: '#888', fontStyle: 'bold' }).setDepth(uiDepth);
        this.editorUI.add(terrainLabel);
        yPos += 20;

        const tileTypes = ['grass', 'fairway', 'sand', 'water', 'rough'];
        tileTypes.forEach(type => {
            const btn = this.add.text(xPos, yPos, type.toUpperCase(), { 
                fontFamily: '"Outfit", sans-serif',
                fontSize: '14px', 
                fill: '#fff',
                backgroundColor: '#333',
                padding: { x: 10, y: 5 },
                fixedWidth: btnWidth
            })
            .setInteractive({ useHandCursor: true })
            .setDepth(uiDepth);
            
            this.uiButtons[type] = btn;
            this.editorUI.add(btn);

            btn.on('pointerdown', () => {
                this.selectedTileType = type;
                this.updateButtonStyles();
            });

            yPos += 30;
        });

        yPos += 20;

        // --- ELEVATION ---
        const elevationLabel = this.add.text(xPos, yPos, 'ELEVATION', { fontFamily: '"Outfit", sans-serif', fontSize: '12px', fill: '#888', fontStyle: 'bold' }).setDepth(uiDepth);
        this.editorUI.add(elevationLabel);
        yPos += 20;
        
        const upBtn = this.add.text(xPos, yPos, 'RAISE (+)', { 
            fontFamily: '"Outfit", sans-serif',
            fontSize: '14px', fill: '#fff', backgroundColor: '#333', padding: { x: 10, y: 5 }, fixedWidth: 95, align: 'center' 
        }).setInteractive({ useHandCursor: true }).setDepth(uiDepth);
        
        const downBtn = this.add.text(xPos + 105, yPos, 'LOWER (-)', { 
            fontFamily: '"Outfit", sans-serif',
            fontSize: '14px', fill: '#fff', backgroundColor: '#333', padding: { x: 10, y: 5 }, fixedWidth: 95, align: 'center' 
        }).setInteractive({ useHandCursor: true }).setDepth(uiDepth);
        
        this.uiButtons['height_up'] = upBtn;
        this.uiButtons['height_down'] = downBtn;
        this.editorUI.add(upBtn);
        this.editorUI.add(downBtn);

        upBtn.on('pointerdown', () => {
            this.selectedTileType = 'height_up';
            this.updateButtonStyles();
        });

        downBtn.on('pointerdown', () => {
            this.selectedTileType = 'height_down';
            this.updateButtonStyles();
        });
        
        yPos += 40;

        // --- DECORATIONS ---
        const decoLabel = this.add.text(xPos, yPos, 'DECORATIONS', { fontFamily: '"Outfit", sans-serif', fontSize: '12px', fill: '#888', fontStyle: 'bold' }).setDepth(uiDepth);
        this.editorUI.add(decoLabel);
        yPos += 20;

        DECO_NAMES.filter(name => name !== 'cup').forEach(type => {
            const btn = this.add.text(xPos, yPos, type.toUpperCase(), { 
                fontFamily: '"Outfit", sans-serif',
                fontSize: '14px', 
                fill: '#fff',
                backgroundColor: '#333',
                padding: { x: 10, y: 5 },
                fixedWidth: btnWidth
            })
            .setInteractive({ useHandCursor: true })
            .setDepth(uiDepth);

            this.uiButtons[type] = btn;
            this.editorUI.add(btn);

            btn.on('pointerdown', () => {
                this.selectedTileType = type;
                this.updateButtonStyles();
            });

            yPos += 30;
        });

        this.createChecklist();
        this.updateButtonStyles(); // Initial highlight
    }

    toggleEditor() {
        this.showEditor = !this.showEditor;
        this.editorUI.setVisible(this.showEditor);
        this.showNotification(this.showEditor ? "EDITOR OPENED" : "EDITOR CLOSED", "#ffffff");
    }

    saveCourse() {
        this.quickSave('auto');
        // Serialize gridData (replace sprite refs with type names)
        const serializedGrid = this.gridData.map(row => 
            row.map(tile => ({
                type: tile.type,
                height: tile.height,
                decoration: tile.decoration ? tile.decoration.texture.key : null,
                holeId: tile.holeId
            }))
        );

        const data = {
            clubName: this.clubName,
            course: this.course,
            gridData: serializedGrid,
            viewRotation: this.viewRotation,
            timestamp: new Date().getTime()
        };

        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `golf_course_${new Date().getTime()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.showNotification("Course Exported!", "#00ff00");
    }

    loadCourse() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    this.importCourse(data);
                } catch (err) {
                    this.showNotification("Invalid JSON File!", "#ff0000");
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    importCourse(data) {
        if (!data.gridData || !data.course) return;

        this.clubName = data.clubName || 'Unnamed Club';

        // Clear existing decorations
        for (let y = 0; y < GRID_SIZE.height; y++) {
            for (let x = 0; x < GRID_SIZE.width; x++) {
                if (this.gridData[y][x].decoration) {
                    this.gridData[y][x].decoration.destroy();
                }
            }
        }

        // Restore Data
        this.course = data.course;
        this.viewRotation = data.viewRotation || 0;
        
        // Reconstruct gridData and visuals
        for (let y = 0; y < GRID_SIZE.height; y++) {
            for (let x = 0; x < GRID_SIZE.width; x++) {
                const tileData = data.gridData[y][x];
                this.gridData[y][x] = {
                    type: tileData.type,
                    height: tileData.height,
                    holeId: tileData.holeId,
                    decoration: null
                };

                // Re-spawn Decoration if it exists
                if (tileData.decoration) {
                    const isoPos = this.gridToIso(x, y, tileData.height);
                    const deco = this.add.sprite(isoPos.x, isoPos.y, tileData.decoration);
                    deco.setOrigin(0.5, 1);
                    this.worldContainer.add(deco);
                    this.gridData[y][x].decoration = deco;
                }
            }
        }

        this.refreshAllTiles();
        this.updateChecklist();
        this.showNotification("Course Loaded Successfully!", "#00ff00");
    }

    quickSave(slotId = null) {
        const id = slotId || this.currentSlot;
        const serializedGrid = this.gridData.map(row => 
            row.map(tile => ({
                type: tile.type,
                height: tile.height,
                decoration: tile.decoration ? tile.decoration.texture.key : null,
                holeId: tile.holeId
            }))
        );

        const data = {
            clubName: this.clubName,
            course: this.course,
            gridData: serializedGrid,
            viewRotation: this.viewRotation,
            timestamp: new Date().getTime()
        };

        localStorage.setItem(`iso_golf_save_${id}`, JSON.stringify(data));
        if (id !== 'auto') {
            this.showNotification(`Saved to Slot ${id}`, "#00ff00");
        }
    }

    loadFromSlot(slotId) {
        const savedData = localStorage.getItem(`iso_golf_save_${slotId}`);
        if (savedData) {
            try {
                const data = JSON.parse(savedData);
                this.importCourse(data);
                return true;
            } catch (e) {
                this.showNotification("Failed to load slot!", "#ff0000");
            }
        }
        return false;
    }

    findTileByType(type) {
        for (let y = 0; y < GRID_SIZE.height; y++) {
            for (let x = 0; x < GRID_SIZE.width; x++) {
                if (this.gridData[y][x].type === type) {
                    return { x, y };
                }
            }
        }
        return null;
    }
    
    findTileByDecoration(decoType) {
        for (let y = 0; y < GRID_SIZE.height; y++) {
            for (let x = 0; x < GRID_SIZE.width; x++) {
                // Check if decoration exists and has texture key matching decoType
                if (this.gridData[y][x].decoration && this.gridData[y][x].decoration.texture.key === decoType) {
                    return { x, y };
                }
            }
        }
        return null;
    }

    startNewHole() {
        if (this.editorState !== 'IDLE') {
            this.showNotification("Finish current hole first!", '#ff0000');
            return;
        }

        const holeNumber = this.course.holes.length + 1;
        this.currentHole = { 
            number: holeNumber, 
            tee: null, 
            cup: null 
        };
        
        this.editorState = 'PLACING_TEE';
        this.selectedTileType = 'tee';
        this.updateChecklist();
        this.updateButtonStyles();
        this.showNotification(`Hole ${holeNumber}: Place the Tee`, '#00ff00');
    }

    finalizeHole() {
        if (this.editorState === 'IDLE' || !this.currentHole) {
            return;
        }

        if (!this.currentHole.tee) {
            this.showNotification("Cannot finish: Missing Tee!", '#ff0000');
            return;
        }

        if (!this.currentHole.cup) {
            this.showNotification("Cannot finish: Missing Cup!", '#ff0000');
            return;
        }

        // Add to course data
        this.course.holes.push(this.currentHole);
        this.showNotification(`Hole ${this.currentHole.number} Finalized!`, '#00ff00');
        
        // Reset state
        this.editorState = 'IDLE';
        this.currentHole = null;
        this.updateChecklist();
        this.quickSave(); // Auto-save on finalize to the current slot
    }

    paintTile(tile) {
        const gridX = tile.getData('gridX');
        const gridY = tile.getData('gridY');
        
        if (gridX === undefined || gridY === undefined) {
            return;
        }

        // Capture state BEFORE changes
        const beforeState = this.getTileState(gridX, gridY);

        // --- STATE MACHINE LOGIC ---

        if (this.editorState === 'IDLE') {
            if (this.selectedTileType === 'tee' || this.selectedTileType === 'cup') {
                return;
            }
        }

        if (this.editorState === 'PLACING_TEE') {
            if (this.selectedTileType !== 'tee') {
                this.selectedTileType = 'tee'; // Force selection
                return;
            }
        }

        // --- END STATE MACHINE CHECKS ---


        if (this.selectedTileType === 'height_up') {
            this.gridData[gridY][gridX].height += 5;
        } else if (this.selectedTileType === 'height_down') {
            this.gridData[gridY][gridX].height = Math.max(0, this.gridData[gridY][gridX].height - 5);
        } else if (DECO_NAMES.includes(this.selectedTileType)) {
            // DECORATION LOGIC
            const decoType = this.selectedTileType;

            // 1. Cup Logic
            if (decoType === 'cup') {
                if (this.editorState !== 'CONSTRUCTING') {
                    // Allow placing cup if we are in CONSTRUCTING (tee placed)
                    // If we are just placing tee, state is PLACING_TEE
                    return; 
                }

                // Changed: Cup can be placed anywhere, it will MAKE the tile green.
                // But we should probably check if it's a valid terrain to build on (not water/out of bounds?)
                // For now, let's allow it on any non-null grid.

                // Remove OLD cup visual if moving it
                if (this.currentHole.cup) {
                    const oldCupX = this.currentHole.cup.x;
                    const oldCupY = this.currentHole.cup.y;
                    if (this.gridData[oldCupY][oldCupX].decoration) {
                         // We need to record the change for the OLD cup location too if we are moving it
                         // But for simplicity, we focus on the current tile change. 
                         // To fully support moving cup via undo, we'd need multi-tile recording.
                         // For now, let's just destroy it. The Undo logic for the old tile won't know it lost the cup
                         // unless we explicitly record it. 
                         // FIX: Let's record the OLD cup tile change if it's different.
                         if (oldCupX !== gridX || oldCupY !== gridY) {
                             const oldTileBefore = this.getTileState(oldCupX, oldCupY);
                             this.gridData[oldCupY][oldCupX].decoration.destroy();
                             this.gridData[oldCupY][oldCupX].decoration = null;
                             this.recordTileChange(oldCupX, oldCupY, oldTileBefore);
                         } else {
                             this.gridData[oldCupY][oldCupX].decoration.destroy();
                             this.gridData[oldCupY][oldCupX].decoration = null;
                         }
                    }
                }

                // 1. Place Green Tile Underneath
                this.gridData[gridY][gridX].type = 'green';
                this.gridData[gridY][gridX].holeId = this.currentHole.number;
                this.refreshTile(gridX, gridY); // Refresh to show green tile

                // 2. Store Cup Data
                this.currentHole.cup = { x: gridX, y: gridY };
                
                // 3. Do NOT Finalize. Update checklist and switch tool.
                this.updateChecklist();
                this.selectedTileType = 'green'; 
                this.updateButtonStyles();
                this.showNotification("Cup Placed. Paint the green, then press 'H' to finish.", '#ffffff');
            }

            // Normal decoration placement (replaces existing)
            if (this.gridData[gridY][gridX].decoration) {
                this.gridData[gridY][gridX].decoration.destroy();
            }
            
            const isoPos = this.gridToIso(gridX, gridY, this.gridData[gridY][gridX].height);
            const deco = this.add.sprite(isoPos.x, isoPos.y, decoType);
            deco.setOrigin(0.5, 1);
            this.worldContainer.add(deco); // Ensure UI camera ignores it

            this.gridData[gridY][gridX].decoration = deco;

        } else {
            // TILE LOGIC
            const tileType = this.selectedTileType;

            // Prevent overwriting Tee box with other terrain
            if (this.gridData[gridY][gridX].type === 'tee' && tileType !== 'tee') {
                return;
            }

            const currentTile = this.gridData[gridY][gridX];
            
            // Prevent overwriting Tile with Cup
            if (currentTile.decoration && currentTile.decoration.texture.key === 'cup') {
                return;
            }

            // 1. Tee Logic
            if (tileType === 'tee') {
                // Allow placing Tee if we are STARTING or EDITING (CONSTRUCTING)
                if (this.editorState !== 'PLACING_TEE' && this.editorState !== 'CONSTRUCTING') {
                    return;
                }
                
                // If moving tee, clear old one
                if (this.currentHole && this.currentHole.tee) {
                    const oldTee = this.currentHole.tee;
                     // Record change for old tee location
                     if (oldTee.x !== gridX || oldTee.y !== gridY) {
                        const oldTeeBefore = this.getTileState(oldTee.x, oldTee.y);
                        if (this.gridData[oldTee.y][oldTee.x].type === 'tee') {
                            this.gridData[oldTee.y][oldTee.x].type = 'grass';
                            this.refreshTile(oldTee.x, oldTee.y);
                            this.recordTileChange(oldTee.x, oldTee.y, oldTeeBefore);
                        }
                    }
                }

                this.currentHole.tee = { x: gridX, y: gridY };
                this.editorState = 'CONSTRUCTING'; // Advance state
                
                if (this.selectedTileType === 'tee') { // If using the tool
                     this.selectedTileType = 'cup'; // Auto-switch to Cup
                     this.updateButtonStyles();
                     this.showNotification("Tee Placed. Now place the Cup.", '#ffffff');
                }
            }

            // 2. Green Logic (Check before applying)
            if (tileType === 'green') {
                if (this.editorState !== 'CONSTRUCTING') {
                    // Prevent placing green if not constructing a hole (i.e. before Tee)
                    return;
                }
            }

            // Apply new tile
            this.gridData[gridY][gridX].type = tileType;

            // Assign Hole ID to Green tiles during construction
            if (tileType === 'green' && this.editorState === 'CONSTRUCTING') {
                this.gridData[gridY][gridX].holeId = this.currentHole.number;
            } else if (tileType !== 'green') {
                // If overwriting a green, clear the holeId
                this.gridData[gridY][gridX].holeId = null;
            }
        }

        this.refreshTile(gridX, gridY);
        this.updateChecklist();

        // Record Change
        this.recordTileChange(gridX, gridY, beforeState);
    }
    
    refreshTile(x, y) {
        const tile = this.tileSprites[y][x];
        if (tile) {
            tile.setTexture(this.gridData[y][x].type);
            const isoPos = this.gridToIso(x, y, this.gridData[y][x].height);
            tile.x = isoPos.x;
            tile.y = isoPos.y;
            
            // Depth sorting
            tile.depth = isoPos.y + tile.height;

            if (this.gridData[y][x].decoration) {
                this.gridData[y][x].decoration.x = isoPos.x;
                this.gridData[y][x].decoration.y = isoPos.y;
                this.gridData[y][x].decoration.depth = isoPos.y + tile.height + 1;
            }
        }
    }

    createChecklist() {
        const uiDepth = 10000;
        const width = 240;
        const height = 260;
        const x = this.cameras.main.width - width - 20;
        const y = 20;
        const padding = 32;

        this.checklistPanel = this.add.graphics();
        this.checklistPanel.fillStyle(0x000000, 0.8);
        this.checklistPanel.lineStyle(2, 0xffffff, 1);
        this.checklistPanel.fillRoundedRect(x, y, width, height, 10);
        this.checklistPanel.strokeRoundedRect(x, y, width, height, 10);
        this.checklistPanel.setDepth(uiDepth);
        this.checklistPanel.setInteractive(new Phaser.Geom.Rectangle(x, y, width, height), Phaser.Geom.Rectangle.Contains);
        this.editorUI.add(this.checklistPanel);

        this.checklistTitle = this.add.text(x + width / 2, y + padding, '', { 
            fontFamily: '"Outfit", sans-serif',
            fontSize: '16px', 
            fill: '#fff', 
            fontStyle: 'bold' 
        })
            .setOrigin(0.5, 0).setDepth(uiDepth);
        this.editorUI.add(this.checklistTitle);
        
        this.checkItems = [];
        const items = ['Place Tee', 'Place Cup', 'Build Hole', 'Finish'];
        items.forEach((item, index) => {
            const text = this.add.text(x + padding, y + 75 + (index * 25), `[ ] ${item}`, { 
                fontFamily: '"Outfit", sans-serif',
                fontSize: '14px', 
                fill: '#888' 
            }).setDepth(uiDepth);
            this.checkItems.push({ key: item, obj: text });
            this.editorUI.add(text);
        });

        const finishBtn = this.add.text(x + padding, y + height - padding - 40, 'FINISH HOLE', {
            fontFamily: '"Outfit", sans-serif',
            fontSize: '16px',
            fill: '#fff',
            backgroundColor: '#27ae60',
            padding: { x: 0, y: 10 },
            fixedWidth: width - (padding * 2),
            align: 'center',
            fontStyle: 'bold'
        })
        .setInteractive({ useHandCursor: true })
        .setDepth(uiDepth);

        this.editorUI.add(finishBtn);
        
        finishBtn.on('pointerdown', () => this.finalizeHole());

        this.updateChecklist();
    }

    updateChecklist() {
        if (this.editorState === 'IDLE') {
            this.checkItems.forEach(item => item.obj.setText(`[ ] ${item.key}`).setStyle({ fill: '#888' }));
            
            if (this.course.holes.length === 0) {
                this.checklistTitle.setText('START FIRST HOLE');
                this.checklistTitle.setStyle({ fill: '#27ae60' }); // Green prompt
            } else {
                this.checklistTitle.setText('COURSE READY');
                this.checklistTitle.setStyle({ fill: '#fff' });
            }
            return;
        }

        const holeNum = this.currentHole ? this.currentHole.number : '?';
        this.checklistTitle.setText(`HOLE ${holeNum} PROGRESS`);
        this.checklistTitle.setStyle({ fill: '#fff' });

        const isTeeDone = this.currentHole && this.currentHole.tee;
        const isCupDone = this.currentHole && this.currentHole.cup;
        
        // "Build Hole" is just an informative step now, mark as active if construction started
        const isBuilding = this.editorState === 'CONSTRUCTING';

        this.checkItems[0].obj.setText(`${isTeeDone ? '[X]' : '[ ]'} Place Tee`).setStyle({ fill: isTeeDone ? '#0f0' : '#fff' });
        this.checkItems[1].obj.setText(`${isCupDone ? '[X]' : '[ ]'} Place Cup`).setStyle({ fill: isCupDone ? '#0f0' : '#fff' });
        this.checkItems[2].obj.setText(`[${isBuilding ? '*' : ' '}] Build Hole`).setStyle({ fill: isBuilding ? '#fff' : '#888' }); // Informational
        this.checkItems[3].obj.setText(`[ ] Press H to Finish`).setStyle({ fill: (isTeeDone && isCupDone) ? '#ffff00' : '#888' });
    }

    createPreviewActor() {
        this.previewActor = this.add.sprite(0, 0, 'grass');
        this.previewActor.setAlpha(0.5);
        this.previewActor.setVisible(false);
        this.previewActor.setDepth(5000); // High but below UI
        this.worldContainer.add(this.previewActor);
    }

    updatePreview(tile) {
        const gridX = tile.getData('gridX');
        const gridY = tile.getData('gridY');
        
        if (gridX === undefined || gridY === undefined) return;

        const type = this.selectedTileType;
        
        if (type === 'height_up' || type === 'height_down') {
            this.previewActor.setVisible(false);
            return;
        }

        this.previewActor.x = tile.x;
        this.previewActor.y = tile.y;
        
        if (this.textures.exists(type)) {
            this.previewActor.setTexture(type);
            this.previewActor.setVisible(true);
            
            if (DECO_NAMES.includes(type)) {
                this.previewActor.setOrigin(0.5, 1);
                this.previewActor.setDepth(tile.depth + 100);
            } else {
                this.previewActor.setOrigin(0.5, 0.5);
                this.previewActor.setDepth(tile.depth + 0.1);
            }
        } else {
            this.previewActor.setVisible(false);
        }
    }

    handleCameraMovement(delta) {
        const speed = 500 * (1 / this.cameras.main.zoom); // Adjust speed based on zoom
        
        let moveX = 0;
        let moveY = 0;

        if (this.cursors.up.isDown || this.wasd.up.isDown) moveY -= 1;
        if (this.cursors.down.isDown || this.wasd.down.isDown) moveY += 1;
        if (this.cursors.left.isDown || this.wasd.left.isDown) moveX -= 1;
        if (this.cursors.right.isDown || this.wasd.right.isDown) moveX += 1;

        if (moveX !== 0 || moveY !== 0) {
            // Normalize
            const length = Math.sqrt(moveX * moveX + moveY * moveY);
            this.cameras.main.scrollX += (moveX / length) * speed * (delta / 1000);
            this.cameras.main.scrollY += (moveY / length) * speed * (delta / 1000);
        }
    }

    gridToIso(x, y, height = 0) {
        const centerX = (GRID_SIZE.width * TILE_SIZE.width) / 2;
        
        let rx = x;
        let ry = y;
        const maxW = GRID_SIZE.width - 1;
        const maxH = GRID_SIZE.height - 1;

        // Rotate logical coordinates based on viewRotation
        switch(this.viewRotation) {
            case 1: // 90 deg clockwise
                rx = y;
                ry = maxW - x;
                break;
            case 2: // 180 deg
                rx = maxW - x;
                ry = maxH - y;
                break;
            case 3: // 270 deg
                rx = maxH - y;
                ry = x;
                break;
        }

        return isoToScreen(rx, ry, TILE_SIZE.width, TILE_SIZE.height, centerX, 0, height);
    }

    rotateWorld(dir) {
        if (this.popup) {
            this.popup.destroy();
            this.popup = null;
        }
        if (this.previewActor) {
            this.previewActor.setVisible(false);
        }

        const cam = this.cameras.main;
        // 1. Get current world center
        const center = cam.getWorldPoint(cam.width / 2, cam.height / 2);
        // 2. Map to logical grid point
        const logical = this.worldToGrid(center.x, center.y);

        // 3. Perform rotation
        this.viewRotation = (this.viewRotation + dir + 4) % 4;
        this.refreshAllTiles();

        // 4. Center on same logical point in new view
        const newPos = this.gridToIso(logical.x, logical.y);
        cam.centerOn(newPos.x, newPos.y);

        this.showNotification(`View Rotated: ${this.viewRotation * 90} deg`, '#ffffff');
    }

    worldToGrid(wx, wy) {
        const centerX = (GRID_SIZE.width * TILE_SIZE.width) / 2;
        const raw = screenToIso(wx, wy, TILE_SIZE.width, TILE_SIZE.height, centerX, 0);
        
        let x = raw.x;
        let y = raw.y;
        const maxW = GRID_SIZE.width - 1;
        const maxH = GRID_SIZE.height - 1;

        // Reverse the rotation transformation to get original logical grid
        switch(this.viewRotation) {
            case 1: // 90 deg clockwise (rx = y, ry = maxW - x)
                x = maxW - raw.y;
                y = raw.x;
                break;
            case 2: // 180 deg (rx = maxW - x, ry = maxH - y)
                x = maxW - raw.x;
                y = maxH - raw.y;
                break;
            case 3: // 270 deg (rx = maxH - y, ry = x)
                x = raw.y;
                y = maxH - raw.x;
                break;
        }
        return { x, y };
    }

    startHistoryBatch() {
        if (this.history.currentBatch) return;
        this.history.currentBatch = [];
    }

    endHistoryBatch() {
        if (this.history.currentBatch && this.history.currentBatch.length > 0) {
            this.history.undoStack.push(this.history.currentBatch);
            this.history.redoStack = []; // Clear redo on new action
            
            // Limit stack size (optional, e.g., 50 actions)
            if (this.history.undoStack.length > 50) this.history.undoStack.shift();
        }
        this.history.currentBatch = null;
    }

    getTileState(x, y) {
        const tile = this.gridData[y][x];
        const hole = this.currentHole || null;
        
        return {
            x, y,
            type: tile.type,
            height: tile.height,
            decoration: tile.decoration ? tile.decoration.texture.key : null,
            holeId: tile.holeId,
            // Capture if this tile corresponds to current hole features
            isTee: (hole && hole.tee && hole.tee.x === x && hole.tee.y === y),
            isCup: (hole && hole.cup && hole.cup.x === x && hole.cup.y === y),
            // We store the hole reference to verify ownership later
            holeRef: hole 
        };
    }

    recordTileChange(x, y, beforeState) {
        if (!this.history.currentBatch) return;
        
        const afterState = this.getTileState(x, y);
        
        // Don't record if nothing changed
        if (JSON.stringify(beforeState) === JSON.stringify(afterState)) return;

        // Check if we already recorded this tile in this batch (optimization)
        const existing = this.history.currentBatch.find(r => r.x === x && r.y === y);
        if (existing) {
            // Update the 'after' state of the existing record, keep original 'before'
            existing.after = afterState;
        } else {
            this.history.currentBatch.push({
                x, y,
                before: beforeState,
                after: afterState
            });
        }
    }

    undo() {
        if (this.history.undoStack.length === 0) {
            this.showNotification("Nothing to Undo", "#888");
            return;
        }

        const batch = this.history.undoStack.pop();
        this.history.redoStack.push(batch);

        // Apply changes in reverse order
        // Actually, for state replacement, order within batch might not matter if unique tiles, 
        // but let's reverse to be safe if multiple ops on same tile (though we deduped).
        [...batch].reverse().forEach(change => {
            this.restoreTileState(change.before);
        });
        
        this.refreshAllTiles(); // Lazy refresh
        this.showNotification("Undo", "#fff");
    }

    redo() {
        if (this.history.redoStack.length === 0) {
            this.showNotification("Nothing to Redo", "#888");
            return;
        }

        const batch = this.history.redoStack.pop();
        this.history.undoStack.push(batch);

        batch.forEach(change => {
            this.restoreTileState(change.after);
        });

        this.refreshAllTiles();
        this.showNotification("Redo", "#fff");
    }

    restoreTileState(state) {
        const { x, y, type, height, decoration, holeId, isTee, isCup, holeRef } = state;
        
        // 1. Grid Data
        const tile = this.gridData[y][x];
        tile.type = type;
        tile.height = height;
        tile.holeId = holeId;
        
        // 2. Decoration
        if (tile.decoration) {
            tile.decoration.destroy();
            tile.decoration = null;
        }
        if (decoration) {
             const isoPos = this.gridToIso(x, y, height);
             const deco = this.add.sprite(isoPos.x, isoPos.y, decoration);
             deco.setOrigin(0.5, 1);
             this.worldContainer.add(deco);
             tile.decoration = deco;
        }

        // 3. Hole Logic (Tee/Cup restoration)
        // If the state says it WAS a tee, ensure the holeRef knows about it
        if (holeRef) {
            // Restore Tee
            if (isTee) holeRef.tee = { x, y };
            else if (holeRef.tee && holeRef.tee.x === x && holeRef.tee.y === y) holeRef.tee = null;

            // Restore Cup
            if (isCup) holeRef.cup = { x, y };
            else if (holeRef.cup && holeRef.cup.x === x && holeRef.cup.y === y) holeRef.cup = null;
            
            // If we are currently editing this hole, update UI
            if (this.currentHole === holeRef) {
                this.updateChecklist();
            }
        }
    }

    refreshAllTiles() {
        for (let y = 0; y < GRID_SIZE.height; y++) {
            for (let x = 0; x < GRID_SIZE.width; x++) {
                this.refreshTile(x, y);
            }
        }

        // Update Golfer/Ball positions on rotation
        this.golfSystem.refreshPositions();
    }

    setupInput() {
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            right: Phaser.Input.Keyboard.KeyCodes.D,
            rotLeft: Phaser.Input.Keyboard.KeyCodes.Q,
            rotRight: Phaser.Input.Keyboard.KeyCodes.E
        });
        
        let isDragging = false;
        let startX = 0;
        let startY = 0;

        this.input.on('pointerdown', (pointer) => {
            if (this.editorState === 'PLAYING' && pointer.button === 0) {
                this.golfSystem.swingAndHit(pointer);
                return;
            }

            if (this.showEditor && pointer.button === 0) {
                 this.startHistoryBatch();
            }

            if (pointer.button === 1) { // Middle mouse button
                isDragging = true;
                startX = pointer.x;
                startY = pointer.y;
            }
        });

        this.input.on('pointerup', (pointer) => {
            if (this.showEditor && pointer.button === 0) {
                 this.endHistoryBatch();
            }
            if (pointer.button === 1) {
                isDragging = false;
            }
        });

        this.input.on('pointermove', (pointer) => {
            if (isDragging) {
                const dx = pointer.x - startX;
                const dy = pointer.y - startY;
                this.cameras.main.scrollX -= dx;
                this.cameras.main.scrollY -= dy;
                startX = pointer.x;
                startY = pointer.y;
            }
        });

        // Undo/Redo Keys
        this.input.keyboard.on('keydown-Z', (event) => {
            if (event.ctrlKey) {
                if (event.shiftKey) this.redo();
                else this.undo();
            }
        });
        
        this.input.keyboard.on('keydown-Y', (event) => {
             if (event.ctrlKey) this.redo();
        });


        this.input.on('gameobjectdown', (pointer, gameObject) => {
            if (this.editorState === 'PLAYING') return; // Block editor input in play mode
            if (!this.showEditor) return; // Block painting if editor is hidden

            if (pointer.button === 0) { // Left mouse button
                this.startHistoryBatch();
                
                // Check if we are clicking an existing Tee in IDLE mode
                if (this.editorState === 'IDLE') {
                    const gridX = gameObject.getData('gridX');
                    const gridY = gameObject.getData('gridY');
                    
                    if (gridX !== undefined && gridY !== undefined) {
                        const tileData = this.gridData[gridY][gridX];
                        if (tileData.type === 'tee') {
                            // Find the hole
                            const hole = this.course.holes.find(h => h.tee.x === gridX && h.tee.y === gridY);
                            if (hole) {
                                this.createPopup(pointer.worldX, pointer.worldY, hole, () => this.editHole(hole));
                                return; // Don't paint
                            }
                        }
                    }
                }
                
                // If popup is open and we click elsewhere, close it
                if (this.popup) {
                    this.popup.destroy();
                    this.popup = null;
                }

                this.paintTile(gameObject);
            }
        });

        this.input.on('gameobjectover', (pointer, gameObject) => {
            if (this.editorState === 'PLAYING') return;
            if (!this.showEditor) return;

            this.updatePreview(gameObject);
            if (pointer.buttons === 1) { // Left mouse button is down
                this.paintTile(gameObject);
            }
        });

        this.input.on('gameobjectout', (pointer, gameObject) => {
            if (this.editorState === 'PLAYING') return;
            if (this.previewActor) this.previewActor.setVisible(false);
        });

        // Zoom Control
        this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
            const zoomAmount = 0.1;
            const minZoom = 0.5;
            const maxZoom = 2.0;

            if (deltaY > 0) {
                // Zoom Out
                this.cameras.main.zoom = Math.max(minZoom, this.cameras.main.zoom - zoomAmount);
            } else {
                // Zoom In
                this.cameras.main.zoom = Math.min(maxZoom, this.cameras.main.zoom + zoomAmount);
            }
        });

        // Pause functionality
        this.input.keyboard.on('keydown-ESC', () => {
            if (this.editorState === 'PLAYING') {
                this.exitPlayMode();
                return;
            }
            this.scene.pause();
            this.scene.launch('PauseScene');
        });

        // Finalize Hole hotkey
        this.input.keyboard.on('keydown-H', () => {
            this.finalizeHole();
        });

        // Discrete Rotation
        this.input.keyboard.on('keydown-Q', () => this.rotateWorld(-1));
        this.input.keyboard.on('keydown-E', () => this.rotateWorld(1));
    }

    updateButtonStyles() {
        for (const [key, btn] of Object.entries(this.uiButtons)) {
            if (key === this.selectedTileType) {
                // Active Style
                btn.setBackgroundColor('#4a90e2'); // Primary Blue
                btn.setColor('#ffffff');
                btn.setFontStyle('bold');
            } else {
                // Default Style
                btn.setBackgroundColor('#333');
                btn.setColor('#ffffff');
                btn.setFontStyle('normal');
            }
        }
    }
}
