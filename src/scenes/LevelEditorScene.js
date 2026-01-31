import Phaser from 'phaser';
import { isoToScreen, screenToIso } from '../utils/IsoUtils.js';
import AssetGenerator from '../utils/AssetGenerator.js';
import GolfSystem from '../objects/GolfSystem.js';
import HistoryManager from '../objects/HistoryManager.js';
import { serializeGrid, saveToSlot, loadSlotData, exportToFile, importFromFile } from '../utils/SaveManager.js';
import {
    GRID_SIZE,
    TILE_SIZE,
    DECO_NAMES,
    EDITOR_STATES,
    TEXT_STYLES,
    UI_LAYOUT,
    AUTO_SLOT_ID,
    NOTIFY_COLORS,
    DEPTH,
    createEmptyTile
} from '../consts/GameConfig.js';

function rotateCoord(x, y, rotation, maxW, maxH) {
    switch (rotation) {
        case 1: return { x: y, y: maxW - x };
        case 2: return { x: maxW - x, y: maxH - y };
        case 3: return { x: maxH - y, y: x };
        default: return { x, y };
    }
}

function inverseRotateCoord(x, y, rotation, maxW, maxH) {
    switch (rotation) {
        case 1: return { x: maxW - y, y: x };
        case 2: return { x: maxW - x, y: maxH - y };
        case 3: return { x: y, y: maxH - x };
        default: return { x, y };
    }
}

export default class LevelEditorScene extends Phaser.Scene {
    constructor() {
        super({ key: 'LevelEditorScene' });
    }

    init(data) {
        this.gridData = [];
        this.tileSprites = [];
        this.selectedTileType = 'grass';
        this.editorState = EDITOR_STATES.IDLE;
        this.course = { holes: [] };
        this.currentHole = null;
        this.popup = null;
        this.viewRotation = 0;
        this.currentSlot = data.slotId || AUTO_SLOT_ID;
        this.clubName = data.clubName || (data.initialData && data.initialData.clubName) || 'Unnamed Club';

        this.golfSystem = new GolfSystem(this);
        this.history = new HistoryManager(this);

        this.notificationText = null;
        this.uiContainer = null;
        this.worldContainer = null;
        this.editorUI = null;

        this.showEditor = data.startInEditor !== undefined ? data.startInEditor : true;
        this.pendingLoadData = data.initialData || null;
    }

    preload() {
        new AssetGenerator(this).generateAll();
    }

    // ── Popup & Notifications ──────────────────────────────────────

    createPopup(screenX, screenY, hole, onEdit) {
        if (this.popup) this.popup.destroy();

        this.popup = this.add.container(screenX, screenY).setDepth(DEPTH.OVERLAY);

        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 0.9);
        bg.lineStyle(2, 0xffffff);
        bg.fillRoundedRect(0, 0, 150, 80, 5);
        bg.strokeRoundedRect(0, 0, 150, 80, 5);

        const text = this.add.text(75, 20, `Hole ${hole.number}`, {
            ...TEXT_STYLES.popup
        }).setOrigin(0.5);

