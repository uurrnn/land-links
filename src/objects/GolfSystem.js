import Phaser from 'phaser';
import { TERRAIN_PHYSICS, NOTIFY_COLORS, DEPTH, TEXT_STYLES } from '../consts/GameConfig.js';

// Named constants for magic numbers
const CUP_RADIUS_ROLLING = 12;
const CUP_RADIUS_LANDING = 15;
const CUP_MAX_SPEED = 0.8;
const MIN_ROLL_VELOCITY = 0.03;
const MAX_AIM_ARC_HEIGHT = 100;
const MAX_LAUNCH_ARC_HEIGHT = 150;
const MAX_POWER_BEFORE_DAMPEN = 400;
const POWER_DAMPEN_FACTOR = 0.5;
const MIN_BOUNCE_DIST = 20;
const BOUNCE_POWER_SCALE = 1.5;
const ROLL_POWER_DIVISOR = 45;
const BALL_OFFSET_X = 10;
const SWING_DELAY_MS = 100;
const WIN_DELAY_MS = 2000;

function getTerrainPhysics(terrain) {
    return TERRAIN_PHYSICS[terrain] || TERRAIN_PHYSICS.out;
}

function calculateArc(startX, startY, endX, endY, maxArcHeight) {
    const dist = Phaser.Math.Distance.Between(startX, startY, endX, endY);
    const maxHeight = Math.min(dist / 2, maxArcHeight);
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2 - maxHeight;
    return { dist, maxHeight, midX, midY };
}

function bezierPoint(t, start, mid, end) {
    return (1 - t) * (1 - t) * start + 2 * (1 - t) * t * mid + t * t * end;
}

export default class GolfSystem {
    constructor(scene) {
        this.scene = scene;

        this.golfer = null;
        this.ball = null;
        this.aimGraphics = null;
        this.strokeText = null;

        this.isBallInFlight = false;
        this.isBallRolling = false;
        this.canSwing = false;
        this.rollData = null;
        this.golferGrid = null;
        this.ballGrid = null;

        // Stroke tracking
        this.strokes = 0;
        this.currentHoleIndex = 0;
        this.courseStrokes = []; // Array of strokes per hole
        this.lastValidPosition = null; // For out-of-bounds returns
    }

    enterPlayMode(course) {
        if (course.holes.length === 0) {
            this.scene.showNotification("Need at least 1 hole to play!", NOTIFY_COLORS.error);
            return false;
        }

        if (this.ball) this.scene.tweens.killTweensOf(this.ball);
        if (this.golfer) this.scene.tweens.killTweensOf(this.golfer);
        this.cleanup();

        this.canSwing = false;
        this.scene.showNotification("ENTERING PLAY MODE - ESC to Exit", NOTIFY_COLORS.water);

        const firstHole = course.holes[0];
        if (!firstHole.tee) {
            this.scene.showNotification("Hole has no tee!", NOTIFY_COLORS.error);
            return false;
        }
        this.golferGrid = { x: firstHole.tee.x, y: firstHole.tee.y };
        this.ballGrid = { x: firstHole.tee.x, y: firstHole.tee.y };
        this.lastValidPosition = { x: firstHole.tee.x, y: firstHole.tee.y };

        const teePos = this.scene.gridToIso(this.golferGrid.x, this.golferGrid.y);

        this.golfer = this.scene.add.sprite(teePos.x, teePos.y, 'golfer');
        this.golfer.setOrigin(0.5, 1);
        this.scene.worldContainer.add(this.golfer);

        this.ball = this.scene.add.sprite(teePos.x + BALL_OFFSET_X, teePos.y, 'ball');
        this.ball.setOrigin(0.5, 0.5);
        this.scene.worldContainer.add(this.ball);

        this.aimGraphics = this.scene.add.graphics();
        this.scene.worldContainer.add(this.aimGraphics);

        // Reset stroke tracking for new course playthrough
        this.strokes = 0;
        this.currentHoleIndex = 0;
        this.courseStrokes = [];
        this.strokeText = this.scene.add.text(20, 20, '', {
            ...TEXT_STYLES.label,
            fontSize: '20px',
            backgroundColor: '#000000',
            padding: { x: 10, y: 5 }
        }).setDepth(DEPTH.HUD).setScrollFactor(0);
        this.scene.uiContainer.add(this.strokeText);
        this.updateStrokeDisplay();

        this.scene.cameras.main.centerOn(teePos.x, teePos.y);

        this.scene.time.delayedCall(SWING_DELAY_MS, () => {
            this.canSwing = true;
        });

        return true;
    }

