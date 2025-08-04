const raylib = require('./bin/node_reflection.node')
// import delay from 'delay';

// #include "raylib.h"
// #include "raymath.h"
// #include "rlgl.h"

// Custom Blend Modes
const RLGL_SRC_ALPHA = 0x0302;
const RLGL_MIN = 0x8007;
const RLGL_MAX = 0x8008;

const MAX_BOXES = 20;
const MAX_SHADOWS = MAX_BOXES * 3; // MAX_BOXES *3. Each box can cast up to two shadow volumes for the edges it is away from, and one for the box itself
const MAX_LIGHTS = 16;

// Shadow geometry type
class ShadowGeometry {
    constructor() {
        this.vertices = Array<Vector2>[ 4 ];
    }
};

// Light info type
class LightInfo {
    constructor() {
        this.active; // bool   // Is this light slot active?
        this.dirty;  // bool    // Does this light need to be updated?
        this.valid;  // bool    // Is this light in a valid position?

        this.position;    // Vector2     // Light position
        this.mask;        // RenderTexture   // Alpha mask for the light
        this.outerRadius; // float    // The distance the light touches
        this.bounds;      // Rectangle     // A cached rectangle of the light bounds to help with culling

        this.shadows = Array<ShadowGeometry>[ MAX_SHADOWS ]; // ShadowGeometry
        this.shadowCount;                                    // int
    }
}
LightInfo;

var lights = Array<LightInfo>[ MAX_LIGHTS ]; // = {0};

// Move a light and mark it as dirty so that we update it's mask next frame
function MoveLight(/*int*/ slot, /*float*/ x, /*float*/ y) {
    lights[slot].dirty = true;
    lights[slot].position.x = x;
    lights[slot].position.y = y;

    // update the cached bounds
    lights[slot].bounds.x = x - lights[slot].outerRadius;
    lights[slot].bounds.y = y - lights[slot].outerRadius;
}

// Compute a shadow volume for the edge
// It takes the edge and projects it back by the light radius and turns it into a quad
function ComputeShadowVolumeForEdge(/*int*/ slot, /*Vector2*/ sp, /*Vector2*/ ep) {
    if(lights[slot].shadowCount >= MAX_SHADOWS) return;

    var /*float*/ extension = lights[slot].outerRadius * 2;

    var /*Vector2*/ spVector = Vector2Normalize(Vector2Subtract(sp, lights[slot].position));
    var /*Vector2*/ spProjection = Vector2Add(sp, Vector2Scale(spVector, extension));

    var /*Vector2*/ epVector = Vector2Normalize(Vector2Subtract(ep, lights[slot].position));
    var /*Vector2*/ epProjection = Vector2Add(ep, Vector2Scale(epVector, extension));

    lights[slot].shadows[lights[slot].shadowCount].vertices[0] = sp;
    lights[slot].shadows[lights[slot].shadowCount].vertices[1] = ep;
    lights[slot].shadows[lights[slot].shadowCount].vertices[2] = epProjection;
    lights[slot].shadows[lights[slot].shadowCount].vertices[3] = spProjection;

    lights[slot].shadowCount++;
}

// Draw the light and shadows to the mask for a light
function DrawLightMask(/*int*/ slot) {
    // Use the light mask
    BeginTextureMode(lights[slot].mask);

    ClearBackground(WHITE);

    // Force the blend mode to only set the alpha of the destination
    rlSetBlendFactors(RLGL_SRC_ALPHA, RLGL_SRC_ALPHA, RLGL_MIN);
    rlSetBlendMode(BLEND_CUSTOM);

    // If we are valid, then draw the light radius to the alpha mask
    if(lights[slot].valid)
        DrawCircleGradient((int) lights[slot].position.x, (int) lights[slot].position.y, lights[slot].outerRadius, ColorAlpha(WHITE, 0), WHITE);

    rlDrawRenderBatchActive();

    // Cut out the shadows from the light radius by forcing the alpha to maximum
    rlSetBlendMode(BLEND_ALPHA);
    rlSetBlendFactors(RLGL_SRC_ALPHA, RLGL_SRC_ALPHA, RLGL_MAX);
    rlSetBlendMode(BLEND_CUSTOM);

    // Draw the shadows to the alpha mask
    for(int i = 0; i < lights[slot].shadowCount; i++) {
        DrawTriangleFan(lights[slot].shadows[i].vertices, 4, WHITE);
    }

    rlDrawRenderBatchActive();

    // Go back to normal blend mode
    rlSetBlendMode(BLEND_ALPHA);

    EndTextureMode();
}

// Setup a light
void SetupLight(int slot, float x, float y, float radius) {
    lights[slot].active = true;
    lights[slot].valid = false; // The light must prove it is valid
    lights[slot].mask = LoadRenderTexture(GetScreenWidth(), GetScreenHeight());
    lights[slot].outerRadius = radius;

    lights[slot].bounds.width = radius * 2;
    lights[slot].bounds.height = radius * 2;

    MoveLight(slot, x, y);

    // Force the render texture to have something in it
    DrawLightMask(slot);
}

