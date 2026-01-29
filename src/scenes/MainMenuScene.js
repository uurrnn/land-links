import Phaser from 'phaser';
import Button from '../ui/Button.js';
import { UI_COLORS, TEXT_STYLES } from '../consts/GameConfig.js';

export default class MainMenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainMenuScene' });
    }

    create() {
        const { width, height } = this.cameras.main;

        // Background
        this.add.rectangle(width / 2, height / 2, width, height, UI_COLORS.background);

        // Add a simple animated background effect (optional)
        // ...

        // Title
        this.add.text(width / 2, height / 2 - 150, 'Isometric Golf', TEXT_STYLES.title).setOrigin(0.5);

        // Play Button (placeholder for now, maybe goes to a level selector later)
        new Button(this, width / 2, height / 2, 'Play Game', () => {
            console.log("Play Game clicked - To be implemented");
            // For now, let's just go to the editor as the "game"
            this.scene.start('LevelEditorScene');
        });

        // Level Editor Button
        new Button(this, width / 2, height / 2 + 70, 'Level Editor', () => {
            this.scene.start('LevelEditorScene');
        });
    }
}