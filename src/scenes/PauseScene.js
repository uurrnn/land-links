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
        this.add.text(width / 2, height / 2 - 100, 'PAUSED', TEXT_STYLES.title).setOrigin(0.5);

        // Resume Button
        new Button(this, width / 2, height / 2 + 20, 'Resume', () => {
            this.scene.resume('LevelEditorScene');
            this.scene.stop();
        });

        // Main Menu Button
        new Button(this, width / 2, height / 2 + 90, 'Main Menu', () => {
            this.scene.stop('LevelEditorScene');
            this.scene.start('MainMenuScene');
        });
    }
}