// See if a light needs to update it's mask
bool UpdateLight(int slot, Rectangle * boxes, int count) {
    if(!lights[slot].active || !lights[slot].dirty) return false;

    lights[slot].dirty = false;
    lights[slot].shadowCount = 0;
    lights[slot].valid = false;

    for(int i = 0; i < count; i++) {
        // Are we in a box? if so we are not valid
        if(CheckCollisionPointRec(lights[slot].position, boxes[i])) return false;

        // If this box is outside our bounds, we can skip it
        if(!CheckCollisionRecs(lights[slot].bounds, boxes[i])) continue;

        // Check the edges that are on the same side we are, and cast shadow volumes out from them

        // Top
        Vector2 sp = (Vector2) { boxes[i].x, boxes[i].y };
        Vector2 ep = (Vector2) { boxes[i].x + boxes[i].width, boxes[i].y };

        if(lights[slot].position.y > ep.y) ComputeShadowVolumeForEdge(slot, sp, ep);

        // Right
        sp = ep;
        ep.y += boxes[i].height;
        if(lights[slot].position.x < ep.x) ComputeShadowVolumeForEdge(slot, sp, ep);

        // Bottom
        sp = ep;
        ep.x -= boxes[i].width;
        if(lights[slot].position.y < ep.y) ComputeShadowVolumeForEdge(slot, sp, ep);

        // Left
        sp = ep;
        ep.y -= boxes[i].height;
        if(lights[slot].position.x > ep.x) ComputeShadowVolumeForEdge(slot, sp, ep);

        // The box itself
        lights[slot].shadows[lights[slot].shadowCount].vertices[0] = (Vector2) { boxes[i].x, boxes[i].y };
        lights[slot].shadows[lights[slot].shadowCount].vertices[1] = (Vector2) { boxes[i].x, boxes[i].y + boxes[i].height };
        lights[slot].shadows[lights[slot].shadowCount].vertices[2] = (Vector2) { boxes[i].x + boxes[i].width, boxes[i].y + boxes[i].height };
        lights[slot].shadows[lights[slot].shadowCount].vertices[3] = (Vector2) { boxes[i].x + boxes[i].width, boxes[i].y };
        lights[slot].shadowCount++;
    }

    lights[slot].valid = true;

    DrawLightMask(slot);

    return true;
}

// Set up some boxes
void SetupBoxes(Rectangle * boxes, int * count) {
    boxes[0] = (Rectangle) { 150, 80, 40, 40 };
    boxes[1] = (Rectangle) { 1200, 700, 40, 40 };
    boxes[2] = (Rectangle) { 200, 600, 40, 40 };
    boxes[3] = (Rectangle) { 1000, 50, 40, 40 };
    boxes[4] = (Rectangle) { 500, 350, 40, 40 };

    for(int i = 5; i < MAX_BOXES; i++) {
        boxes[i] = (Rectangle) { (float) GetRandomValue(0, GetScreenWidth()), (float) GetRandomValue(0, GetScreenHeight()), (float) GetRandomValue(10, 100), (float) GetRandomValue(10, 100) };
    }

    * count = MAX_BOXES;
}