    exitPlayMode() {
        this.canSwing = false;
        this.cleanup();
    }

    cleanup() {
        if (this.golfer) this.golfer.destroy();
        if (this.ball) this.ball.destroy();
        if (this.aimGraphics) this.aimGraphics.destroy();
        if (this.strokeText) this.strokeText.destroy();
        this.golfer = null;
        this.ball = null;
        this.aimGraphics = null;
        this.strokeText = null;
        this.isBallInFlight = false;
        this.isBallRolling = false;
        this.rollData = null;
    }

    update(delta) {
        if (!this.golfer || !this.ball) return;

        if (this.isBallRolling) {
            this.updateBallPhysics(delta);
        } else if (!this.isBallInFlight && this.canSwing) {
            this.updateAiming();
        }
    }

    updateAiming() {
        const pointer = this.scene.input.activePointer;
        const worldPoint = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);

        this.golfer.flipX = (worldPoint.x < this.golfer.x);

        this.aimGraphics.clear();
        this.aimGraphics.lineStyle(2, 0xffffff, 0.5);

        const startX = this.ball.x;
        const startY = this.ball.y;
        const endX = worldPoint.x;
        const endY = worldPoint.y;

        const { midX, midY } = calculateArc(startX, startY, endX, endY, MAX_AIM_ARC_HEIGHT);

        const curve = new Phaser.Curves.QuadraticBezier(
            new Phaser.Math.Vector2(startX, startY),
            new Phaser.Math.Vector2(midX, midY),
            new Phaser.Math.Vector2(endX, endY)
        );
        const points = curve.getPoints(20);
        this.aimGraphics.strokePoints(points);

