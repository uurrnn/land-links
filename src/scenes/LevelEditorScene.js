import Phaser from 'phaser';
import { isoToScreen, screenToIso } from '../utils/IsoUtils.js';
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
        this.gridData = [];
        this.selectedTileType = 'grass';
        this.tileGroup = null;
        this.tileSprites = []; // Optimization for tile access
        
        // State Management
        this.editorState = 'IDLE'; // IDLE, PLACING_TEE, CONSTRUCTING
        this.course = { holes: [] };
        this.currentHole = null;
        this.popup = null;
        this.viewRotation = 0; // 0: 0deg, 1: 90deg, 2: 180deg, 3: 270deg
    }

    preload() {
        this.generateTileTextures();
    }

    createPopup(screenX, screenY, hole, onEdit) {
        if (this.popup) this.popup.destroy();

        this.popup = this.add.container(screenX, screenY).setDepth(20000); // Higher than UI

        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 0.9);
        bg.lineStyle(2, 0xffffff);
        bg.fillRoundedRect(0, 0, 150, 80, 5);
        bg.strokeRoundedRect(0, 0, 150, 80, 5);

        const text = this.add.text(75, 20, `Hole ${hole.number}`, { fontSize: '18px', fill: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
        
        const editBtn = this.add.text(75, 55, 'EDIT', { fontSize: '16px', fill: '#000', backgroundColor: '#fff', padding: { x: 10, y: 5 } })
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
        this.editorState = 'CONSTRUCTING'; // Jump straight to construction, tee exists
        
        // Visual updates
        this.showNotification(`Editing Hole ${hole.number}`, '#ffff00'); // Re-using notification logic if it exists, or just rely on checklist
        this.updateChecklist();
        
        // Select Tee tool by default to imply they can move it? 
        // Or select Fairway? Let's select Fairway as that's the "next step" usually.
        // But the prompt says "replace the tee box", so maybe Tee tool is okay.
        this.selectedTileType = 'tee'; 
        this.updateButtonStyles();
    }

    showNotification(message, color) {
        // Re-implement simple notification since we removed it earlier?
        // Actually, let's just use the checklist title color change or something.
        // Or restore the simple text notification for temporary messages.
        if (!this.notificationText) {
             this.notificationText = this.add.text(this.cameras.main.width / 2, 80, '', { 
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

        this.createBackground();
        this.createGrid();
        this.createTilemap();
        this.createUI();
        this.createPreviewActor();
        this.setupInput();

        // Background Camera (Bottom)
        this.bgCamera = this.cameras.add(0, 0, this.cameras.main.width, this.cameras.main.height);
        
        // UI Camera (Top)
        this.uiCamera = this.cameras.add(0, 0, this.cameras.main.width, this.cameras.main.height);

        // Manually reorder cameras: [bgCamera, mainCamera, uiCamera]
        this.cameras.cameras = [this.bgCamera, this.cameras.main, this.uiCamera];
        
        // Ignore Rules (Using containers is much more robust)
        this.cameras.main.ignore([this.bg, this.uiContainer]);
        this.bgCamera.ignore([this.worldContainer, this.uiContainer, this.previewActor]);
        this.uiCamera.ignore([this.bg, this.worldContainer, this.previewActor]);
    }

    createBackground() {
        this.bg = this.add.tileSprite(0, 0, this.cameras.main.width, this.cameras.main.height, 'bg').setOrigin(0).setScrollFactor(0);
    }

    update(time, delta) {
        this.handleCameraMovement(delta);
    }

    generateTileTextures() {
        const gfx = this.add.graphics();
    
        // Generate a texture for each tile type
        for (const [key, color] of Object.entries(TILE_TYPES)) {
            // If texture exists, destroy it to ensure we regenerate it (hot reload support)
            if (this.textures.exists(key)) {
                this.textures.remove(key);
            }

            gfx.clear();
            gfx.fillStyle(color);
            gfx.lineStyle(1, 0x0b6e0b, 0.1);
    
            // Draw diamond shape
            gfx.beginPath();
            gfx.moveTo(0, TILE_SIZE.height / 2);
            gfx.lineTo(TILE_SIZE.width / 2, 0);
            gfx.lineTo(TILE_SIZE.width, TILE_SIZE.height / 2);
            gfx.lineTo(TILE_SIZE.width / 2, TILE_SIZE.height);
            gfx.closePath();
            gfx.fillPath();

            // Special handling for Fairway stripes
            if (key === 'fairway') {
                gfx.lineStyle(4, 0x4a852a, 0.5); // Darker green stripes for new base color
                const numStripes = 4;
                
                for (let i = 1; i < numStripes; i++) {
                    const t = i / numStripes;
                    
                    // Start point on Top-Left edge
                    const x1 = (TILE_SIZE.width / 2) * (1 - t);
                    const y1 = (TILE_SIZE.height / 2) * t;
                    
                    // End point on Bottom-Right edge
                    const x2 = TILE_SIZE.width - (TILE_SIZE.width / 2) * t;
                    const y2 = (TILE_SIZE.height / 2) + (TILE_SIZE.height / 2) * t;
                    
                    gfx.beginPath();
                    gfx.moveTo(x1, y1);
                    gfx.lineTo(x2, y2);
                    gfx.strokePath();
                }
                
                // Redraw outline to ensure crisp edges
                gfx.lineStyle(1, 0x000000, 0.1);
                gfx.beginPath();
                gfx.moveTo(0, TILE_SIZE.height / 2);
                gfx.lineTo(TILE_SIZE.width / 2, 0);
                gfx.lineTo(TILE_SIZE.width, TILE_SIZE.height / 2);
                gfx.lineTo(TILE_SIZE.width / 2, TILE_SIZE.height);
                gfx.closePath();
            }

            gfx.strokePath();
    
            if (key === 'tee') {
                // Draw Markers
                gfx.fillStyle(0xffffff); // White markers
                const markerRadius = 2; // Smaller radius for scale
                
                // Draw as isometric ellipses (squashed circles)
                // Marker 1
                gfx.fillEllipse(TILE_SIZE.width * 0.25, TILE_SIZE.height * 0.5, markerRadius * 2, markerRadius);
                // Marker 2
                gfx.fillEllipse(TILE_SIZE.width * 0.75, TILE_SIZE.height * 0.5, markerRadius * 2, markerRadius);
                
                // Add a slight shadow/border to markers for visibility
                gfx.lineStyle(1, 0x888888);
                gfx.strokeEllipse(TILE_SIZE.width * 0.25, TILE_SIZE.height * 0.5, markerRadius * 2, markerRadius);
                gfx.strokeEllipse(TILE_SIZE.width * 0.75, TILE_SIZE.height * 0.5, markerRadius * 2, markerRadius);
            }

            gfx.generateTexture(key, TILE_SIZE.width, TILE_SIZE.height);
        }
        
        // Decorations
        for (const [key, value] of Object.entries(DECO_TYPES)) {
            gfx.clear();
            gfx.fillStyle(value.color);
            if (key === 'cup') {
                const centerX = value.size.w / 2;
                const centerY = value.size.h - 4; // Near bottom
                const cupWidth = 8;
                const cupHeight = 4;
                
                // The Cup (black ellipse)
                gfx.fillStyle(0x000000);
                gfx.fillEllipse(centerX, centerY, cupWidth, cupHeight);
                
                // The Pole
                gfx.lineStyle(1, 0xdddddd);
                gfx.lineBetween(centerX, centerY, centerX, 10);
                
                // The Flag (tiny red triangle)
                gfx.fillStyle(0xff0000);
                gfx.beginPath();
                gfx.moveTo(centerX, 10);
                gfx.lineTo(centerX + 8, 15);
                gfx.lineTo(centerX, 20);
                gfx.closePath();
                gfx.fillPath();
            } else {
                gfx.fillRect(0, 0, value.size.w, value.size.h);
            }
            gfx.generateTexture(key, value.size.w, value.size.h);
        }

        // Background
        gfx.clear();
        gfx.fillStyle(0x1a252f); // Dark grey-blue
        gfx.fillRect(0, 0, 64, 64);
        gfx.generateTexture('bg', 64, 64);

        gfx.destroy();
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

    createBackground() {
        this.bg = this.add.tileSprite(0, 0, this.cameras.main.width, this.cameras.main.height, 'bg').setOrigin(0).setScrollFactor(0);
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

        // Sidebar Background
        const uiPanel = this.add.graphics();
        uiPanel.fillStyle(0x222222, 0.95);
        uiPanel.fillRect(0, 0, 250, this.cameras.main.height);
        uiPanel.lineStyle(2, 0x4a90e2, 0.5);
        uiPanel.strokeLineShape(new Phaser.Geom.Line(250, 0, 250, this.cameras.main.height));
        uiPanel.setDepth(uiDepth);
        uiPanel.setInteractive(new Phaser.Geom.Rectangle(0, 0, 250, this.cameras.main.height), Phaser.Geom.Rectangle.Contains);
        this.uiContainer.add(uiPanel);

        let yPos = 20;
        const xPos = 25;
        const btnWidth = 200;

        // --- ACTIONS ---
        const actionsLabel = this.add.text(xPos, yPos, 'ACTIONS', { fontSize: '12px', fill: '#888', fontStyle: 'bold' }).setDepth(uiDepth);
        this.uiContainer.add(actionsLabel);
        yPos += 20;

        const newHoleBtn = this.add.text(xPos, yPos, '+ NEW HOLE', { 
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
        this.uiContainer.add(newHoleBtn);
        
        newHoleBtn.on('pointerdown', () => this.startNewHole());
        newHoleBtn.on('pointerover', () => newHoleBtn.setAlpha(0.8));
        newHoleBtn.on('pointerout', () => newHoleBtn.setAlpha(1));
        
        yPos += 50;

        // --- HOLE ELEMENTS ---
        const holeLabel = this.add.text(xPos, yPos, 'HOLE ELEMENTS', { fontSize: '12px', fill: '#888', fontStyle: 'bold' }).setDepth(uiDepth);
        this.uiContainer.add(holeLabel);
        yPos += 20;

        const holeElements = ['tee', 'green', 'cup'];
        holeElements.forEach(type => {
            const btn = this.add.text(xPos, yPos, type.toUpperCase(), { 
                fontSize: '14px', 
                fill: '#fff',
                backgroundColor: '#333',
                padding: { x: 10, y: 5 },
                fixedWidth: btnWidth
            })
            .setInteractive({ useHandCursor: true })
            .setDepth(uiDepth);
            
            this.uiButtons[type] = btn;
            this.uiContainer.add(btn);

            btn.on('pointerdown', () => {
                this.selectedTileType = type;
                this.updateButtonStyles();
            });

            yPos += 30;
        });

        yPos += 20;

        // --- TERRAIN ---
        const terrainLabel = this.add.text(xPos, yPos, 'TERRAIN', { fontSize: '12px', fill: '#888', fontStyle: 'bold' }).setDepth(uiDepth);
        this.uiContainer.add(terrainLabel);
        yPos += 20;

        const tileTypes = ['grass', 'fairway', 'sand', 'water', 'rough'];
        tileTypes.forEach(type => {
            const btn = this.add.text(xPos, yPos, type.toUpperCase(), { 
                fontSize: '14px', 
                fill: '#fff',
                backgroundColor: '#333',
                padding: { x: 10, y: 5 },
                fixedWidth: btnWidth
            })
            .setInteractive({ useHandCursor: true })
            .setDepth(uiDepth);
            
            this.uiButtons[type] = btn;
            this.uiContainer.add(btn);

            btn.on('pointerdown', () => {
                this.selectedTileType = type;
                this.updateButtonStyles();
            });

            yPos += 30;
        });

        yPos += 20;

        // --- ELEVATION ---
        const elevationLabel = this.add.text(xPos, yPos, 'ELEVATION', { fontSize: '12px', fill: '#888', fontStyle: 'bold' }).setDepth(uiDepth);
        this.uiContainer.add(elevationLabel);
        yPos += 20;
        
        const upBtn = this.add.text(xPos, yPos, 'RAISE (+)', { 
            fontSize: '14px', fill: '#fff', backgroundColor: '#333', padding: { x: 10, y: 5 }, fixedWidth: 95, align: 'center' 
        }).setInteractive({ useHandCursor: true }).setDepth(uiDepth);
        
        const downBtn = this.add.text(xPos + 105, yPos, 'LOWER (-)', { 
            fontSize: '14px', fill: '#fff', backgroundColor: '#333', padding: { x: 10, y: 5 }, fixedWidth: 95, align: 'center' 
        }).setInteractive({ useHandCursor: true }).setDepth(uiDepth);
        
        this.uiButtons['height_up'] = upBtn;
        this.uiButtons['height_down'] = downBtn;
        this.uiContainer.add(upBtn);
        this.uiContainer.add(downBtn);

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
        const decoLabel = this.add.text(xPos, yPos, 'DECORATIONS', { fontSize: '12px', fill: '#888', fontStyle: 'bold' }).setDepth(uiDepth);
        this.uiContainer.add(decoLabel);
        yPos += 20;

        DECO_NAMES.filter(name => name !== 'cup').forEach(type => {
            const btn = this.add.text(xPos, yPos, type.toUpperCase(), { 
                fontSize: '14px', 
                fill: '#fff',
                backgroundColor: '#333',
                padding: { x: 10, y: 5 },
                fixedWidth: btnWidth
            })
            .setInteractive({ useHandCursor: true })
            .setDepth(uiDepth);

            this.uiButtons[type] = btn;
            this.uiContainer.add(btn);

            btn.on('pointerdown', () => {
                this.selectedTileType = type;
                this.updateButtonStyles();
            });

            yPos += 30;
        });

        this.createChecklist();
        this.updateButtonStyles(); // Initial highlight
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
            if (pointer.button === 1) { // Middle mouse button
                isDragging = true;
                startX = pointer.x;
                startY = pointer.y;
            }
        });

        this.input.on('pointerup', (pointer) => {
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


        this.input.on('gameobjectdown', (pointer, gameObject) => {
            if (pointer.button === 0) { // Left mouse button
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
            this.updatePreview(gameObject);
            if (pointer.buttons === 1) { // Left mouse button is down
                this.paintTile(gameObject);
            }
        });

        this.input.on('gameobjectout', (pointer, gameObject) => {
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

    refreshAllTiles() {
        for (let y = 0; y < GRID_SIZE.height; y++) {
            for (let x = 0; x < GRID_SIZE.width; x++) {
                this.refreshTile(x, y);
            }
        }
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

    paintTile(tile) {
        const gridX = tile.getData('gridX');
        const gridY = tile.getData('gridY');
        
        if (gridX === undefined || gridY === undefined) {
            return;
        }

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
                        this.gridData[oldCupY][oldCupX].decoration.destroy();
                        this.gridData[oldCupY][oldCupX].decoration = null;
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
                    if (this.gridData[oldTee.y][oldTee.x].type === 'tee') {
                        this.gridData[oldTee.y][oldTee.x].type = 'grass';
                        this.refreshTile(oldTee.x, oldTee.y);
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
        const x = this.cameras.main.width - 220;
        const y = 10;
        const width = 210;
        const height = 160;

        this.checklistPanel = this.add.graphics();
        this.checklistPanel.fillStyle(0x000000, 0.8);
        this.checklistPanel.lineStyle(2, 0xffffff, 1);
        this.checklistPanel.fillRoundedRect(x, y, width, height, 10);
        this.checklistPanel.strokeRoundedRect(x, y, width, height, 10);
        this.checklistPanel.setDepth(uiDepth);
        this.checklistPanel.setInteractive(new Phaser.Geom.Rectangle(x, y, width, height), Phaser.Geom.Rectangle.Contains);
        this.uiContainer.add(this.checklistPanel);

        this.checklistTitle = this.add.text(x + 105, y + 20, '', { fontSize: '16px', fill: '#fff', fontStyle: 'bold' })
            .setOrigin(0.5).setDepth(uiDepth);
        this.uiContainer.add(this.checklistTitle);
        
        this.checkItems = [];
        const items = ['Place Tee', 'Place Cup', 'Build Hole', 'Press H to Finish'];
        items.forEach((item, index) => {
            const text = this.add.text(x + 20, y + 50 + (index * 25), `[ ] ${item}`, { fontSize: '14px', fill: '#888' }).setDepth(uiDepth);
            this.checkItems.push({ key: item, obj: text });
            this.uiContainer.add(text);
        });

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
}