import Phaser from 'phaser';
import Button from '../ui/Button.js';
import { UI_COLORS, TEXT_STYLES } from '../consts/GameConfig.js';

export default class PauseScene extends Phaser.Scene {
    constructor() {
        super({ key: 'PauseScene' });
    }

    create() {
        // Semi-transparent background
        const { width, height } = this.cameras.main;
        this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);

        // Title
        this.add.text(width / 2, 80, 'PAUSED', {
            fontFamily: '"Outfit", sans-serif',
            fontSize: '64px', 
            fill: '#fff', 
            fontStyle: 'bold', 
            stroke: '#000', 
            strokeThickness: 6 
        }).setOrigin(0.5);

        // Resume Button
        new Button(this, width / 2, height / 2 - 50, 'Resume', () => {
            this.scene.resume('LevelEditorScene');
            this.scene.stop();
        });

        // Save Button (Saves to current slot)
        new Button(this, width / 2, height / 2 + 20, 'Save Game', () => {
            const editor = this.scene.get('LevelEditorScene');
            editor.quickSave(); // Uses currentSlot by default
        });

        // Export Button (Downloads JSON)
        new Button(this, width / 2, height / 2 + 90, 'Export Save', () => {
            const editor = this.scene.get('LevelEditorScene');
            editor.saveCourse(); // Triggers JSON download
        });

        // Main Menu Button
        new Button(this, width / 2, height / 2 + 160, 'Main Menu', () => {
            this.scene.stop('LevelEditorScene');
            this.scene.start('MainMenuScene');
        });

        // ESC to Resume
        this.input.keyboard.on('keydown-ESC', () => {
            this.scene.resume('LevelEditorScene');
            this.scene.stop();
        });
    }
}