//------------------------------------------------------------------------------------
// Program main entry point
//------------------------------------------------------------------------------------
int main(void) {
    // Initialization
    //--------------------------------------------------------------------------------------
    const int screenWidth = 800;
    const int screenHeight = 450;

    InitWindow(screenWidth, screenHeight, "raylib [shapes] example - top down lights");

    // Initialize our 'world' of boxes
    int boxCount = 0;
    Rectangle boxes[MAX_BOXES] = {0};
    SetupBoxes(boxes, & boxCount);

    // Create a checkerboard ground texture
    Image img = GenImageChecked(64, 64, 32, 32, DARKBROWN, DARKGRAY);
    Texture2D backgroundTexture = LoadTextureFromImage(img);
    UnloadImage(img);

    // Create a global light mask to hold all the blended lights
    RenderTexture lightMask = LoadRenderTexture(GetScreenWidth(), GetScreenHeight());

    // Setup initial light
    SetupLight(0, 600, 400, 300);
    int nextLight = 1;

    bool showLines = false;

    SetTargetFPS(60); // Set our game to run at 60 frames-per-second
    //--------------------------------------------------------------------------------------

    // Main game loop
    while(!WindowShouldClose()) // Detect window close button or ESC key
    {
        // Update
        //----------------------------------------------------------------------------------
        // Drag light 0
        if(IsMouseButtonDown(MOUSE_BUTTON_LEFT)) MoveLight(0, GetMousePosition().x, GetMousePosition().y);

        // Make a new light
        if(IsMouseButtonPressed(MOUSE_BUTTON_RIGHT) && (nextLight < MAX_LIGHTS)) {
            SetupLight(nextLight, GetMousePosition().x, GetMousePosition().y, 200);
            nextLight++;
        }

        // Toggle debug info
        if(IsKeyPressed(KEY_F1)) showLines = !showLines;

        // Update the lights and keep track if any were dirty so we know if we need to update the master light mask
        bool dirtyLights = false;
        for(int i = 0; i < MAX_LIGHTS; i++) {
            if(UpdateLight(i, boxes, boxCount)) dirtyLights = true;
        }

        // Update the light mask
        if(dirtyLights) {
            // Build up the light mask
            BeginTextureMode(lightMask);

            ClearBackground(BLACK);

            // Force the blend mode to only set the alpha of the destination
            rlSetBlendFactors(RLGL_SRC_ALPHA, RLGL_SRC_ALPHA, RLGL_MIN);
            rlSetBlendMode(BLEND_CUSTOM);

            // Merge in all the light masks
            for(int i = 0; i < MAX_LIGHTS; i++) {
                if(lights[i].active) DrawTextureRec(lights[i].mask.texture, (Rectangle) { 0, 0, (float) GetScreenWidth(), -(float) GetScreenHeight() }, Vector2Zero(), WHITE);
            }

            rlDrawRenderBatchActive();

            // Go back to normal blend
            rlSetBlendMode(BLEND_ALPHA);
            EndTextureMode();
        }
        //----------------------------------------------------------------------------------

        // Draw
        //----------------------------------------------------------------------------------
        BeginDrawing();

        ClearBackground(BLACK);

        // Draw the tile background
        DrawTextureRec(backgroundTexture, (Rectangle) { 0, 0, (float) GetScreenWidth(), (float) GetScreenHeight() }, Vector2Zero(), WHITE);

        // Overlay the shadows from all the lights
        DrawTextureRec(lightMask.texture, (Rectangle) { 0, 0, (float) GetScreenWidth(), -(float) GetScreenHeight() }, Vector2Zero(), ColorAlpha(WHITE, showLines ? 0.75f : 1.0f));

        // Draw the lights
        for(int i = 0; i < MAX_LIGHTS; i++) {
            if(lights[i].active) DrawCircle((int) lights[i].position.x, (int) lights[i].position.y, 10, (i == 0) ? YELLOW : WHITE);
        }

        if(showLines) {
            for(int s = 0; s < lights[0].shadowCount; s++) {
                DrawTriangleFan(lights[0].shadows[s].vertices, 4, DARKPURPLE);
            }

            for(int b = 0; b < boxCount; b++) {
                if(CheckCollisionRecs(boxes[b], lights[0].bounds)) DrawRectangleRec(boxes[b], PURPLE);

                DrawRectangleLines((int) boxes[b].x, (int) boxes[b].y, (int) boxes[b].width, (int) boxes[b].height, DARKBLUE);
            }

            DrawText("(F1) Hide Shadow Volumes", 10, 50, 10, GREEN);
        } else {
            DrawText("(F1) Show Shadow Volumes", 10, 50, 10, GREEN);
        }

        DrawFPS(screenWidth - 80, 10);
        DrawText("Drag to move light #1", 10, 10, 10, DARKGREEN);
        DrawText("Right click to add new light", 10, 30, 10, DARKGREEN);

        EndDrawing();
        //----------------------------------------------------------------------------------
    }

    // De-Initialization
    //--------------------------------------------------------------------------------------
    UnloadTexture(backgroundTexture);
    UnloadRenderTexture(lightMask);
    for(int i = 0; i < MAX_LIGHTS; i++) {
        if(lights[i].active) UnloadRenderTexture(lights[i].mask);
    }

    CloseWindow(); // Close window and OpenGL context
    //--------------------------------------------------------------------------------------

    return 0;
}

