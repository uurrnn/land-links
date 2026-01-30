import Phaser from 'phaser';
import Button from '../ui/Button.js';
import { isoToScreen } from '../utils/IsoUtils.js';
import { GRID_SIZE, TILE_SIZE, TILE_TYPES } from '../consts/GameConfig.js';

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

        // 1. Inspiration Background
        this.generateMenuBackground(width, height);

        // 2. Title (Top-Left)
        this.add.text(50, 50, 'Land & Links', { 
            fontFamily: '"Outfit", sans-serif',
            fontSize: '64px', 
            fill: '#f5efef', 
            fontStyle: 'bold',
        }).setOrigin(0, 0.5);

        // 3. Right Sidebar Menu
        const menuWidth = 350; 
        const sidePadding = 32;
        const buttonWidth = menuWidth - (sidePadding * 2);

        this.add.rectangle(width - menuWidth/2, height/2, menuWidth, height, 0x000000, 0.7); // Darker BG
        
        // Menu Container
        this.menuContainer = this.add.container(width - menuWidth/2, height/2);
        
        let yPos = -height/2 + 60;

        // --- NEW GAME BUTTON ---
        new Button(this, width - menuWidth/2, height/2 + yPos, 'NEW GAME', () => {
            this.handleNewGame();
        }, { width: buttonWidth, backgroundColor: '#3498db', fontSize: '18px' });
        
        yPos += 80;

        // --- SAVE SLOTS LIST ---
        this.add.text(width - menuWidth/2, height/2 + yPos, 'CONTINUE:', { 
            fontFamily: '"Outfit", sans-serif',
            fontSize: '16px', 
            fill: '#888' 
        }).setOrigin(0.5);
        yPos += 70;

        [1, 2, 3].forEach(slot => {
            // Retroactive Naming Check
            const key = `iso_golf_save_${slot}`;
            const raw = localStorage.getItem(key);
            if (raw) {
                try {
                    const data = JSON.parse(raw);
                    if (!data.clubName) {
                        data.clubName = this.generateRandomClubName();
                        localStorage.setItem(key, JSON.stringify(data));
                    }
                } catch(e) {}
            }

            // Pass relative coordinates (0, yPos) because we add to menuContainer
            this.createCompactSaveCard(0, yPos, buttonWidth, 80, slot.toString());
            yPos += 95;
        });

        // --- IMPORT BUTTON (Bottom) ---
        new Button(this, width - menuWidth/2, height - 60, 'IMPORT SAVE', () => {
            this.handleImport();
        }, { width: buttonWidth, backgroundColor: '#9b59b6', fontSize: '18px' });
    }

    handleNewGame() {
        this.promptClubName();
    }

    promptClubName() {
        const { width, height } = this.cameras.main;
        
        // Container
        const popup = this.add.container(0, 0).setDepth(200);
        
        // Overlay
        const overlay = this.add.rectangle(width/2, height/2, width, height, 0x000000, 0.8)
            .setInteractive();
        popup.add(overlay);

        // Panel
        const panel = this.add.rectangle(width/2, height/2, 400, 300, 0x2c3e50)
            .setStrokeStyle(2, 0xffffff);
        popup.add(panel);

        // Title
        const title = this.add.text(width/2, height/2 - 100, 'NAME YOUR CLUB', {
            fontFamily: '"Outfit", sans-serif',
            fontSize: '24px', fill: '#fff', fontStyle: 'bold'
        }).setOrigin(0.5);
        popup.add(title);

        // Name Display
        let currentName = this.generateRandomClubName();
        const nameText = this.add.text(width/2, height/2 - 20, currentName, {
            fontFamily: '"Outfit", sans-serif',
            fontSize: '32px', fill: '#f1c40f', fontStyle: 'bold'
        }).setOrigin(0.5);
        popup.add(nameText);

        // Dice Button (Reroll)
        const diceBtn = this.add.text(width/2, height/2 + 40, '🎲 REROLL', {
            fontFamily: '"Outfit", sans-serif',
            fontSize: '16px', fill: '#fff', backgroundColor: '#3498db', padding: { x: 10, y: 5 }
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
        
        diceBtn.on('pointerup', () => {
            currentName = this.generateRandomClubName();
            nameText.setText(currentName);
        });
        popup.add(diceBtn);

        // Confirm Button
        const confirmBtn = this.add.text(width/2, height/2 + 100, 'START GAME', {
            fontFamily: '"Outfit", sans-serif',
            fontSize: '20px', fill: '#fff', backgroundColor: '#27ae60', padding: { x: 20, y: 10 }, fontStyle: 'bold'
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
        
        confirmBtn.on('pointerup', () => {
            this.startNewGame(currentName);
            popup.destroy();
        });
        popup.add(confirmBtn);
        
        // Cancel Button (Close)
         const closeBtn = this.add.text(width/2 + 180, height/2 - 130, 'X', {
            fontFamily: '"Outfit", sans-serif',
            fontSize: '20px', fill: '#e74c3c', fontStyle: 'bold'
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
        
        closeBtn.on('pointerup', () => {
            popup.destroy();
        });
        popup.add(closeBtn);
    }

    startNewGame(clubName) {
        // Find first empty slot
        const emptySlot = [1, 2, 3].find(i => !localStorage.getItem(`iso_golf_save_${i}`));
        
        if (emptySlot) {
            // Start immediately in empty slot
            this.scene.start('LevelEditorScene', { 
                startInEditor: true,
                slotId: emptySlot.toString(),
                clubName: clubName
            });
        } else {
            // Prompt to overwrite
            this.createOverwriteMenu({ clubName: clubName }, true); 
        }
    }

    handleImport() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const json = JSON.parse(event.target.result);
                    if (json) {
                        this.processImport(json);
                    }
                } catch (err) {
                    console.error('Error parsing import file', err);
                }
            };
            reader.readAsText(file);
        };
        
        input.click();
    }

    processImport(data) {
        const emptySlot = [1, 2, 3].find(i => !localStorage.getItem(`iso_golf_save_${i}`));
        
        if (emptySlot) {
            localStorage.setItem(`iso_golf_save_${emptySlot}`, JSON.stringify(data));
            this.scene.start('LevelEditorScene', { 
                startInEditor: false,
                initialData: data,
                slotId: emptySlot.toString()
            });
        } else {
            this.createOverwriteMenu(data, false);
        }
    }

    findMostRecentSave() {
        let recent = null;
        let maxTime = 0;

        [1, 2, 3].forEach(slot => {
            const raw = localStorage.getItem(`iso_golf_save_${slot}`);
            if (raw) {
                try {
                    const data = JSON.parse(raw);
                    if (data.timestamp > maxTime) {
                        maxTime = data.timestamp;
                        recent = data;
                    }
                } catch(e) {}
            }
        });
        return recent;
    }

    generateMenuBackground(w, h) {
        const gfx = this.add.graphics();
        
        // Draw Water Base (Sky/Background)
        gfx.fillStyle(0x3498db);
        gfx.fillRect(0, 0, w, h);

        const data = this.findMostRecentSave();

        if (data && data.gridData) {
            // Render Saved Course
            const centerX = w / 2; // Screen center
            // Offset logic: The map is 72x72. 
            // 0,0 is top tip. 72,72 is bottom tip.
            // We want to center roughly on the middle of the grid (36, 36).
            // But isoToScreen expects a 'centerX' offset for the world origin.
            
            // Let's iterate and draw
            // We can animate rotation? Maybe later. For now static.
            
            // Adjust start Y to show more of the map
            const startY = h / 4; 

            for (let y = 0; y < data.gridData.length; y++) {
                for (let x = 0; x < data.gridData[y].length; x++) {
                    const tile = data.gridData[y][x];
                    
                    // Simple Culling
                    if (!tile || tile.type === 'water') continue; // Don't draw basic water to save perfs, we have blue BG

                    const isoPos = isoToScreen(x, y, TILE_SIZE.width, TILE_SIZE.height, centerX, startY, tile.height);
                    
                    // Cull if offscreen
                    if (isoPos.x < -100 || isoPos.x > w + 100 || isoPos.y < -100 || isoPos.y > h + 100) continue;

                    // Draw Tile
                    const color = TILE_TYPES[tile.type] || 0xffffff;
                    
                    // Top Face
                    gfx.fillStyle(color);
                    gfx.beginPath();
                    gfx.moveTo(isoPos.x, isoPos.y - TILE_SIZE.height/2); // Top
                    gfx.lineTo(isoPos.x + TILE_SIZE.width/2, isoPos.y); // Right
                    gfx.lineTo(isoPos.x, isoPos.y + TILE_SIZE.height/2); // Bottom
                    gfx.lineTo(isoPos.x - TILE_SIZE.width/2, isoPos.y); // Left
                    gfx.closePath();
                    gfx.fillPath();

                    // Optional: Side shading for height
                    if (tile.height > 0) {
                        gfx.fillStyle(0x000000, 0.2);
                        gfx.beginPath();
                        gfx.moveTo(isoPos.x - TILE_SIZE.width/2, isoPos.y);
                        gfx.lineTo(isoPos.x, isoPos.y + TILE_SIZE.height/2);
                        gfx.lineTo(isoPos.x, isoPos.y + TILE_SIZE.height/2 + tile.height); // Height extrusion approximation (visual only)
                        // Actually, 'isoPos' already includes height offset (-height).
                        // Drawing proper sides requires knowing the base y.
                        // Simplified: just draw the top face for the BG.
                    }
                    
                    if (tile.decoration) {
                        // Simple shapes for decorations
                        if (tile.decoration.includes('tree')) {
                            gfx.fillStyle(0x2d5a27); // Dark Green
                            gfx.fillTriangle(
                                isoPos.x, isoPos.y - 40,
                                isoPos.x - 10, isoPos.y,
                                isoPos.x + 10, isoPos.y
                            );
                        } else if (tile.decoration.includes('cup')) {
                            gfx.fillStyle(0xff0000); // Flag
                            gfx.fillRect(isoPos.x - 1, isoPos.y - 20, 2, 20);
                        }
                    }
                }
            }
            
            // Add a subtle rotation or pan?
            // For now, static is fine as requested.

        } else {
            // Fallback: Procedural
            const iso = (x, y) => {
                return {
                    x: (x - y) * 32 + w/2,
                    y: (x + y) * 16 + h/4
                };
            };

            for (let y = 0; y < 20; y++) {
                for (let x = 0; x < 20; x++) {
                    const pos = iso(x, y);
                    const isSand = Math.random() > 0.8;
                    const isTree = Math.random() > 0.9;
                    const color = isSand ? 0xf1c40f : 0x5ba337;
                    
                    gfx.fillStyle(color);
                    gfx.beginPath();
                    gfx.moveTo(pos.x, pos.y);
                    gfx.lineTo(pos.x + 32, pos.y + 16);
                    gfx.lineTo(pos.x, pos.y + 32);
                    gfx.lineTo(pos.x - 32, pos.y + 16);
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
        
        // Container for popup
        const popup = this.add.container(0, 0).setDepth(100);
        
        // Dark Overlay
        const overlay = this.add.rectangle(width/2, height/2, width, height, 0x000000, 0.8)
            .setInteractive(); // Block clicks
        popup.add(overlay);

        // Panel
        const panel = this.add.rectangle(width/2, height/2, 400, 350, 0x2c3e50)
            .setStrokeStyle(2, 0xffffff);
        popup.add(panel);

                // Text
                const title = this.add.text(width/2, height/2 - 140, 'SLOTS FULL', { 
                    fontFamily: '"Outfit", sans-serif',
                    fontSize: '24px', 
                    fill: '#e74c3c', 
                    fontStyle: 'bold' 
                }).setOrigin(0.5);
                const subtitle = this.add.text(width/2, height/2 - 100, 'Select a slot to overwrite:', { 
                    fontFamily: '"Outfit", sans-serif',
                    fontSize: '16px', 
                    fill: '#fff' 
                }).setOrigin(0.5);
                popup.add([title, subtitle]);
        
                // Slot Buttons
                [1, 2, 3].forEach((slot, i) => {
                    const btnY = height/2 - 40 + (i * 60);
                    
                    // We can't use the Button class easily inside a container if it adds itself to scene
                    // But Button adds itself to scene.add.existing(this).
                    // We can just create them and set depth.
                    
                    const btn = new Button(this, width/2, btnY, `Slot ${slot}`, () => {
                        localStorage.setItem(`iso_golf_save_${slot}`, JSON.stringify(importData));
                        this.scene.start('LevelEditorScene', { 
                            startInEditor: isNewGame,
                            initialData: importData,
                            slotId: slot.toString()
                        });
                    }, { width: 300, backgroundColor: '#c0392b', fontSize: '18px', alpha: 0.9 });
                    
                    popup.add(btn);
                });
        
                // Cancel Button
                const cancelBtn = this.add.text(width/2, height/2 + 140, 'CANCEL', { 
                    fontFamily: '"Outfit", sans-serif',
                    fontSize: '16px', 
                    fill: '#fff', 
                    backgroundColor: '#7f8c8d', 
                    padding: { x: 10, y: 5 }
                })
                .setInteractive({ useHandCursor: true })
                .setOrigin(0.5);
                
                cancelBtn.on('pointerdown', () => {
                    // Reload scene to clear popup (easiest way since Button objects are in scene list)
                    this.scene.restart();
                });
                popup.add(cancelBtn);
            }
        
            createCompactSaveCard(x, y, w, h, slotId) {
                const rawData = localStorage.getItem(`iso_golf_save_${slotId}`);
                let data = null;
                if (rawData) {
                    try {
                        data = JSON.parse(rawData);
                    } catch (e) {
                        console.error("Malformed save data in slot", slotId);
                    }
                }
        
                // Card Container
                const container = this.add.container(x, y);
                this.menuContainer.add(container); 
                
                        // Background - Light Yellow
                        const bg = this.add.graphics();
                        bg.fillStyle(0xf7dc6f, 0.8); 
                        bg.fillRect(-w/2, -h/2, w, h); 
                        container.add(bg);
                
                                // Slot Label - Dark Text
                                const titleText = data ? data.clubName : `SLOT ${slotId}`;
                                const title = this.add.text(-w/2 + 20, 0, titleText, { 
                                    fontFamily: '"Outfit", sans-serif',
                                    fontSize: '20px', 
                                    fill: '#2c3e50',
                                    fontStyle: 'bold' 
                                }).setOrigin(0, 0.5);
                                container.add(title);
                        
                                if (data) {
                                    const holes = data.course?.holes?.length || 0;
                                    const info = this.add.text(w/2 - 20, 0, `${holes} Holes`, { 
                                        fontFamily: '"Outfit", sans-serif',
                                        fontSize: '16px', 
                                        fill: '#2c3e50',
                                        align: 'right'
                                    }).setOrigin(1, 0.5);
                                    container.add(info);
                        
                                    // Click to Load
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
                                    const empty = this.add.text(w/2 - 20, 0, 'EMPTY', { 
                                        fontFamily: '"Outfit", sans-serif',
                                        fontSize: '14px', 
                                        fill: '#7f8c8d',
                                        align: 'right'
                                    }).setOrigin(1, 0.5);
                                    container.add(empty);
                                }                
                        // Hover Effects
                        if (container.input) {
                            container.on('pointerover', () => {
                                bg.clear();
                                bg.fillStyle(0xf39c12, 0.8); // Darker Orange-Yellow Hover
                                bg.fillRect(-w/2, -h/2, w, h);
                            });
                            container.on('pointerout', () => {
                                bg.clear();
                                bg.fillStyle(0xf7dc6f, 0.8); // Reset
                                bg.fillRect(-w/2, -h/2, w, h);
                            });
                        }
            }    }