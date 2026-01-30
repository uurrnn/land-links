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

        // Golf Mode State
        this.golfer = null;
        this.ball = null;
        this.aimGraphics = null;
        this.isBallInFlight = false;
        this.isBallRolling = false;
        this.canSwing = false;
        this.rollData = null;
        
        // UI References
        this.notificationText = null;
        this.uiContainer = null;
        this.worldContainer = null;
        this.editorUI = null;

        this.showEditor = data.startInEditor !== undefined ? data.startInEditor : true;
        this.pendingLoadData = data.initialData || null;
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
            this.updatePlayMode();
            this.updateBallPhysics(delta);
        }
    }

    updateBallPhysics(delta) {
        if (!this.isBallRolling || !this.ball || !this.rollData) return;

        const dt = delta / 1000;
        const d = this.rollData.v * delta; // Distance to move this frame
        
        this.rollData.x += this.rollData.dx * d;
        this.rollData.y += this.rollData.dy * d;
        
        this.ball.x = this.rollData.x;
        this.ball.y = this.rollData.y;

        // Check for Hole Collision while rolling
        const currentHole = this.course.holes[0]; // Assuming hole 0
        const cupPos = this.gridToIso(currentHole.cup.x, currentHole.cup.y);
        const distToCup = Phaser.Math.Distance.Between(this.ball.x, this.ball.y, cupPos.x, cupPos.y);

        // If ball rolls over hole at reasonable speed, it goes in
        if (distToCup < 12 && this.rollData.v < 0.8) {
            this.isBallRolling = false;
            this.isBallInFlight = false;
            this.triggerWin();
            return;
        }

        // Check Terrain
        const gridPos = this.worldToGrid(this.ball.x, this.ball.y);
        const tile = this.gridData[gridPos.y]?.[gridPos.x];
        const terrain = tile ? tile.type : 'out';

        if (terrain === 'water') {
            this.isBallRolling = false;
            this.handleImpact(this.ball.x, this.ball.y, 0, 0, 0); // Trigger Splash
            return;
        }

        if (terrain === 'sand') {
            this.isBallRolling = false;
            this.showNotification("PLOP!", "#f1c40f");
            this.isBallInFlight = false;
            this.ballGrid = gridPos;
            this.checkBallLanding();
            return;
        }

        // Apply Friction
        let friction = 0.92; // Balanced
        if (terrain === 'green') friction = 0.96; 
        if (terrain === 'rough') friction = 0.81; 
        if (terrain === 'out') friction = 0.85;

        // We apply friction per frame, but let's normalize it to time
        this.rollData.v *= Math.pow(friction, delta / 16); 

        if (this.rollData.v < 0.03) { // Slightly lower stop threshold
            this.isBallRolling = false;
            this.isBallInFlight = false;
            this.ballGrid = gridPos;
            this.checkBallLanding();
        }
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

        // Golfer
        gfx.clear();
        gfx.fillStyle(0x3498db); // Blue shirt
        gfx.fillRect(8, 16, 16, 24); // Body
        gfx.fillStyle(0xe0ac69); // Skin tone
        gfx.fillCircle(16, 8, 8); // Head
        gfx.fillStyle(0x333333); // Pants
        gfx.fillRect(8, 40, 16, 8); // Feet/Pants
        // Club (horizontal line initially)
        gfx.lineStyle(2, 0x999999);
        gfx.lineBetween(16, 30, 32, 30);
        gfx.generateTexture('golfer', 40, 48);

        // Ball
        gfx.clear();
        gfx.fillStyle(0xffffff);
        gfx.fillCircle(4, 4, 3);
        gfx.lineStyle(1, 0x888888);
        gfx.strokeCircle(4, 4, 3);
        gfx.generateTexture('ball', 8, 8);

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

        // --- HUD ELEMENTS (Always Visible) ---
        const toggleEditorBtn = this.add.text(20, this.cameras.main.height - 50, '🛠 EDIT COURSE', {
            fontFamily: '"Outfit", sans-serif',
            fontSize: '16px',
            fill: '#fff',
            backgroundColor: '#34495e',
            padding: { x: 15, y: 10 },
            fontStyle: 'bold'
        })
        .setInteractive({ useHandCursor: true })
        .setDepth(uiDepth + 100);
        
        this.uiContainer.add(toggleEditorBtn);
        toggleEditorBtn.on('pointerdown', () => this.toggleEditor());

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
        
        yPos += 50;

        const playBtn = this.add.text(xPos, yPos, '▶ PLAY TEST', { 
            fontFamily: '"Outfit", sans-serif',
            fontSize: '16px', 
            fill: '#fff', 
            backgroundColor: '#2980b9', 
            padding: { x: 10, y: 8 },
            fixedWidth: btnWidth,
            align: 'center',
            fontStyle: 'bold'
        })
        .setInteractive({ useHandCursor: true })
        .setDepth(uiDepth);
        this.editorUI.add(playBtn);
        
        playBtn.on('pointerdown', () => this.enterPlayMode());
        playBtn.on('pointerover', () => playBtn.setAlpha(0.8));
        playBtn.on('pointerout', () => playBtn.setAlpha(1));

        yPos += 60;

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
            course: this.course,
            gridData: serializedGrid,
            viewRotation: this.viewRotation
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

    enterPlayMode() {
        if (this.course.holes.length === 0) {
            this.showNotification("Need at least 1 hole to play!", "#ff0000");
            return;
        }

        // Hide Editor UI for gameplay
        this.editorUI.setVisible(false);

        // Robust Cleanup for re-entry/restart
        if (this.ball) this.tweens.killTweensOf(this.ball);
        if (this.golfer) this.tweens.killTweensOf(this.golfer);
        this.isBallInFlight = false;
        this.isBallRolling = false;
        this.rollData = null;

        this.editorState = 'PLAYING';
        this.canSwing = false;
        this.showNotification("ENTERING PLAY MODE - ESC to Exit", "#3498db");

        // Use the first hole for now
        const firstHole = this.course.holes[0];
        this.golferGrid = { x: firstHole.tee.x, y: firstHole.tee.y };
        this.ballGrid = { x: firstHole.tee.x, y: firstHole.tee.y };

        const teePos = this.gridToIso(this.golferGrid.x, this.golferGrid.y);

        // Spawn Golfer
        if (this.golfer) this.golfer.destroy();
        this.golfer = this.add.sprite(teePos.x, teePos.y, 'golfer');
        this.golfer.setOrigin(0.5, 1);
        this.worldContainer.add(this.golfer);

        // Spawn Ball
        if (this.ball) this.ball.destroy();
        this.ball = this.add.sprite(teePos.x + 10, teePos.y, 'ball');
        this.ball.setOrigin(0.5, 0.5);
        this.worldContainer.add(this.ball);

        // Setup Aiming Graphics
        if (this.aimGraphics) this.aimGraphics.destroy();
        this.aimGraphics = this.add.graphics();
        this.worldContainer.add(this.aimGraphics);

        this.isBallInFlight = false;
        this.cameras.main.centerOn(teePos.x, teePos.y);
        this.cameras.main.setZoom(1.5);

        // Prevent accidental swing from the button click
        this.time.delayedCall(100, () => {
            this.canSwing = true;
        });
    }

    exitPlayMode() {
        this.editorState = 'IDLE';
        this.canSwing = false;
        
        // Restore Editor UI if it was open
        this.editorUI.setVisible(this.showEditor);

        if (this.golfer) this.golfer.destroy();
        if (this.ball) this.ball.destroy();
        if (this.aimGraphics) this.aimGraphics.destroy();
        this.golfer = null;
        this.ball = null;
        this.aimGraphics = null;
        this.showNotification("RETURNED TO EDITOR", "#ffffff");
        this.cameras.main.setZoom(1);
    }

    updatePlayMode() {
        if (!this.golfer || !this.ball || this.isBallInFlight) return;

        const pointer = this.input.activePointer;
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);

        // Update Golfer Rotation/Flip to face mouse
        this.golfer.flipX = (worldPoint.x < this.golfer.x);

        // Draw Trajectory Arc
        this.aimGraphics.clear();
        this.aimGraphics.lineStyle(2, 0xffffff, 0.5);

        const startX = this.ball.x;
        const startY = this.ball.y;
        const endX = worldPoint.x;
        const endY = worldPoint.y;

        const dist = Phaser.Math.Distance.Between(startX, startY, endX, endY);
        const maxHeight = Math.min(dist / 2, 100);

        // Simple quadratic bezier for the arc
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2 - maxHeight;

        this.aimGraphics.lineStyle(2, 0xffffff, 0.5);
        const curve = new Phaser.Curves.QuadraticBezier(
            new Phaser.Math.Vector2(startX, startY),
            new Phaser.Math.Vector2(midX, midY),
            new Phaser.Math.Vector2(endX, endY)
        );
        const points = curve.getPoints(20);
        this.aimGraphics.strokePoints(points);

        // Draw Landing Target
        this.aimGraphics.fillStyle(0xffffff, 0.3);
        this.aimGraphics.fillCircle(endX, endY, 10);
    }

    swingAndHit() {
        if (this.isBallInFlight || !this.canSwing) return;
        this.isBallInFlight = true;

        const pointer = this.input.activePointer;
        const targetPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);

        // "Rough" Swing Animation (Simple rotation)
        this.tweens.add({
            targets: this.golfer,
            angle: this.golfer.flipX ? 45 : -45,
            duration: 150,
            yoyo: true,
            onComplete: () => {
                this.golfer.angle = 0;
                this.launchBall(targetPoint.x, targetPoint.y);
            }
        });
    }

    launchBall(endX, endY) {
        const startX = this.ball.x;
        const startY = this.ball.y;
        
        const dist = Phaser.Math.Distance.Between(startX, startY, endX, endY);
        const maxHeight = Math.min(dist / 2, 150);
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2 - maxHeight;

        this.aimGraphics.clear();

        // 1. FLIGHT PHASE
        const flightDuration = 600 + (dist / 1.5);
        
        this.tweens.add({
            targets: { t: 0 },
            t: 1,
            duration: flightDuration,
            ease: 'Linear', // Linear horizontal progress = Gravity feel
            onUpdate: (tween) => {
                if (!this.ball) return;
                const curT = tween.getValue();
                
                // Path on the ground plane (Linear)
                this.ball.x = (1 - curT) * (1 - curT) * startX + 2 * (1 - curT) * curT * midX + curT * curT * endX;
                this.ball.y = (1 - curT) * (1 - curT) * startY + 2 * (1 - curT) * curT * midY + curT * curT * endY;
                
                // Visual Height (Parabolic scale/offset)
                const height = Math.sin(curT * Math.PI);
                this.ball.setScale(1 + height * 0.6);
                this.ball.y -= height * maxHeight * 0.5; // Visual arc offset
            },
            onComplete: () => {
                if (!this.ball) return;
                this.handleImpact(endX, endY, (endX - startX) / dist, (endY - startY) / dist, dist);
            }
        });
    }

    handleImpact(x, y, dirX, dirY, power) {
        this.ball.setScale(1);
        const gridPos = this.worldToGrid(x, y);
        const tile = this.gridData[gridPos.y]?.[gridPos.x];
        const terrain = tile ? tile.type : 'out';

        // Dampen power for extremely long shots to prevent physics explosion
        let effectivePower = power;
        if (power > 400) {
            effectivePower = 400 + (power - 400) * 0.5;
        }

        if (terrain === 'water') {
            this.showNotification("SPLASH!", "#3498db");
            this.tweens.add({
                targets: this.ball,
                alpha: 0,
                scale: 0.5,
                duration: 500,
                onComplete: () => this.exitPlayMode()
            });
            return;
        }

        if (terrain === 'sand') {
            this.showNotification("PLOP!", "#f1c40f");
            this.ballGrid = gridPos;
            this.checkBallLanding();
            this.isBallInFlight = false;
            return;
        }

        // Determine bounce and roll based on terrain
        let bounceMult = 0.25; // Reduced from 0.4
        let rollMult = 0.25; // Balanced

        if (terrain === 'green') { bounceMult = 0.25; rollMult = 0.275; } // Reduced bounce
        if (terrain === 'rough') { bounceMult = 0.10; rollMult = 0.075; } // Balanced

        const bounceDist = effectivePower * bounceMult * 1.5; // Increased length
        if (bounceDist > 20) {
            this.bounceBall(x, y, dirX, dirY, bounceDist, rollMult);
        } else {
            // Fix: Use bounce-consistent power formula to avoid jump at threshold
            this.rollBall(x, y, dirX, dirY, effectivePower * bounceMult * rollMult * 0.5);
        }
    }

    bounceBall(startX, startY, dirX, dirY, dist, rollMult) {
        const endX = startX + dirX * dist;
        const endY = startY + dirY * dist;
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2 - (dist / 4); // Shallower arc

        // Scale duration with distance so long bounces don't look too fast
        const duration = 300 + (dist);

        this.tweens.add({
            targets: { t: 0 },
            t: 1,
            duration: duration,
            ease: 'Linear',
            onUpdate: (tween) => {
                if (!this.ball) return;
                const curT = tween.getValue();
                this.ball.x = (1 - curT) * (1 - curT) * startX + 2 * (1 - curT) * curT * midX + curT * curT * endX;
                this.ball.y = (1 - curT) * (1 - curT) * startY + 2 * (1 - curT) * curT * midY + curT * curT * endY;
                
                const height = Math.sin(curT * Math.PI);
                this.ball.y -= height * (dist / 10); // Shorter height
            },
            onComplete: () => {
                if (!this.ball) return;
                this.rollBall(this.ball.x, this.ball.y, dirX, dirY, dist * rollMult * 0.5);
            }
        });
    }

    rollBall(startX, startY, dirX, dirY, power) {
        this.isBallRolling = true;
        this.rollData = {
            x: startX,
            y: startY,
            dx: dirX,
            dy: dirY,
            v: power / 45 // Lowered velocity for better control
        };
    }

    triggerWin() {
        this.showNotification("IN THE HOLE!", "#ffff00");
        this.ball.setVisible(false);
        this.canSwing = false; // Disable swinging immediately
        this.time.delayedCall(2000, () => {
            this.exitPlayMode();
        });
    }

    checkBallLanding() {
        // Find if ball is near cup
        const currentHole = this.course.holes[0]; // Still assuming hole 0
        const cupPos = this.gridToIso(currentHole.cup.x, currentHole.cup.y);
        const dist = Phaser.Math.Distance.Between(this.ball.x, this.ball.y, cupPos.x, cupPos.y);

        if (dist < 15) {
            this.triggerWin();
        } else {
            // Move golfer to ball for next shot
            const targetX = this.ball.x - 10;
            const targetY = this.ball.y;
            this.tweens.add({
                targets: this.golfer,
                x: targetX,
                y: targetY,
                duration: 500,
                onComplete: () => {
                    this.golferGrid = this.worldToGrid(targetX, targetY);
                }
            });
        }
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
            if (this.editorState === 'PLAYING' && pointer.button === 0) {
                this.swingAndHit();
                return;
            }

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
            if (this.editorState === 'PLAYING') return; // Block editor input in play mode
            if (!this.showEditor) return; // Block painting if editor is hidden

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

        // Update Golfer/Ball positions on rotation
        if (this.golfer) {
            const pos = this.gridToIso(this.golferGrid.x, this.golferGrid.y);
            this.golfer.setPosition(pos.x, pos.y);
        }
        if (this.ball) {
            const pos = this.gridToIso(this.ballGrid.x, this.ballGrid.y);
            this.ball.setPosition(pos.x, pos.y);
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
        this.quickSave(); // Auto-save on finalize to the current slot
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
        this.editorUI.add(this.checklistPanel);

        this.checklistTitle = this.add.text(x + 105, y + 20, '', { 
            fontFamily: '"Outfit", sans-serif',
            fontSize: '16px', 
            fill: '#fff', 
            fontStyle: 'bold' 
        })
            .setOrigin(0.5).setDepth(uiDepth);
        this.editorUI.add(this.checklistTitle);
        
        this.checkItems = [];
        const items = ['Place Tee', 'Place Cup', 'Build Hole', 'Press H to Finish'];
        items.forEach((item, index) => {
            const text = this.add.text(x + 20, y + 50 + (index * 25), `[ ] ${item}`, { 
                fontFamily: '"Outfit", sans-serif',
                fontSize: '14px', 
                fill: '#888' 
            }).setDepth(uiDepth);
            this.checkItems.push({ key: item, obj: text });
            this.editorUI.add(text);
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