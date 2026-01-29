export const isoToScreen = (gridX, gridY, tileWidth, tileHeight, centerX = 0, centerY = 0, height = 0) => {
    const isoX = (gridX - gridY) * (tileWidth / 2);
    const isoY = (gridX + gridY) * (tileHeight / 2);

    return {
        x: isoX + centerX,
        y: isoY - height + centerY
    };
};

export const screenToIso = (screenX, screenY, tileWidth, tileHeight, centerX = 0, centerY = 0) => {
    // This is the inverse of the isoToScreen function (ignoring height for selection)
    const adjX = screenX - centerX;
    const adjY = screenY - centerY;

    const halfW = tileWidth / 2;
    const halfH = tileHeight / 2;

    // derived from algebra on the iso equations
    const gridY = (adjY / halfH - adjX / halfW) / 2;
    const gridX = (adjY / halfH + adjX / halfW) / 2;

    return {
        x: Math.round(gridX),
        y: Math.round(gridY)
    };
};
