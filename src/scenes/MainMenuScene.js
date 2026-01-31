import Phaser from 'phaser';
import Button from '../ui/Button.js';
import { isoToScreen } from '../utils/IsoUtils.js';
import { TILE_SIZE, TILE_TYPES, SAVE_SLOTS, TEXT_STYLES, NOTIFY_COLORS } from '../consts/GameConfig.js';
import { saveToSlot, loadSlotData, findEmptySlot, findMostRecentSave, importFromFile } from '../utils/SaveManager.js';

const CLUB_ADJECTIVES = ["Royal", "Hidden", "Sunny", "Green", "Golden", "Old", "Grand", "Rolling", "Whispering", "Iron", "Rusty", "Sandy", "Blue", "Emerald", "Misty", "Shady", "Twin"];
const CLUB_NOUNS = ["Links", "Valley", "Hills", "Meadows", "Woods", "Dunes", "Pines", "Creek", "Springs", "Gardens", "Fairways", "Heights", "Course", "Club", "Resort", "Ridge", "Point"];

export default class MainMenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainMenuScene' });
    }

    generateRandomClubName() {
        const adj = CLUB_ADJECTIVES[Math.floor(Math.random() * CLUB_ADJECTIVES.length)];
        const noun = CLUB_NOUNS[Math.floor(Math.random() * CLUB_NOUNS.length)];
        return `${adj} ${noun}`;
    }

    create() {
        const { width, height } = this.cameras.main;

        this.generateMenuBackground(width, height);

        this.add.text(50, 50, 'Land & Links', {
            ...TEXT_STYLES.title,
            fontSize: '64px',
            fill: '#f5efef'
        }).setOrigin(0, 0.5);

        const menuWidth = 350;
        const sidePadding = 32;
        const buttonWidth = menuWidth - (sidePadding * 2);

        this.add.rectangle(width - menuWidth / 2, height / 2, menuWidth, height, 0x000000, 0.7);

        this.menuContainer = this.add.container(width - menuWidth / 2, height / 2);

        let yPos = -height / 2 + 60;

        new Button(this, width - menuWidth / 2, height / 2 + yPos, 'NEW GAME', () => {
            this.handleNewGame();
        }, { width: buttonWidth, backgroundColor: '#3498db', fontSize: '18px' });

        yPos += 80;

        this.add.text(width - menuWidth / 2, height / 2 + yPos, 'CONTINUE:', {
            ...TEXT_STYLES.labelSmall
        }).setOrigin(0.5);
        yPos += 70;

        SAVE_SLOTS.forEach(slot => {
            const data = loadSlotData(slot);
            if (data && !data.clubName) {
                data.clubName = this.generateRandomClubName();
                saveToSlot(slot, data);
            }

            this.createCompactSaveCard(0, yPos, buttonWidth, 80, slot.toString());
            yPos += 95;
        });

        new Button(this, width - menuWidth / 2, height - 60, 'IMPORT SAVE', () => {
            this.handleImport();
        }, { width: buttonWidth, backgroundColor: '#9b59b6', fontSize: '18px' });
    }

    handleNewGame() {
        this.promptClubName();
    }

    promptClubName() {
        const { width, height } = this.cameras.main;

        const popup = this.add.container(0, 0).setDepth(200);

        const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8)
            .setInteractive();
        popup.add(overlay);

        const panel = this.add.rectangle(width / 2, height / 2, 400, 300, 0x2c3e50)
            .setStrokeStyle(2, 0xffffff);
        popup.add(panel);

        const title = this.add.text(width / 2, height / 2 - 100, 'NAME YOUR CLUB', {
            ...TEXT_STYLES.heading
        }).setOrigin(0.5);
        popup.add(title);

        let currentName = this.generateRandomClubName();
        const nameText = this.add.text(width / 2, height / 2 - 20, currentName, {
            ...TEXT_STYLES.heading,
            fontSize: '32px',
            fill: '#f1c40f'
        }).setOrigin(0.5);
        popup.add(nameText);

        const diceBtn = this.add.text(width / 2, height / 2 + 40, '🎲 REROLL', {
            ...TEXT_STYLES.buttonSmall,
            backgroundColor: '#3498db',
            padding: { x: 10, y: 5 }
        })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });

        diceBtn.on('pointerup', () => {
            currentName = this.generateRandomClubName();
            nameText.setText(currentName);
        });
        popup.add(diceBtn);

        const confirmBtn = this.add.text(width / 2, height / 2 + 100, 'START GAME', {
            ...TEXT_STYLES.buttonSmall,
            fontSize: '20px',
            backgroundColor: '#27ae60',
            padding: { x: 20, y: 10 }
        })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });

        confirmBtn.on('pointerup', () => {
            this.startNewGame(currentName);
            popup.destroy();
        });
        popup.add(confirmBtn);

        const closeBtn = this.add.text(width / 2 + 180, height / 2 - 130, 'X', {
            ...TEXT_STYLES.buttonSmall,
            fontSize: '20px',
            fill: '#e74c3c'
        })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });

        closeBtn.on('pointerup', () => {
            popup.destroy();
        });
        popup.add(closeBtn);
    }

    startNewGame(clubName) {
        const emptySlot = findEmptySlot();

        if (emptySlot) {
            this.scene.start('LevelEditorScene', {
                startInEditor: true,
                slotId: emptySlot.toString(),
                clubName: clubName
            });
        } else {
            this.createOverwriteMenu({ clubName: clubName }, true);
        }
    }

    handleImport() {
        importFromFile().then(json => {
            if (json) this.processImport(json);
        }).catch(() => {
            const { width, height } = this.cameras.main;
            const msg = this.add.text(width / 2, height - 40, 'Failed to import file!', {
                ...TEXT_STYLES.notification, fill: NOTIFY_COLORS.error
            }).setOrigin(0.5);
            this.tweens.add({ targets: msg, alpha: 0, duration: 1000, delay: 2000, onComplete: () => msg.destroy() });
        });
    }

    processImport(data) {
        const emptySlot = findEmptySlot();

        if (emptySlot) {
            saveToSlot(emptySlot, data);
            this.scene.start('LevelEditorScene', {
                startInEditor: false,
                initialData: data,
                slotId: emptySlot.toString()
            });
        } else {
            this.createOverwriteMenu(data, false);
        }
    }

    generateMenuBackground(w, h) {
        const gfx = this.add.graphics();

        gfx.fillStyle(0x3498db);
        gfx.fillRect(0, 0, w, h);

        const data = findMostRecentSave();

        if (data && data.gridData) {
            const centerX = w / 2;
            const startY = h / 4;

            for (let y = 0; y < data.gridData.length; y++) {
                for (let x = 0; x < data.gridData[y].length; x++) {
                    const tile = data.gridData[y][x];

                    if (!tile || tile.type === 'water') continue;

                    const isoPos = isoToScreen(x, y, TILE_SIZE.width, TILE_SIZE.height, centerX, startY, tile.height);

                    if (isoPos.x < -100 || isoPos.x > w + 100 || isoPos.y < -100 || isoPos.y > h + 100) continue;

                    const color = TILE_TYPES[tile.type] || 0xffffff;

                    gfx.fillStyle(color);
                    gfx.beginPath();
                    gfx.moveTo(isoPos.x, isoPos.y - TILE_SIZE.height / 2);
                    gfx.lineTo(isoPos.x + TILE_SIZE.width / 2, isoPos.y);
                    gfx.lineTo(isoPos.x, isoPos.y + TILE_SIZE.height / 2);
                    gfx.lineTo(isoPos.x - TILE_SIZE.width / 2, isoPos.y);
                    gfx.closePath();
                    gfx.fillPath();

                    if (tile.height > 0) {
                        gfx.fillStyle(0x000000, 0.2);
                        gfx.beginPath();
                        gfx.moveTo(isoPos.x - TILE_SIZE.width / 2, isoPos.y);
                        gfx.lineTo(isoPos.x, isoPos.y + TILE_SIZE.height / 2);
                        gfx.lineTo(isoPos.x, isoPos.y + TILE_SIZE.height / 2 + tile.height);
                    }

                    if (tile.decoration) {
                        if (tile.decoration.includes('tree')) {
                            gfx.fillStyle(0x2d5a27);
                            gfx.fillTriangle(
                                isoPos.x, isoPos.y - 40,
                                isoPos.x - 10, isoPos.y,
                                isoPos.x + 10, isoPos.y
                            );
                        } else if (tile.decoration.includes('cup')) {
                            gfx.fillStyle(0xff0000);
                            gfx.fillRect(isoPos.x - 1, isoPos.y - 20, 2, 20);
                        }
                    }
                }
            }
        } else {
            const halfW = TILE_SIZE.width / 2;
            const halfH = TILE_SIZE.height / 2;

            for (let y = 0; y < 20; y++) {
                for (let x = 0; x < 20; x++) {
                    const pos = isoToScreen(x, y, TILE_SIZE.width, TILE_SIZE.height, w / 2, h / 4);
                    const isSand = Math.random() > 0.8;
                    const isTree = Math.random() > 0.9;
                    const color = isSand ? 0xf1c40f : 0x5ba337;

                    gfx.fillStyle(color);
                    gfx.beginPath();
                    gfx.moveTo(pos.x, pos.y);
                    gfx.lineTo(pos.x + halfW, pos.y + halfH);
                    gfx.lineTo(pos.x, pos.y + TILE_SIZE.height);
                    gfx.lineTo(pos.x - halfW, pos.y + halfH);
                    gfx.closePath();
                    gfx.fillPath();
                    gfx.lineStyle(1, 0x000000, 0.1);
                    gfx.strokePath();

                    if (isTree && !isSand) {
                        gfx.fillStyle(0x3d7030);
                        gfx.fillRect(pos.x - 5, pos.y - 20, 10, 30);
                    }
                }
            }
        }
    }

    createOverwriteMenu(importData, isNewGame = false) {
        const { width, height } = this.cameras.main;

        const popup = this.add.container(0, 0).setDepth(100);

        const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8)
            .setInteractive();
        popup.add(overlay);

        const panel = this.add.rectangle(width / 2, height / 2, 400, 350, 0x2c3e50)
            .setStrokeStyle(2, 0xffffff);
        popup.add(panel);

        const title = this.add.text(width / 2, height / 2 - 140, 'SLOTS FULL', {
            ...TEXT_STYLES.heading,
            fill: '#e74c3c'
        }).setOrigin(0.5);
        const subtitle = this.add.text(width / 2, height / 2 - 100, 'Select a slot to overwrite:', {
            ...TEXT_STYLES.labelSmall,
            fill: '#fff'
        }).setOrigin(0.5);
        popup.add([title, subtitle]);

        SAVE_SLOTS.forEach((slot, i) => {
            const btnY = height / 2 - 40 + (i * 60);

            const btn = new Button(this, width / 2, btnY, `Slot ${slot}`, () => {
                saveToSlot(slot, importData);
                this.scene.start('LevelEditorScene', {
                    startInEditor: isNewGame,
                    initialData: importData,
                    slotId: slot.toString()
                });
            }, { width: 300, backgroundColor: '#c0392b', fontSize: '18px', alpha: 0.9 });

            popup.add(btn);
        });

        const cancelBtn = this.add.text(width / 2, height / 2 + 140, 'CANCEL', {
            ...TEXT_STYLES.labelSmall,
            fill: '#fff',
            backgroundColor: '#7f8c8d',
            padding: { x: 10, y: 5 }
        })
            .setInteractive({ useHandCursor: true })
            .setOrigin(0.5);

        cancelBtn.on('pointerdown', () => {
            this.scene.restart();
        });
        popup.add(cancelBtn);
    }

    createCompactSaveCard(x, y, w, h, slotId) {
        const data = loadSlotData(slotId);

        const container = this.add.container(x, y);
        this.menuContainer.add(container);

        const bg = this.add.graphics();
        bg.fillStyle(0xf7dc6f, 0.8);
        bg.fillRect(-w / 2, -h / 2, w, h);
        container.add(bg);

        const titleText = data ? data.clubName : `SLOT ${slotId}`;
        const title = this.add.text(-w / 2 + 20, 0, titleText, {
            ...TEXT_STYLES.label,
            fontSize: '20px',
            fill: '#2c3e50',
            fontStyle: 'bold'
        }).setOrigin(0, 0.5);
        container.add(title);

        if (data) {
            const holes = data.course?.holes?.length || 0;
            const info = this.add.text(w / 2 - 20, 0, `${holes} Holes`, {
                ...TEXT_STYLES.labelSmall,
                fill: '#2c3e50',
                align: 'right'
            }).setOrigin(1, 0.5);
            container.add(info);

            container.setSize(w, h);
            container.setInteractive({ useHandCursor: true });
            container.on('pointerdown', () => {
                this.scene.start('LevelEditorScene', {
                    startInEditor: false,
                    initialData: data,
                    slotId: slotId
                });
            });
        } else {
            const empty = this.add.text(w / 2 - 20, 0, 'EMPTY', {
                ...TEXT_STYLES.body,
                fill: '#7f8c8d',
                align: 'right'
            }).setOrigin(1, 0.5);
            container.add(empty);
        }

        if (container.input) {
            container.on('pointerover', () => {
                bg.clear();
                bg.fillStyle(0xf39c12, 0.8);
                bg.fillRect(-w / 2, -h / 2, w, h);
            });
            container.on('pointerout', () => {
                bg.clear();
                bg.fillStyle(0xf7dc6f, 0.8);
                bg.fillRect(-w / 2, -h / 2, w, h);
            });
        }
    }
}