        this.aimGraphics.fillStyle(0xffffff, 0.3);
        this.aimGraphics.fillCircle(endX, endY, 10);
    }

    swingAndHit(pointer) {
        if (this.isBallInFlight || !this.canSwing) return;
        this.isBallInFlight = true;

        // Increment stroke counter
        this.strokes++;
        this.updateStrokeDisplay();

        const targetPoint = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);

        this.scene.tweens.add({
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

        const { dist, maxHeight, midX, midY } = calculateArc(startX, startY, endX, endY, MAX_LAUNCH_ARC_HEIGHT);

        this.aimGraphics.clear();

        const flightDuration = 600 + (dist / 1.5);

        this.scene.tweens.add({
            targets: { t: 0 },
            t: 1,
            duration: flightDuration,
            ease: 'Linear',
            onUpdate: (tween) => {
                if (!this.ball) return;
                const curT = tween.getValue();

                this.ball.x = bezierPoint(curT, startX, midX, endX);
                this.ball.y = bezierPoint(curT, startY, midY, endY);

                const height = Math.sin(curT * Math.PI);
                this.ball.setScale(1 + height * 0.6);
                this.ball.y -= height * maxHeight * 0.5;
            },
            onComplete: () => {
                if (!this.ball) return;
                this.handleImpact(endX, endY, (endX - startX) / dist, (endY - startY) / dist, dist);
            }
        });
    }

    handleImpact(x, y, dirX, dirY, power) {
        this.ball.setScale(1);
        const gridPos = this.scene.worldToGrid(x, y, false);
        const tile = this.scene.gridData[gridPos.y]?.[gridPos.x];
        const terrain = tile ? tile.type : 'out';

        let effectivePower = power;
        if (power > MAX_POWER_BEFORE_DAMPEN) {
            effectivePower = MAX_POWER_BEFORE_DAMPEN + (power - MAX_POWER_BEFORE_DAMPEN) * POWER_DAMPEN_FACTOR;
        }

        // Out of bounds - return to last valid position
        if (terrain === 'out') {
            this.scene.showNotification("OUT OF BOUNDS! Returning to last position.", NOTIFY_COLORS.error);
            this.strokes++; // Penalty stroke
            this.updateStrokeDisplay();

            // Return ball to last valid position
            const returnPos = this.scene.gridToIso(this.lastValidPosition.x, this.lastValidPosition.y);
            this.ball.setPosition(returnPos.x, returnPos.y);
            this.ballGrid = { ...this.lastValidPosition };

            // Move golfer to ball
            this.scene.tweens.add({
                targets: this.golfer,
                x: returnPos.x - BALL_OFFSET_X,
                y: returnPos.y,
                duration: 500,
                onComplete: () => {
                    this.golferGrid = { ...this.lastValidPosition };
                    this.isBallInFlight = false;
                }
            });
            return;
        }

        if (terrain === 'water') {
            this.scene.showNotification("SPLASH!", NOTIFY_COLORS.water);
            this.scene.tweens.add({
                targets: this.ball,
                alpha: 0,
                scale: 0.5,
                duration: 500,
                onComplete: () => this.scene.exitPlayMode()
            });
            return;
        }

        if (terrain === 'sand') {
            this.scene.showNotification("PLOP!", NOTIFY_COLORS.sand);
            this.ballGrid = gridPos;
            this.checkBallLanding();
            this.isBallInFlight = false;
            return;
        }

        const physics = getTerrainPhysics(terrain);
        const bounceDist = effectivePower * physics.bounceMult * BOUNCE_POWER_SCALE;

        if (bounceDist > MIN_BOUNCE_DIST) {
            this.bounceBall(x, y, dirX, dirY, bounceDist, physics.rollMult);
        } else {
            this.rollBall(x, y, dirX, dirY, effectivePower * physics.bounceMult * physics.rollMult * 0.5);
        }
    }

    bounceBall(startX, startY, dirX, dirY, dist, rollMult) {
        const endX = startX + dirX * dist;
        const endY = startY + dirY * dist;
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2 - (dist / 4);

        const duration = 300 + dist;

        this.scene.tweens.add({
            targets: { t: 0 },
            t: 1,
            duration: duration,
            ease: 'Linear',
            onUpdate: (tween) => {
                if (!this.ball) return;
                const curT = tween.getValue();
                this.ball.x = bezierPoint(curT, startX, midX, endX);
                this.ball.y = bezierPoint(curT, startY, midY, endY);

                const height = Math.sin(curT * Math.PI);
                this.ball.y -= height * (dist / 10);
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
            v: power / ROLL_POWER_DIVISOR
        };
    }

    updateBallPhysics(delta) {
        if (!this.isBallRolling || !this.ball || !this.rollData) return;

        const d = this.rollData.v * delta;

        this.rollData.x += this.rollData.dx * d;
        this.rollData.y += this.rollData.dy * d;

        this.ball.x = this.rollData.x;
        this.ball.y = this.rollData.y;

        const currentHole = this.scene.course.holes[this.currentHoleIndex];
        if (!currentHole?.cup) return;
        const cupPos = this.scene.gridToIso(currentHole.cup.x, currentHole.cup.y);
        const distToCup = Phaser.Math.Distance.Between(this.ball.x, this.ball.y, cupPos.x, cupPos.y);

        if (distToCup < CUP_RADIUS_ROLLING && this.rollData.v < CUP_MAX_SPEED) {
            this.isBallRolling = false;
            this.isBallInFlight = false;
            this.triggerWin();
            return;
        }

        const gridPos = this.scene.worldToGrid(this.ball.x, this.ball.y, false);
        const tile = this.scene.gridData[gridPos.y]?.[gridPos.x];
        const terrain = tile ? tile.type : 'out';

        // Out of bounds - return to last valid position
        if (terrain === 'out') {
            this.isBallRolling = false;
            this.scene.showNotification("OUT OF BOUNDS! Returning to last position.", NOTIFY_COLORS.error);
            this.strokes++; // Penalty stroke
            this.updateStrokeDisplay();

            const returnPos = this.scene.gridToIso(this.lastValidPosition.x, this.lastValidPosition.y);
            this.ball.setPosition(returnPos.x, returnPos.y);
            this.ballGrid = { ...this.lastValidPosition };

            this.scene.tweens.add({
                targets: this.golfer,
                x: returnPos.x - BALL_OFFSET_X,
                y: returnPos.y,
                duration: 500,
                onComplete: () => {
                    this.golferGrid = { ...this.lastValidPosition };
                    this.isBallInFlight = false;
                }
            });
            return;
        }

        if (terrain === 'water') {
            this.isBallRolling = false;
            this.handleImpact(this.ball.x, this.ball.y, 0, 0, 0);
            return;
        }

        if (terrain === 'sand') {
            this.isBallRolling = false;
            this.scene.showNotification("PLOP!", NOTIFY_COLORS.sand);
            this.isBallInFlight = false;
            this.ballGrid = gridPos;
            this.checkBallLanding();
            return;
        }

        const physics = getTerrainPhysics(terrain);
        this.rollData.v *= Math.pow(physics.friction, delta / 16);

        if (this.rollData.v < MIN_ROLL_VELOCITY) {
            this.isBallRolling = false;
            this.isBallInFlight = false;
            this.ballGrid = gridPos;
            this.checkBallLanding();
        }
    }

    checkBallLanding() {
        const currentHole = this.scene.course.holes[this.currentHoleIndex];
        if (!currentHole?.cup) return;
        const cupPos = this.scene.gridToIso(currentHole.cup.x, currentHole.cup.y);
        const dist = Phaser.Math.Distance.Between(this.ball.x, this.ball.y, cupPos.x, cupPos.y);

        if (dist < CUP_RADIUS_LANDING) {
            this.triggerWin();
        } else {
            // Update last valid position (ball is in bounds)
            this.lastValidPosition = { ...this.ballGrid };

            const targetX = this.ball.x - BALL_OFFSET_X;
            const targetY = this.ball.y;
            this.scene.tweens.add({
                targets: this.golfer,
                x: targetX,
                y: targetY,
                duration: 500,
                onComplete: () => {
                    this.golferGrid = this.scene.worldToGrid(targetX, targetY);
                }
            });
        }
    }

    triggerWin() {
        this.scene.showNotification("IN THE HOLE!", NOTIFY_COLORS.warning);
        this.ball.setVisible(false);
        this.canSwing = false;
        this.aimGraphics.clear();

        // Save strokes for this hole
        this.courseStrokes.push(this.strokes);

        this.scene.time.delayedCall(WIN_DELAY_MS, () => {
            // Check if there are more holes
            if (this.currentHoleIndex + 1 < this.scene.course.holes.length) {
                this.startNextHole();
            } else {
                // Course complete!
                this.completeCourse();
            }
        });
    }

    startNextHole() {
        this.currentHoleIndex++;
        const nextHole = this.scene.course.holes[this.currentHoleIndex];

        if (!nextHole?.tee) {
            this.scene.showNotification("Next hole has no tee!", NOTIFY_COLORS.error);
            this.scene.exitPlayMode();
            return;
        }

        // Reset for new hole
        this.strokes = 0;
        this.golferGrid = { x: nextHole.tee.x, y: nextHole.tee.y };
        this.ballGrid = { x: nextHole.tee.x, y: nextHole.tee.y };
        this.lastValidPosition = { x: nextHole.tee.x, y: nextHole.tee.y };

        const teePos = this.scene.gridToIso(this.golferGrid.x, this.golferGrid.y);

        // Move golfer and ball to new tee
        this.golfer.setPosition(teePos.x, teePos.y);
        this.ball.setPosition(teePos.x + BALL_OFFSET_X, teePos.y);
        this.ball.setVisible(true);

        // Update display
        this.updateStrokeDisplay();
        this.scene.showNotification(`Hole ${this.currentHoleIndex + 1}`, NOTIFY_COLORS.success);

        // Center camera on new tee
        this.scene.cameras.main.centerOn(teePos.x, teePos.y);

        // Re-enable swing
        this.isBallInFlight = false;
        this.isBallRolling = false;
        this.canSwing = true;
    }

    completeCourse() {
        // Calculate total strokes
        const totalStrokes = this.courseStrokes.reduce((sum, s) => sum + s, 0);

        this.scene.showNotification(`Course Complete! Total: ${totalStrokes} strokes`, NOTIFY_COLORS.success);

        this.scene.time.delayedCall(WIN_DELAY_MS, () => {
            // Launch course complete scene
            this.scene.scene.pause('LevelEditorScene');
            this.scene.scene.launch('CourseCompleteScene', {
                courseStrokes: this.courseStrokes,
                clubName: this.scene.clubName,
                totalHoles: this.scene.course.holes.length
            });
        });
    }

    refreshPositions() {
        if (this.golfer) {
            const pos = this.scene.gridToIso(this.golferGrid.x, this.golferGrid.y);
            this.golfer.setPosition(pos.x, pos.y);
        }
        if (this.ball) {
            const pos = this.scene.gridToIso(this.ballGrid.x, this.ballGrid.y);
            this.ball.setPosition(pos.x, pos.y);
        }
    }

    updateStrokeDisplay() {
        if (!this.strokeText) return;
        const holeNum = this.currentHoleIndex + 1;
        const totalHoles = this.scene.course.holes.length;
        this.strokeText.setText(`Hole ${holeNum}/${totalHoles} | Strokes: ${this.strokes}`);
    }
}