/*
let x = 0, y = 0
let x_ = 2, y_ = 2
const w = 100, h = 100

class Vec {
    constructor(x, y) {
        this.x = x;
        this.y = y
        // Object.freeze(this);
    }
    add(other) {
        this.x += other.x;
        this.y += other.y
    }
    mul(arg) {
        this.x *= arg;
        this.y *= arg
    }
    // add(val) {
    //     this.x = val;
    //     this.y = val
    // }
}

class Color {
    constructor(r, g, b, a = 0xFF) {
        this.r = r; // Color red value
        this.g = g; // Color green value
        this.b = b; // Color blue value
        this.a = a; // Color alpha value
        // Object.freeze(this);
    }
}

const LIGHTGRAY = new Color(200, 200, 200, 255) // Light Gray
const GRAY = new Color(130, 130, 130, 255)      // Gray
const DARKGRAY = new Color(80, 80, 80, 255)     // Dark Gray
const YELLOW = new Color(253, 249, 0, 255)      // Yellow
const GOLD = new Color(255, 203, 0, 255)        // Gold
const ORANGE = new Color(255, 161, 0, 255)      // Orange
const PINK = new Color(255, 109, 194, 255)      // Pink
const RED = new Color(230, 41, 55, 255)         // Red
const MAROON = new Color(190, 33, 55, 255)      // Maroon
const GREEN = new Color(0, 228, 48, 255)        // Green
const LIME = new Color(0, 158, 47, 255)         // Lime
const DARKGREEN = new Color(0, 117, 44, 255)    // Dark Green
const SKYBLUE = new Color(102, 191, 255, 255)   // Sky Blue
const BLUE = new Color(0, 121, 241, 255)        // Blue
const DARKBLUE = new Color(0, 82, 172, 255)     // Dark Blue
const PURPLE = new Color(200, 122, 255, 255)    // Purple
const VIOLET = new Color(135, 60, 190, 255)     // Violet
const DARKPURPLE = new Color(112, 31, 126, 255) // Dark Purple
const BEIGE = new Color(211, 176, 131, 255)     // Beige
const BROWN = new Color(127, 106, 79, 255)      // Brown
const DARKBROWN = new Color(76, 63, 47, 255)    // Dark Brown

const WHITE = new Color(255, 255, 255, 255)    // White
const BLACK = new Color(0, 0, 0, 255)          // Black
const BLANK = new Color(0, 0, 0, 0)            // Blank (Transparent)
const MAGENTA = new Color(255, 0, 255, 255)    // Magenta
const RAYWHITE = new Color(245, 245, 245, 255) // My own White (raylib logo)

const Background = new Color(0x10, 0x10, 0x10);
const Size = new Vec(29, 29);

let Pos = new Vec(300, 300)

class Rect {
    constructor() {
        this.pos = new Vec(
            raylib.getRandomValue(0, 800 - Size.x),
            raylib.getRandomValue(0, 600 - Size.y));
        this.spd = new Vec(
            raylib.getRandomValue(-10, +10),
            raylib.getRandomValue(-10, +10));
        this.clr = new Color(
            raylib.getRandomValue(128, 255),
            raylib.getRandomValue(128, 255), raylib.getRandomValue(128, 255), 255);
        // Object.freeze(this);
    }
    draw() {
        raylib.drawRectangleV(this.pos, Size, this.clr)
    }
    translate() {
        this.pos.add(this.spd)
    }
    translate2(pos) {
        this.pos.add(this.spd = pos)
    }
    contains(pos) {
        return this.pos.x <= pos.x && this.pos.y <= pos.y
            && (this.pos.x + Size.x) >= pos.x && (this.pos.y + Size.y) >= pos.y
    }
}

let Positions = [];

for(let i = 0; i < 3; ++i) {
    Positions.push(new Rect())
}

var rect = new Rect();
rect.clr = RED;

raylib.initWindow(800, 600, 'JS')
raylib.setTargetFPS(30)

while(!raylib.windowShouldClose()) {
    raylib.beginDrawing()
    if(0) {
        raylib.clearBackground(Background)
        // raylib.drawRectangle(100, 100, w, h, MAROON)

        rect.draw()

        raylib.endDrawing()

        for(var obj of Positions) {
            obj.translate()
            if(obj.pos.x >= 800 - Size.x && obj.spd.x > 0 || obj.pos.x <= 0 && obj.spd.x < 0) obj.spd.x = -obj.spd.x
            if(obj.pos.y >= 600 - Size.y && obj.spd.y > 0 || obj.pos.y <= 0 && obj.spd.y < 0) obj.spd.y = -obj.spd.y
            obj.draw()
        }

        if(rect.contains(raylib.getMousePosition()) && raylib.isMouseButtonDown(0)) {
            rect.translate2(raylib.getMouseDelta())
        }
    }
    else {
        raylib.endDrawing()
        console.warn(raylib.getFrameTime())
    }

    console.warn(raylib.getTime())
    console.warn(raylib.getMousePosition())
    console.warn(raylib.isMouseButtonPressed(0))

    console.warn(raylib.loadMaterialDefault());

    // raylib.waitTime(1. / 120)
}

throw ''

raylib.closeWindow()
raylib.windowShouldClose()
raylib.isWindowReady()
raylib.isWindowFullscreen()
raylib.isWindowHidden()
raylib.isWindowMinimized()
raylib.isWindowMaximized()
raylib.isWindowFocused()
raylib.isWindowResized()
raylib.isWindowState()
raylib.setWindowState()
raylib.clearWindowState()
raylib.toggleFullscreen()
raylib.toggleBorderlessWindowed()
raylib.maximizeWindow()
raylib.minimizeWindow()
raylib.restoreWindow()
raylib.setWindowIcon()
raylib.setWindowIcons()
raylib.setWindowTitle()
raylib.setWindowPosition()
raylib.setWindowMonitor()
raylib.setWindowMinSize()
raylib.setWindowMaxSize()
raylib.setWindowSize()
raylib.setWindowOpacity()
raylib.setWindowFocused()
raylib.getWindowHandle()
raylib.getScreenWidth()
raylib.getScreenHeight()
raylib.getRenderWidth()
raylib.getRenderHeight()
raylib.getMonitorCount()
raylib.getCurrentMonitor()
raylib.getMonitorPosition()
raylib.getMonitorWidth()
raylib.getMonitorHeight()
raylib.getMonitorPhysicalWidth()
raylib.getMonitorPhysicalHeight()
raylib.getMonitorRefreshRate()
raylib.getWindowPosition()
raylib.getWindowScaleDPI()
raylib.getMonitorName()
raylib.setClipboardText()
raylib.getClipboardText()
raylib.getClipboardImage()
raylib.enableEventWaiting()
raylib.disableEventWaiting()
raylib.showCursor()
raylib.hideCursor()
raylib.isCursorHidden()
raylib.enableCursor()
raylib.disableCursor()
raylib.isCursorOnScreen()
raylib.clearBackground()
raylib.beginDrawing()
raylib.endDrawing()
raylib.beginMode2D()
raylib.endMode2D()
raylib.beginMode3D()
raylib.endMode3D()
raylib.beginTextureMode()
raylib.endTextureMode()
raylib.beginShaderMode()
raylib.endShaderMode()
raylib.beginBlendMode()
raylib.endBlendMode()
raylib.beginScissorMode()
raylib.endScissorMode()
raylib.beginVrStereoMode()
raylib.endVrStereoMode()
raylib.loadVrStereoConfig()
raylib.unloadVrStereoConfig()
raylib.loadShader()
raylib.loadShaderFromMemory()
raylib.isShaderValid()
raylib.getShaderLocation()
raylib.getShaderLocationAttrib()
raylib.setShaderValue()
raylib.setShaderValueV()
raylib.setShaderValueMatrix()
raylib.setShaderValueTexture()
raylib.unloadShader()
raylib.getScreenToWorldRay()
raylib.getScreenToWorldRayEx()
raylib.getWorldToScreen()
raylib.getWorldToScreenEx()
raylib.getWorldToScreen2D()
raylib.getScreenToWorld2D()
raylib.getCameraMatrix()
raylib.getCameraMatrix2D()
raylib.setTargetFPS()
raylib.getFrameTime()
raylib.getTime()
raylib.getFPS()
raylib.swapScreenBuffer()
raylib.pollInputEvents()
raylib.waitTime()
raylib.setRandomSeed()
raylib.getRandomValue()
raylib.loadRandomSequence()
raylib.unloadRandomSequence()
raylib.takeScreenshot()
raylib.setConfigFlags()
raylib.openURL()
raylib.traceLog()
raylib.setTraceLogLevel()
raylib.memAlloc()
raylib.memRealloc()
raylib.memFree()
raylib.setTraceLogCallback()
raylib.setLoadFileDataCallback()
raylib.setSaveFileDataCallback()
raylib.setLoadFileTextCallback()
raylib.setSaveFileTextCallback()
raylib.loadFileData()
raylib.unloadFileData()
raylib.saveFileData()
raylib.exportDataAsCode()
raylib.loadFileText()
raylib.unloadFileText()
raylib.saveFileText()
raylib.fileExists()
raylib.directoryExists()
raylib.isFileExtension()
raylib.getFileLength()
raylib.getFileExtension()
raylib.getFileName()
raylib.getFileNameWithoutExt()
raylib.getDirectoryPath()
raylib.getPrevDirectoryPath()
raylib.getWorkingDirectory()
raylib.getApplicationDirectory()
raylib.makeDirectory()
raylib.changeDirectory()
raylib.isPathFile()
raylib.isFileNameValid()
raylib.loadDirectoryFiles()
raylib.loadDirectoryFilesEx()
raylib.unloadDirectoryFiles()
raylib.isFileDropped()
raylib.loadDroppedFiles()
raylib.unloadDroppedFiles()
raylib.getFileModTime()
raylib.compressData()
raylib.decompressData()
raylib.encodeDataBase64()
raylib.decodeDataBase64()
raylib.computeCRC32()
raylib.computeMD5()
raylib.computeSHA1()
raylib.loadAutomationEventList()
raylib.unloadAutomationEventList()
raylib.exportAutomationEventList()
raylib.setAutomationEventList()
raylib.setAutomationEventBaseFrame()
raylib.startAutomationEventRecording()
raylib.stopAutomationEventRecording()
raylib.playAutomationEvent()
raylib.isKeyPressed()
raylib.isKeyPressedRepeat()
raylib.isKeyDown()
raylib.isKeyReleased()
raylib.isKeyUp()
raylib.getKeyPressed()
raylib.getCharPressed()
raylib.getKeyName()
raylib.setExitKey()
raylib.isGamepadAvailable()
raylib.getGamepadName()
raylib.isGamepadButtonPressed()
raylib.isGamepadButtonDown()
raylib.isGamepadButtonReleased()
raylib.isGamepadButtonUp()
raylib.getGamepadButtonPressed()
raylib.getGamepadAxisCount()
raylib.getGamepadAxisMovement()
raylib.setGamepadMappings()
raylib.setGamepadVibration()
raylib.isMouseButtonPressed()
raylib.isMouseButtonDown()
raylib.isMouseButtonReleased()
raylib.isMouseButtonUp()
raylib.getMouseX()
raylib.getMouseY()
raylib.getMousePosition()
raylib.getMouseDelta()
raylib.setMousePosition()
raylib.setMouseOffset()
raylib.setMouseScale()
raylib.getMouseWheelMove()
raylib.getMouseWheelMoveV()
raylib.setMouseCursor()
raylib.getTouchX()
raylib.getTouchY()
raylib.getTouchPosition()
raylib.getTouchPointId()
raylib.getTouchPointCount()
raylib.setGesturesEnabled()
raylib.isGestureDetected()
raylib.getGestureDetected()
raylib.getGestureHoldDuration()
raylib.getGestureDragVector()
raylib.getGestureDragAngle()
raylib.getGesturePinchVector()
raylib.getGesturePinchAngle()
raylib.updateCamera()
raylib.updateCameraPro()
raylib.setShapesTexture()
raylib.getShapesTexture()
raylib.getShapesTextureRectangle()
raylib.drawPixel()
raylib.drawPixelV()
raylib.drawLine()
raylib.drawLineV()
raylib.drawLineEx()
raylib.drawLineStrip()
raylib.drawLineBezier()
raylib.drawCircle()
raylib.drawCircleSector()
raylib.drawCircleSectorLines()
raylib.drawCircleGradient()
raylib.drawCircleV()
raylib.drawCircleLines()
raylib.drawCircleLinesV()
raylib.drawEllipse()
raylib.drawEllipseV()
raylib.drawEllipseLines()
raylib.drawEllipseLinesV()
raylib.drawRing()
raylib.drawRingLines()
raylib.drawRectangle()
raylib.drawRectangleV()
raylib.drawRectangleRec()
raylib.drawRectanglePro()
raylib.drawRectangleGradientV()
raylib.drawRectangleGradientH()
raylib.drawRectangleGradientEx()
raylib.drawRectangleLines()
raylib.drawRectangleLinesEx()
raylib.drawRectangleRounded()
raylib.drawRectangleRoundedLines()
raylib.drawRectangleRoundedLinesEx()
raylib.drawTriangle()
raylib.drawTriangleLines()
raylib.drawTriangleFan()
raylib.drawTriangleStrip()
raylib.drawPoly()
raylib.drawPolyLines()
raylib.drawPolyLinesEx()
raylib.drawSplineLinear()
raylib.drawSplineBasis()
raylib.drawSplineCatmullRom()
raylib.drawSplineBezierQuadratic()
raylib.drawSplineBezierCubic()
raylib.drawSplineSegmentLinear()
raylib.drawSplineSegmentBasis()
raylib.drawSplineSegmentCatmullRom()
raylib.drawSplineSegmentBezierQuadratic()
raylib.drawSplineSegmentBezierCubic()
raylib.getSplinePointLinear()
raylib.getSplinePointBasis()
raylib.getSplinePointCatmullRom()
raylib.getSplinePointBezierQuad()
raylib.getSplinePointBezierCubic()
raylib.checkCollisionRecs()
raylib.checkCollisionCircles()
raylib.checkCollisionCircleRec()
raylib.checkCollisionCircleLine()
raylib.checkCollisionPointRec()
raylib.checkCollisionPointCircle()
raylib.checkCollisionPointTriangle()
raylib.checkCollisionPointLine()
raylib.checkCollisionPointPoly()
raylib.checkCollisionLines()
raylib.getCollisionRec()
raylib.loadImage()
raylib.loadImageRaw()
raylib.loadImageAnim()
raylib.loadImageAnimFromMemory()
raylib.loadImageFromMemory()
raylib.loadImageFromTexture()
raylib.loadImageFromScreen()
raylib.isImageValid()
raylib.unloadImage()
raylib.exportImage()
raylib.exportImageToMemory()
raylib.exportImageAsCode()
raylib.genImageColor()
raylib.genImageGradientLinear()
raylib.genImageGradientRadial()
raylib.genImageGradientSquare()
raylib.genImageChecked()
raylib.genImageWhiteNoise()
raylib.genImagePerlinNoise()
raylib.genImageCellular()
raylib.genImageText()
raylib.imageCopy()
raylib.imageFromImage()
raylib.imageFromChannel()
raylib.imageText()
raylib.imageTextEx()
raylib.imageFormat()
raylib.imageToPOT()
raylib.imageCrop()
raylib.imageAlphaCrop()
raylib.imageAlphaClear()
raylib.imageAlphaMask()
raylib.imageAlphaPremultiply()
raylib.imageBlurGaussian()
raylib.imageKernelConvolution()
raylib.imageResize()
raylib.imageResizeNN()
raylib.imageResizeCanvas()
raylib.imageMipmaps()
raylib.imageDither()
raylib.imageFlipVertical()
raylib.imageFlipHorizontal()
raylib.imageRotate()
raylib.imageRotateCW()
raylib.imageRotateCCW()
raylib.imageColorTint()
raylib.imageColorInvert()
raylib.imageColorGrayscale()
raylib.imageColorContrast()
raylib.imageColorBrightness()
raylib.imageColorReplace()
raylib.loadImageColors()
raylib.loadImagePalette()
raylib.unloadImageColors()
raylib.unloadImagePalette()
raylib.getImageAlphaBorder()
raylib.getImageColor()
raylib.imageClearBackground()
raylib.imageDrawPixel()
raylib.imageDrawPixelV()
raylib.imageDrawLine()
raylib.imageDrawLineV()
raylib.imageDrawLineEx()
raylib.imageDrawCircle()
raylib.imageDrawCircleV()
raylib.imageDrawCircleLines()
raylib.imageDrawCircleLinesV()
raylib.imageDrawRectangle()
raylib.imageDrawRectangleV()
raylib.imageDrawRectangleRec()
raylib.imageDrawRectangleLines()
raylib.imageDrawTriangle()
raylib.imageDrawTriangleEx()
raylib.imageDrawTriangleLines()
raylib.imageDrawTriangleFan()
raylib.imageDrawTriangleStrip()
raylib.imageDraw()
raylib.imageDrawText()
raylib.imageDrawTextEx()
raylib.loadTexture()
raylib.loadTextureFromImage()
raylib.loadTextureCubemap()
raylib.loadRenderTexture()
raylib.isTextureValid()
raylib.unloadTexture()
raylib.isRenderTextureValid()
raylib.unloadRenderTexture()
raylib.updateTexture()
raylib.updateTextureRec()
raylib.genTextureMipmaps()
raylib.setTextureFilter()
raylib.setTextureWrap()
raylib.drawTexture()
raylib.drawTextureV()
raylib.drawTextureEx()
raylib.drawTextureRec()
raylib.drawTexturePro()
raylib.drawTextureNPatch()
raylib.colorIsEqual()
raylib.fade()
raylib.colorToInt()
raylib.colorNormalize()
raylib.colorFromNormalized()
raylib.colorToHSV()
raylib.colorFromHSV()
raylib.colorTint()
raylib.colorBrightness()
raylib.colorContrast()
raylib.colorAlpha()
raylib.colorAlphaBlend()
raylib.colorLerp()
raylib.getColor()
raylib.getPixelColor()
raylib.setPixelColor()
raylib.getPixelDataSize()
raylib.getFontDefault()
raylib.loadFont()
raylib.loadFontEx()
raylib.loadFontFromImage()
raylib.loadFontFromMemory()
raylib.isFontValid()
raylib.loadFontData()
raylib.genImageFontAtlas()
raylib.unloadFontData()
raylib.unloadFont()
raylib.exportFontAsCode()
raylib.drawFPS()
raylib.drawText()
raylib.drawTextEx()
raylib.drawTextPro()
raylib.drawTextCodepoint()
raylib.drawTextCodepoints()
raylib.setTextLineSpacing()
raylib.measureText()
raylib.measureTextEx()
raylib.getGlyphIndex()
raylib.getGlyphInfo()
raylib.getGlyphAtlasRec()
raylib.loadUTF8()
raylib.unloadUTF8()
raylib.loadCodepoints()
raylib.unloadCodepoints()
raylib.getCodepointCount()
raylib.getCodepoint()
raylib.getCodepointNext()
raylib.getCodepointPrevious()
raylib.codepointToUTF8()
raylib.textCopy()
raylib.textIsEqual()
raylib.textLength()
raylib.textFormat()
raylib.textSubtext()
raylib.textReplace()
raylib.textInsert()
raylib.textJoin()
raylib.textSplit()
raylib.textAppend()
raylib.textFindIndex()
raylib.textToUpper()
raylib.textToLower()
raylib.textToPascal()
raylib.textToSnake()
raylib.textToCamel()
raylib.textToInteger()
raylib.textToFloat()
raylib.drawLine3D()
raylib.drawPoint3D()
raylib.drawCircle3D()
raylib.drawTriangle3D()
raylib.drawTriangleStrip3D()
raylib.drawCube()
raylib.drawCubeV()
raylib.drawCubeWires()
raylib.drawCubeWiresV()
raylib.drawSphere()
raylib.drawSphereEx()
raylib.drawSphereWires()
raylib.drawCylinder()
raylib.drawCylinderEx()
raylib.drawCylinderWires()
raylib.drawCylinderWiresEx()
raylib.drawCapsule()
raylib.drawCapsuleWires()
raylib.drawPlane()
raylib.drawRay()
raylib.drawGrid()
raylib.loadModel()
raylib.loadModelFromMesh()
raylib.isModelValid()
raylib.unloadModel()
raylib.getModelBoundingBox()
raylib.drawModel()
raylib.drawModelEx()
raylib.drawModelWires()
raylib.drawModelWiresEx()
raylib.drawModelPoints()
raylib.drawModelPointsEx()
raylib.drawBoundingBox()
raylib.drawBillboard()
raylib.drawBillboardRec()
raylib.drawBillboardPro()
raylib.uploadMesh()
raylib.updateMeshBuffer()
raylib.unloadMesh()
raylib.drawMesh()
raylib.drawMeshInstanced()
raylib.getMeshBoundingBox()
raylib.genMeshTangents()
raylib.exportMesh()
raylib.exportMeshAsCode()
raylib.genMeshPoly()
raylib.genMeshPlane()
raylib.genMeshCube()
raylib.genMeshSphere()
raylib.genMeshHemiSphere()
raylib.genMeshCylinder()
raylib.genMeshCone()
raylib.genMeshTorus()
raylib.genMeshKnot()
raylib.genMeshHeightmap()
raylib.genMeshCubicmap()
raylib.loadMaterials()
raylib.loadMaterialDefault()
raylib.isMaterialValid()
raylib.unloadMaterial()
raylib.setMaterialTexture()
raylib.setModelMeshMaterial()
raylib.loadModelAnimations()
raylib.updateModelAnimation()
raylib.updateModelAnimationBones()
raylib.unloadModelAnimation()
raylib.unloadModelAnimations()
raylib.isModelAnimationValid()
raylib.checkCollisionSpheres()
raylib.checkCollisionBoxes()
raylib.checkCollisionBoxSphere()
raylib.getRayCollisionSphere()
raylib.getRayCollisionBox()
raylib.getRayCollisionMesh()
raylib.getRayCollisionTriangle()
raylib.getRayCollisionQuad()
raylib.initAudioDevice()
raylib.closeAudioDevice()
raylib.isAudioDeviceReady()
raylib.setMasterVolume()
raylib.getMasterVolume()
raylib.loadWave()
raylib.loadWaveFromMemory()
raylib.isWaveValid()
raylib.loadSound()
raylib.loadSoundFromWave()
raylib.loadSoundAlias()
raylib.isSoundValid()
raylib.updateSound()
raylib.unloadWave()
raylib.unloadSound()
raylib.unloadSoundAlias()
raylib.exportWave()
raylib.exportWaveAsCode()
raylib.playSound()
raylib.stopSound()
raylib.pauseSound()
raylib.resumeSound()
raylib.isSoundPlaying()
raylib.setSoundVolume()
raylib.setSoundPitch()
raylib.setSoundPan()
raylib.waveCopy()
raylib.waveCrop()
raylib.waveFormat()
raylib.loadWaveSamples()
raylib.unloadWaveSamples()
raylib.loadMusicStream()
raylib.loadMusicStreamFromMemory()
raylib.isMusicValid()
raylib.unloadMusicStream()
raylib.playMusicStream()
raylib.isMusicStreamPlaying()
raylib.updateMusicStream()
raylib.stopMusicStream()
raylib.pauseMusicStream()
raylib.resumeMusicStream()
raylib.seekMusicStream()
raylib.setMusicVolume()
raylib.setMusicPitch()
raylib.setMusicPan()
raylib.getMusicTimeLength()
raylib.getMusicTimePlayed()
raylib.loadAudioStream()
raylib.isAudioStreamValid()
raylib.unloadAudioStream()
raylib.updateAudioStream()
raylib.isAudioStreamProcessed()
raylib.playAudioStream()
raylib.pauseAudioStream()
raylib.resumeAudioStream()
raylib.isAudioStreamPlaying()
raylib.stopAudioStream()
raylib.setAudioStreamVolume()
raylib.setAudioStreamPitch()
raylib.setAudioStreamPan()
raylib.setAudioStreamBufferSizeDefault()
raylib.setAudioStreamCallback()
raylib.attachAudioStreamProcessor()
raylib.detachAudioStreamProcessor()
raylib.attachAudioMixedProcessor()
raylib.detachAudioMixedProcessor()
*/