        const editBtn = this.add.text(75, 55, 'EDIT', {
            ...TEXT_STYLES.popupBtn
        })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });

        editBtn.on('pointerdown', () => {
            onEdit();
            this.popup.destroy();
            this.popup = null;
        });

        this.popup.add([bg, text, editBtn]);
        this.popup.setInteractive(new Phaser.Geom.Rectangle(0, 0, 150, 80), Phaser.Geom.Rectangle.Contains);

        this.uiCamera.ignore(this.popup);
        if (this.bgCamera) this.bgCamera.ignore(this.popup);
    }

    editHole(hole) {
        this.course.holes = this.course.holes.filter(h => h !== hole);
        this.currentHole = hole;
        this.editorState = EDITOR_STATES.CONSTRUCTING;

        this.showNotification(`Editing Hole ${hole.number}`, NOTIFY_COLORS.warning);
        this.updateChecklist();
        this.selectedTileType = 'tee';
        this.updateButtonStyles();
    }

    showNotification(message, color) {
        if (!this.notificationText) {
            this.notificationText = this.add.text(this.scale.width / 2, 80, '', {
                ...TEXT_STYLES.heading,
                fontSize: '24px',
                backgroundColor: '#000000',
                padding: { x: 10, y: 5 }
            }).setOrigin(0.5).setAlpha(0).setDepth(DEPTH.OVERLAY);
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

    // ── Scene Lifecycle ────────────────────────────────────────────

    create() {
        this.setupWorldAndCamera();

        this.worldContainer = this.add.container(0, 0);

        this.uiContainer = this.add.container(0, 0);
        this.uiContainer.setScrollFactor(0);

        this.editorUI = this.add.container(0, 0);
        this.uiContainer.add(this.editorUI);

        this.createBackground();
        this.createGrid();
        this.createTilemap();
        this.createUI();
        this.createPreviewActor();
        this.setupInput();

        this.bgCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
        this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
        this.cameras.cameras = [this.bgCamera, this.cameras.main, this.uiCamera];

        this.cameras.main.ignore([this.bg, this.uiContainer]);
        this.bgCamera.ignore([this.worldContainer, this.uiContainer, this.previewActor]);
        this.uiCamera.ignore([this.bg, this.worldContainer, this.previewActor]);

        this.editorUI.setVisible(this.showEditor);

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
        if (this.editorState === EDITOR_STATES.PLAYING) {
            this.golfSystem.update(delta);
        }
    }

    enterPlayMode() {
        if (this.golfSystem.enterPlayMode(this.course)) {
            this.editorUI.setVisible(false);
            this.editorState = EDITOR_STATES.PLAYING;
        }
    }

    exitPlayMode() {
        this.editorState = EDITOR_STATES.IDLE;
        this.editorUI.setVisible(this.showEditor);
        this.golfSystem.exitPlayMode();
    }

    // ── World & Grid Setup ─────────────────────────────────────────

    setupWorldAndCamera() {
        const worldWidth = GRID_SIZE.width * TILE_SIZE.width;
        const worldHeight = GRID_SIZE.height * TILE_SIZE.height;
        const margin = 1000;

        this.cameras.main.setBounds(-margin, -margin, worldWidth + margin * 2, worldHeight + margin * 2);
        this.physics.world.setBounds(-margin, -margin, worldWidth + margin * 2, worldHeight + margin * 2);

        const centerX = worldWidth / 2;
        const centerY = worldHeight / 4;
        this.cameras.main.centerOn(centerX, centerY);
    }

    createGrid() {
        for (let y = 0; y < GRID_SIZE.height; y++) {
            this.gridData[y] = [];
            for (let x = 0; x < GRID_SIZE.width; x++) {
                this.gridData[y][x] = createEmptyTile();
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
                    halfW, 0,
                    TILE_SIZE.width, halfH,
                    halfW, TILE_SIZE.height,
                    0, halfH
                ]);
                tile.setInteractive(shape, Phaser.Geom.Polygon.Contains);

                this.worldContainer.add(tile);
                this.tileSprites[y][x] = tile;
            }
        }
    }

    // ── UI Creation ────────────────────────────────────────────────

    createUI() {
        const uiDepth = DEPTH.UI;
        this.uiButtons = {};

        const btnY = this.cameras.main.height - 50;
        const centerX = this.cameras.main.width / 2;

        // HUD buttons (always visible)
        const toggleEditorBtn = this.add.text(centerX - 70, btnY, 'EDITOR', {
            ...TEXT_STYLES.buttonSmall,
            backgroundColor: '#34495e',
            padding: { x: 15, y: 10 }
        })
            .setOrigin(0.5, 0)
            .setInteractive({ useHandCursor: true })
            .setDepth(DEPTH.HUD);

        const playCourseBtn = this.add.text(centerX + 70, btnY, 'PLAY', {
            ...TEXT_STYLES.buttonSmall,
            backgroundColor: '#2980b9',
            padding: { x: 15, y: 10 }
        })
            .setOrigin(0.5, 0)
            .setInteractive({ useHandCursor: true })
            .setDepth(DEPTH.HUD);

        this.uiContainer.add([toggleEditorBtn, playCourseBtn]);
        toggleEditorBtn.on('pointerdown', () => this.toggleEditor());
        playCourseBtn.on('pointerdown', () => this.enterPlayMode());

        // Sidebar panel
        const { SIDEBAR_WIDTH, SIDEBAR_PADDING, BUTTON_WIDTH } = UI_LAYOUT;
        const uiPanel = this.add.graphics();
        uiPanel.fillStyle(0x222222, 0.95);
        uiPanel.fillRect(0, 0, SIDEBAR_WIDTH, this.cameras.main.height);
        uiPanel.lineStyle(2, 0x4a90e2, 0.5);
        uiPanel.strokeLineShape(new Phaser.Geom.Line(SIDEBAR_WIDTH, 0, SIDEBAR_WIDTH, this.cameras.main.height));
        uiPanel.setDepth(uiDepth);
        uiPanel.setInteractive(new Phaser.Geom.Rectangle(0, 0, SIDEBAR_WIDTH, this.cameras.main.height), Phaser.Geom.Rectangle.Contains);
        this.editorUI.add(uiPanel);

        const xPos = SIDEBAR_PADDING;
        const btnWidth = BUTTON_WIDTH;
        let yPos = 20;

        // Actions section
        yPos = this.createSectionLabel('ACTIONS', xPos, yPos, uiDepth);

        const newHoleBtn = this.add.text(xPos, yPos, '+ NEW HOLE', {
            ...TEXT_STYLES.buttonSmall,
            backgroundColor: '#27ae60',
            padding: { x: 10, y: 8 },
            fixedWidth: btnWidth,
            align: 'center'
        })
            .setInteractive({ useHandCursor: true })
            .setDepth(uiDepth);
        this.editorUI.add(newHoleBtn);
        newHoleBtn.on('pointerdown', () => this.startNewHole());
        newHoleBtn.on('pointerover', () => newHoleBtn.setAlpha(0.8));
        newHoleBtn.on('pointerout', () => newHoleBtn.setAlpha(1));
        yPos += 45;

        const undoBtn = this.add.text(xPos, yPos, '↶ UNDO', {
            ...TEXT_STYLES.sidebarBtn, fixedWidth: 95, align: 'center'
        }).setInteractive({ useHandCursor: true }).setDepth(uiDepth);

        const redoBtn = this.add.text(xPos + 105, yPos, '↷ REDO', {
            ...TEXT_STYLES.sidebarBtn, fixedWidth: 95, align: 'center'
        }).setInteractive({ useHandCursor: true }).setDepth(uiDepth);

        this.editorUI.add(undoBtn);
        this.editorUI.add(redoBtn);
        undoBtn.on('pointerdown', () => this.history.undo());
        redoBtn.on('pointerdown', () => this.history.redo());
        yPos += 50;

        // Tool sections (data-driven)
        yPos = this.createToolSection('HOLE ELEMENTS', ['tee', 'green', 'cup'], xPos, yPos, btnWidth, uiDepth);
        yPos += 20;
        yPos = this.createToolSection('TERRAIN', ['grass', 'fairway', 'sand', 'water', 'rough'], xPos, yPos, btnWidth, uiDepth);
        yPos += 20;

        // Elevation (special: two half-width buttons)
        yPos = this.createSectionLabel('ELEVATION', xPos, yPos, uiDepth);

        const upBtn = this.add.text(xPos, yPos, 'RAISE (+)', {
            ...TEXT_STYLES.sidebarBtn, fixedWidth: 95, align: 'center'
        }).setInteractive({ useHandCursor: true }).setDepth(uiDepth);

        const downBtn = this.add.text(xPos + 105, yPos, 'LOWER (-)', {
            ...TEXT_STYLES.sidebarBtn, fixedWidth: 95, align: 'center'
        }).setInteractive({ useHandCursor: true }).setDepth(uiDepth);

        this.uiButtons['height_up'] = upBtn;
        this.uiButtons['height_down'] = downBtn;
        this.editorUI.add(upBtn);
        this.editorUI.add(downBtn);

        upBtn.on('pointerdown', () => { this.selectedTileType = 'height_up'; this.updateButtonStyles(); });
        downBtn.on('pointerdown', () => { this.selectedTileType = 'height_down'; this.updateButtonStyles(); });
        yPos += 40;

        // Decorations
        const decoItems = DECO_NAMES.filter(name => name !== 'cup');
        yPos = this.createToolSection('DECORATIONS', decoItems, xPos, yPos, btnWidth, uiDepth);

        this.createChecklist();
        this.updateButtonStyles();
    }

    createSectionLabel(text, xPos, yPos, uiDepth) {
        const label = this.add.text(xPos, yPos, text, { ...TEXT_STYLES.sectionLabel }).setDepth(uiDepth);
        this.editorUI.add(label);
        return yPos + 20;
    }

    createToolSection(label, items, xPos, yPos, btnWidth, uiDepth) {
        yPos = this.createSectionLabel(label, xPos, yPos, uiDepth);

        items.forEach(type => {
            const btn = this.add.text(xPos, yPos, type.toUpperCase(), {
                ...TEXT_STYLES.sidebarBtn,
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

        return yPos;
    }

    toggleEditor() {
        this.showEditor = !this.showEditor;
        this.editorUI.setVisible(this.showEditor);
        this.showNotification(this.showEditor ? "EDITOR OPENED" : "EDITOR CLOSED", NOTIFY_COLORS.info);
    }

    updateButtonStyles() {
        for (const [key, btn] of Object.entries(this.uiButtons)) {
            if (key === this.selectedTileType) {
                btn.setBackgroundColor('#4a90e2');
                btn.setColor('#ffffff');
                btn.setFontStyle('bold');
            } else {
                btn.setBackgroundColor('#333');
                btn.setColor('#ffffff');
                btn.setFontStyle('normal');
            }
        }
    }

    // ── Checklist ──────────────────────────────────────────────────

    createChecklist() {
        const uiDepth = DEPTH.UI;
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
            ...TEXT_STYLES.buttonSmall
        }).setOrigin(0.5, 0).setDepth(uiDepth);
        this.editorUI.add(this.checklistTitle);

        this.checkItems = [];
        const items = ['Place Tee', 'Place Cup', 'Build Hole', 'Finish'];
        items.forEach((item, index) => {
            const text = this.add.text(x + padding, y + 75 + (index * 25), `[ ] ${item}`, {
                ...TEXT_STYLES.body
            }).setDepth(uiDepth);
            this.checkItems.push({ key: item, obj: text });
            this.editorUI.add(text);
        });

        const finishBtn = this.add.text(x + padding, y + height - padding - 40, 'FINISH HOLE', {
            ...TEXT_STYLES.buttonSmall,
            backgroundColor: '#27ae60',
            padding: { x: 0, y: 10 },
            fixedWidth: width - (padding * 2),
            align: 'center'
        })
            .setInteractive({ useHandCursor: true })
            .setDepth(uiDepth);

        this.editorUI.add(finishBtn);
        finishBtn.on('pointerdown', () => this.finalizeHole());

        this.updateChecklist();
    }

    updateChecklist() {
        if (this.editorState === EDITOR_STATES.IDLE) {
            this.checkItems.forEach(item => item.obj.setText(`[ ] ${item.key}`).setStyle({ fill: '#888' }));

            if (this.course.holes.length === 0) {
                this.checklistTitle.setText('START FIRST HOLE');
                this.checklistTitle.setStyle({ fill: '#27ae60' });
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
        const isBuilding = this.editorState === EDITOR_STATES.CONSTRUCTING;

        this.checkItems[0].obj.setText(`${isTeeDone ? '[X]' : '[ ]'} Place Tee`).setStyle({ fill: isTeeDone ? '#0f0' : '#fff' });
        this.checkItems[1].obj.setText(`${isCupDone ? '[X]' : '[ ]'} Place Cup`).setStyle({ fill: isCupDone ? '#0f0' : '#fff' });
        this.checkItems[2].obj.setText(`[${isBuilding ? '*' : ' '}] Build Hole`).setStyle({ fill: isBuilding ? '#fff' : '#888' });
        this.checkItems[3].obj.setText(`[ ] Press H to Finish`).setStyle({ fill: (isTeeDone && isCupDone) ? '#ffff00' : '#888' });
    }

    // ── Save / Load ────────────────────────────────────────────────

    buildSaveData() {
        return {
            clubName: this.clubName,
            course: this.course,
            gridData: serializeGrid(this.gridData),
            viewRotation: this.viewRotation
        };
    }

    saveCourse() {
        this.quickSave(AUTO_SLOT_ID);
        const data = { ...this.buildSaveData(), timestamp: new Date().getTime() };
        exportToFile(data);
        this.showNotification("Course Exported!", NOTIFY_COLORS.success);
    }

    loadCourse() {
        importFromFile().then(data => {
            this.importCourse(data);
        }).catch(() => {
            this.showNotification("Invalid JSON File!", NOTIFY_COLORS.error);
        });
    }

    importCourse(data) {
        if (!data.gridData || !data.course) return;

        this.clubName = data.clubName || 'Unnamed Club';

        this.forEachTile((_x, _y, tile) => {
            if (tile.decoration) tile.decoration.destroy();
        });

        this.course = data.course;
        this.viewRotation = data.viewRotation || 0;

        this.forEachTile((x, y) => {
            const tileData = data.gridData[y][x];
            this.gridData[y][x] = {
                type: tileData.type,
                height: tileData.height,
                holeId: tileData.holeId,
                decoration: null
            };

            if (tileData.decoration) {
                const isoPos = this.gridToIso(x, y, tileData.height);
                const deco = this.add.sprite(isoPos.x, isoPos.y, tileData.decoration);
                deco.setOrigin(0.5, 1);
                this.worldContainer.add(deco);
                this.gridData[y][x].decoration = deco;
            }
        });

        this.refreshAllTiles();
        this.updateChecklist();
        this.showNotification("Course Loaded Successfully!", NOTIFY_COLORS.success);
    }

    quickSave(slotId = null) {
        const id = slotId || this.currentSlot;
        saveToSlot(id, this.buildSaveData());
        if (id !== AUTO_SLOT_ID) {
            this.showNotification(`Saved to Slot ${id}`, NOTIFY_COLORS.success);
        }
    }

    loadFromSlot(slotId) {
        const data = loadSlotData(slotId);
        if (data) {
            this.importCourse(data);
            return true;
        }
        this.showNotification("Failed to load slot!", NOTIFY_COLORS.error);
        return false;
    }

    // ── Grid Queries ───────────────────────────────────────────────

    forEachTile(callback) {
        for (let y = 0; y < GRID_SIZE.height; y++) {
            for (let x = 0; x < GRID_SIZE.width; x++) {
                if (callback(x, y, this.gridData[y][x]) === false) return;
            }
        }
    }

    // ── Hole Management ────────────────────────────────────────────

    startNewHole() {
        if (this.editorState !== EDITOR_STATES.IDLE) {
            this.showNotification("Finish current hole first!", NOTIFY_COLORS.error);
            return;
        }

        const holeNumber = this.course.holes.length + 1;
        this.currentHole = {
            number: holeNumber,
            tee: null,
            cup: null
        };

        this.editorState = EDITOR_STATES.PLACING_TEE;
        this.selectedTileType = 'tee';
        this.updateChecklist();
        this.updateButtonStyles();
        this.showNotification(`Hole ${holeNumber}: Place the Tee`, NOTIFY_COLORS.success);
    }

    finalizeHole() {
        if (this.editorState === EDITOR_STATES.IDLE || !this.currentHole) return;

        if (!this.currentHole.tee) {
            this.showNotification("Cannot finish: Missing Tee!", NOTIFY_COLORS.error);
            return;
        }
        if (!this.currentHole.cup) {
            this.showNotification("Cannot finish: Missing Cup!", NOTIFY_COLORS.error);
            return;
        }

        this.course.holes.push(this.currentHole);
        this.showNotification(`Hole ${this.currentHole.number} Finalized!`, NOTIFY_COLORS.success);

        this.editorState = EDITOR_STATES.IDLE;
        this.currentHole = null;
        this.updateChecklist();
        this.quickSave();
    }

    // ── Tile Painting ──────────────────────────────────────────────

    paintTile(tile) {
        const gridX = tile.getData('gridX');
        const gridY = tile.getData('gridY');
        if (gridX === undefined || gridY === undefined) return;

        const beforeState = this.history.getTileState(gridX, gridY);

        // State machine guards
        if (this.editorState === EDITOR_STATES.IDLE) {
            if (this.selectedTileType === 'tee' || this.selectedTileType === 'cup') return;
        }
        if (this.editorState === EDITOR_STATES.PLACING_TEE) {
            if (this.selectedTileType !== 'tee') {
                this.selectedTileType = 'tee';
                return;
            }
        }

        // Dispatch to appropriate handler
        if (this.selectedTileType === 'height_up' || this.selectedTileType === 'height_down') {
            this.paintHeight(gridX, gridY);
        } else if (DECO_NAMES.includes(this.selectedTileType)) {
            this.paintDecoration(gridX, gridY);
        } else {
            this.paintTerrain(gridX, gridY);
        }

        this.refreshTile(gridX, gridY);
        this.updateChecklist();
        this.history.recordChange(gridX, gridY, beforeState);
    }

    paintHeight(gridX, gridY) {
        if (this.selectedTileType === 'height_up') {
            this.gridData[gridY][gridX].height += 5;
        } else {
            this.gridData[gridY][gridX].height = Math.max(0, this.gridData[gridY][gridX].height - 5);
        }
    }

    paintDecoration(gridX, gridY) {
        const decoType = this.selectedTileType;

        // Cup has special placement logic
        if (decoType === 'cup') {
            if (this.editorState !== EDITOR_STATES.CONSTRUCTING) return;

            // Remove old cup visual if moving it
            if (this.currentHole.cup) {
                const oldX = this.currentHole.cup.x;
                const oldY = this.currentHole.cup.y;
                if (this.gridData[oldY][oldX].decoration) {
                    const isMoving = oldX !== gridX || oldY !== gridY;
                    const beforeState = isMoving ? this.history.getTileState(oldX, oldY) : null;
                    this.gridData[oldY][oldX].decoration.destroy();
                    this.gridData[oldY][oldX].decoration = null;
                    if (isMoving) this.history.recordChange(oldX, oldY, beforeState);
                }
            }

            // Place green tile underneath
            this.gridData[gridY][gridX].type = 'green';
            this.gridData[gridY][gridX].holeId = this.currentHole.number;
            this.refreshTile(gridX, gridY);

            this.currentHole.cup = { x: gridX, y: gridY };

            this.updateChecklist();
            this.selectedTileType = 'green';
            this.updateButtonStyles();
            this.showNotification("Cup Placed. Paint the green, then press 'H' to finish.", NOTIFY_COLORS.info);
        }

        // Place decoration sprite (replaces existing)
        if (this.gridData[gridY][gridX].decoration) {
            this.gridData[gridY][gridX].decoration.destroy();
        }

        const isoPos = this.gridToIso(gridX, gridY, this.gridData[gridY][gridX].height);
        const deco = this.add.sprite(isoPos.x, isoPos.y, decoType);
        deco.setOrigin(0.5, 1);
        this.worldContainer.add(deco);
        this.gridData[gridY][gridX].decoration = deco;
    }

    paintTerrain(gridX, gridY) {
        const tileType = this.selectedTileType;
        const currentTile = this.gridData[gridY][gridX];

        // Prevent overwriting tee with other terrain
        if (currentTile.type === 'tee' && tileType !== 'tee') return;

        // Prevent overwriting tile with cup on it
        if (currentTile.decoration && currentTile.decoration.texture.key === 'cup') return;

        // Tee placement
        if (tileType === 'tee') {
            if (this.editorState !== EDITOR_STATES.PLACING_TEE && this.editorState !== EDITOR_STATES.CONSTRUCTING) return;

            // If moving tee, clear old one
            if (this.currentHole && this.currentHole.tee) {
                const oldTee = this.currentHole.tee;
                if (oldTee.x !== gridX || oldTee.y !== gridY) {
                    const oldTeeBefore = this.history.getTileState(oldTee.x, oldTee.y);
                    if (this.gridData[oldTee.y][oldTee.x].type === 'tee') {
                        this.gridData[oldTee.y][oldTee.x].type = 'grass';
                        this.refreshTile(oldTee.x, oldTee.y);
                        this.history.recordChange(oldTee.x, oldTee.y, oldTeeBefore);
                    }
                }
            }

            this.currentHole.tee = { x: gridX, y: gridY };
            this.editorState = EDITOR_STATES.CONSTRUCTING;

            if (this.selectedTileType === 'tee') {
                this.selectedTileType = 'cup';
                this.updateButtonStyles();
                this.showNotification("Tee Placed. Now place the Cup.", NOTIFY_COLORS.info);
            }
        }

        // Green can only be placed during construction
        if (tileType === 'green') {
            if (this.editorState !== EDITOR_STATES.CONSTRUCTING) return;
        }

        // Apply tile type
        this.gridData[gridY][gridX].type = tileType;

        // Assign hole ID to green tiles during construction
        if (tileType === 'green' && this.editorState === EDITOR_STATES.CONSTRUCTING) {
            this.gridData[gridY][gridX].holeId = this.currentHole.number;
        } else if (tileType !== 'green') {
            this.gridData[gridY][gridX].holeId = null;
        }
    }

    // ── Tile Rendering ─────────────────────────────────────────────

    refreshTile(x, y) {
        const tile = this.tileSprites[y][x];
        if (tile) {
            tile.setTexture(this.gridData[y][x].type);
            const isoPos = this.gridToIso(x, y, this.gridData[y][x].height);
            tile.x = isoPos.x;
            tile.y = isoPos.y;
            tile.depth = isoPos.y + tile.height;

            if (this.gridData[y][x].decoration) {
                this.gridData[y][x].decoration.x = isoPos.x;
                this.gridData[y][x].decoration.y = isoPos.y;
                this.gridData[y][x].decoration.depth = isoPos.y + tile.height + 1;
            }
        }
    }

    refreshAllTiles() {
        this.forEachTile((x, y) => this.refreshTile(x, y));
        this.golfSystem.refreshPositions();
    }

    // ── Preview ────────────────────────────────────────────────────

    createPreviewActor() {
        this.previewActor = this.add.sprite(0, 0, 'grass');
        this.previewActor.setAlpha(0.5);
        this.previewActor.setVisible(false);
        this.previewActor.setDepth(DEPTH.PREVIEW);
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

    // ── Camera & Coordinate Transforms ─────────────────────────────

    handleCameraMovement(delta) {
        const speed = 500 * (1 / this.cameras.main.zoom);

        let moveX = 0;
        let moveY = 0;

        if (this.cursors.up.isDown || this.wasd.up.isDown) moveY -= 1;
        if (this.cursors.down.isDown || this.wasd.down.isDown) moveY += 1;
        if (this.cursors.left.isDown || this.wasd.left.isDown) moveX -= 1;
        if (this.cursors.right.isDown || this.wasd.right.isDown) moveX += 1;

        if (moveX !== 0 || moveY !== 0) {
            const length = Math.sqrt(moveX * moveX + moveY * moveY);
            this.cameras.main.scrollX += (moveX / length) * speed * (delta / 1000);
            this.cameras.main.scrollY += (moveY / length) * speed * (delta / 1000);
        }
    }

    gridToIso(x, y, height = 0) {
        const centerX = (GRID_SIZE.width * TILE_SIZE.width) / 2;
        const r = rotateCoord(x, y, this.viewRotation, GRID_SIZE.width - 1, GRID_SIZE.height - 1);
        return isoToScreen(r.x, r.y, TILE_SIZE.width, TILE_SIZE.height, centerX, 0, height);
    }

    rotateWorld(dir) {
        if (this.popup) {
            this.popup.destroy();
            this.popup = null;
        }

        this.viewRotation = (this.viewRotation + dir + 4) % 4;
        this.refreshAllTiles();

        const worldWidth = GRID_SIZE.width * TILE_SIZE.width;
        const worldHeight = GRID_SIZE.height * TILE_SIZE.height;
        this.cameras.main.centerOn(worldWidth / 2, worldHeight / 4);
    }

    worldToGrid(worldX, worldY, clamp = true) {
        const centerX = (GRID_SIZE.width * TILE_SIZE.width) / 2;
        const raw = screenToIso(worldX, worldY, TILE_SIZE.width, TILE_SIZE.height, centerX, 0);
        const maxW = GRID_SIZE.width - 1;
        const maxH = GRID_SIZE.height - 1;
        const r = inverseRotateCoord(raw.x, raw.y, this.viewRotation, maxW, maxH);

        if (clamp) {
            return {
                x: Phaser.Math.Clamp(r.x, 0, maxW),
                y: Phaser.Math.Clamp(r.y, 0, maxH)
            };
        }

        return { x: Math.round(r.x), y: Math.round(r.y) };
    }

    // ── Input ──────────────────────────────────────────────────────

    setupInput() {
        this.setupKeyboardInput();
        this.setupPointerInput();
        this.setupEditorInput();
    }

    setupKeyboardInput() {
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            right: Phaser.Input.Keyboard.KeyCodes.D,
            rotLeft: Phaser.Input.Keyboard.KeyCodes.Q,
            rotRight: Phaser.Input.Keyboard.KeyCodes.E
        });

        this.input.keyboard.on('keydown-Z', (event) => {
            if (event.ctrlKey) {
                if (event.shiftKey) this.history.redo();
                else this.history.undo();
            }
        });

        this.input.keyboard.on('keydown-Y', (event) => {
            if (event.ctrlKey) this.history.redo();
        });

        this.input.keyboard.on('keydown-ESC', () => {
            if (this.editorState === EDITOR_STATES.PLAYING) {
                this.exitPlayMode();
                return;
            }
            this.scene.pause();
            this.scene.launch('PauseScene');
        });

        this.input.keyboard.on('keydown-H', () => this.finalizeHole());
        this.input.keyboard.on('keydown-Q', () => this.rotateWorld(-1));
        this.input.keyboard.on('keydown-E', () => this.rotateWorld(1));
    }

    setupPointerInput() {
        let isDragging = false;
        let startX = 0;
        let startY = 0;

        this.input.on('pointerdown', (pointer) => {
            if (this.editorState === EDITOR_STATES.PLAYING && pointer.button === 0) {
                this.golfSystem.swingAndHit(pointer);
                return;
            }
            if (this.showEditor && pointer.button === 0) {
                this.history.startBatch();
            }
            if (pointer.button === 1) {
                isDragging = true;
                startX = pointer.x;
                startY = pointer.y;
            }
        });

        this.input.on('pointerup', (pointer) => {
            if (this.showEditor && pointer.button === 0) {
                this.history.endBatch();
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

        this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
            const zoomAmount = 0.1;
            const minZoom = 0.5;
            const maxZoom = 2.0;

            if (deltaY > 0) {
                this.cameras.main.zoom = Math.max(minZoom, this.cameras.main.zoom - zoomAmount);
            } else {
                this.cameras.main.zoom = Math.min(maxZoom, this.cameras.main.zoom + zoomAmount);
            }
        });
    }

    setupEditorInput() {
        this.input.on('gameobjectdown', (pointer, gameObject) => {
            if (this.editorState === EDITOR_STATES.PLAYING) return;
            if (!this.showEditor) return;

            if (pointer.button === 0) {
                this.history.startBatch();

                // Click existing tee in IDLE mode to edit
                if (this.editorState === EDITOR_STATES.IDLE) {
                    const gridX = gameObject.getData('gridX');
                    const gridY = gameObject.getData('gridY');

                    if (gridX !== undefined && gridY !== undefined) {
                        const tileData = this.gridData[gridY][gridX];
                        if (tileData.type === 'tee') {
                            const hole = this.course.holes.find(h => h.tee?.x === gridX && h.tee?.y === gridY);
                            if (hole) {
                                this.createPopup(pointer.worldX, pointer.worldY, hole, () => this.editHole(hole));
                                return;
                            }
                        }
                    }
                }

                if (this.popup) {
                    this.popup.destroy();
                    this.popup = null;
                }

                this.paintTile(gameObject);
            }
        });

        this.input.on('gameobjectover', (pointer, gameObject) => {
            if (this.editorState === EDITOR_STATES.PLAYING) return;
            if (!this.showEditor) return;

            this.updatePreview(gameObject);
            if (pointer.buttons === 1) {
                this.paintTile(gameObject);
            }
        });

        this.input.on('gameobjectout', (pointer, gameObject) => {
            if (this.editorState === EDITOR_STATES.PLAYING) return;
            if (this.previewActor) this.previewActor.setVisible(false);
        });
    }
}
