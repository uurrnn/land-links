import Phaser from 'phaser';
import Button from '../ui/Button.js';
import { TEXT_STYLES, NOTIFY_COLORS } from '../consts/GameConfig.js';

export default class CourseCompleteScene extends Phaser.Scene {
    constructor() {
        super({ key: 'CourseCompleteScene' });
    }

    init(data) {
        this.courseStrokes = data.courseStrokes || [];
        this.clubName = data.clubName || 'Golf Course';
        this.totalHoles = data.totalHoles || this.courseStrokes.length;
    }

    create() {
        const { width, height } = this.cameras.main;

        // Semi-transparent overlay
        this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.85);

        // Title
        this.add.text(width / 2, 100, 'COURSE COMPLETE!', {
            ...TEXT_STYLES.title,
            fontSize: '48px',
            fill: NOTIFY_COLORS.success
        }).setOrigin(0.5);

        // Club name
        this.add.text(width / 2, 160, this.clubName, {
            ...TEXT_STYLES.heading,
            fontSize: '24px',
            fill: '#fff'
        }).setOrigin(0.5);

        // Calculate total strokes
        const totalStrokes = this.courseStrokes.reduce((sum, s) => sum + s, 0);

        // Total strokes display
        this.add.text(width / 2, 230, `Total Strokes: ${totalStrokes}`, {
            ...TEXT_STYLES.heading,
            fontSize: '32px',
            fill: '#f1c40f'
        }).setOrigin(0.5);

        // Hole-by-hole breakdown
        const startY = 300;
        const maxVisibleHoles = 8;
        const holesToShow = Math.min(this.courseStrokes.length, maxVisibleHoles);

        this.add.text(width / 2, startY - 30, 'Hole Breakdown:', {
            ...TEXT_STYLES.label,
            fontSize: '18px'
        }).setOrigin(0.5);

        for (let i = 0; i < holesToShow; i++) {
            const holeNum = i + 1;
            const strokes = this.courseStrokes[i];
            const y = startY + (i * 30);

            this.add.text(width / 2, y, `Hole ${holeNum}: ${strokes} strokes`, {
                ...TEXT_STYLES.body,
                fontSize: '16px',
                fill: '#ccc'
            }).setOrigin(0.5);
        }

        // If more than maxVisibleHoles, show indicator
        if (this.courseStrokes.length > maxVisibleHoles) {
            const remaining = this.courseStrokes.length - maxVisibleHoles;
            this.add.text(width / 2, startY + (maxVisibleHoles * 30), `...and ${remaining} more`, {
                ...TEXT_STYLES.body,
                fontSize: '14px',
                fill: '#888'
            }).setOrigin(0.5);
        }

        // Button
        const buttonY = height - 120;

        new Button(this, width / 2, buttonY, 'Return to game', () => {
            this.scene.stop();
            this.scene.resume('LevelEditorScene');
        }, { width: 200, backgroundColor: '#3498db' });

        // ESC to return to editor
        this.input.keyboard.on('keydown-ESC', () => {
            this.scene.stop();
            this.scene.resume('LevelEditorScene');
        });
    }
}
