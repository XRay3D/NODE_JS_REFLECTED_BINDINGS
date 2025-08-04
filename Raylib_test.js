const rl = require('./bin/node_reflection.node')

class Vector2 {
    // constructor() {
    //     this.x;
    //     this.y;
    // }
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
};

// Some Basic Colors
// NOTE: Custom raylib color palette for amazing visuals on WHITE background
const LIGHTGRAY = /*CLITERAL(Color)*/ {r : 200, g : 200, b : 200, a : 255}; // Light Gray
const GRAY = /*CLITERAL(Color)*/ {r : 130, g : 130, b : 130, a : 255};      // Gray
const DARKGRAY = /*CLITERAL(Color)*/ {r : 80, g : 80, b : 80, a : 255};     // Dark Gray
const YELLOW = /*CLITERAL(Color)*/ {r : 253, g : 249, b : 0, a : 255};      // Yellow
const GOLD = /*CLITERAL(Color)*/ {r : 255, g : 203, b : 0, a : 255};        // Gold
const ORANGE = /*CLITERAL(Color)*/ {r : 255, g : 161, b : 0, a : 255};      // Orange
const PINK = /*CLITERAL(Color)*/ {r : 255, g : 109, b : 194, a : 255};      // Pink
const RED = /*CLITERAL(Color)*/ {r : 230, g : 41, b : 55, a : 255};         // Red
const MAROON = /*CLITERAL(Color)*/ {r : 190, g : 33, b : 55, a : 255};      // Maroon
const GREEN = /*CLITERAL(Color)*/ {r : 0, g : 228, b : 48, a : 255};        // Green
const LIME = /*CLITERAL(Color)*/ {r : 0, g : 158, b : 47, a : 255};         // Lime
const DARKGREEN = /*CLITERAL(Color)*/ {r : 0, g : 117, b : 44, a : 255};    // Dark Green
const SKYBLUE = /*CLITERAL(Color)*/ {r : 102, g : 191, b : 255, a : 255};   // Sky Blue
const BLUE = /*CLITERAL(Color)*/ {r : 0, g : 121, b : 241, a : 255};        // Blue
const DARKBLUE = /*CLITERAL(Color)*/ {r : 0, g : 82, b : 172, a : 255};     // Dark Blue
const PURPLE = /*CLITERAL(Color)*/ {r : 200, g : 122, b : 255, a : 255};    // Purple
const VIOLET = /*CLITERAL(Color)*/ {r : 135, g : 60, b : 190, a : 255};     // Violet
const DARKPURPLE = /*CLITERAL(Color)*/ {r : 112, g : 31, b : 126, a : 255}; // Dark Purple
const BEIGE = /*CLITERAL(Color)*/ {r : 211, g : 176, b : 131, a : 255};     // Beige
const BROWN = /*CLITERAL(Color)*/ {r : 127, g : 106, b : 79, a : 255};      // Brown
const DARKBROWN = /*CLITERAL(Color)*/ {r : 76, g : 63, b : 47, a : 255};    // Dark Brown

const WHITE = /*CLITERAL(Color)*/ {r : 255, g : 255, b : 255, a : 255};    // White
const BLACK = /*CLITERAL(Color)*/ {r : 0, g : 0, b : 0, a : 255};          // Black
const BLANK = /*CLITERAL(Color)*/ {r : 0, g : 0, b : 0, a : 0};            // Blank (Transparent)
const MAGENTA = /*CLITERAL(Color)*/ {r : 255, g : 0, b : 255, a : 255};    // Magenta
const RAYWHITE = /*CLITERAL(Color)*/ {r : 245, g : 245, b : 245, a : 255}; // My own White (raylib logo)

function main() {
    // Initialization
    //---------------------------------------------------------
    const screenWidth = 800;
    const screenHeight = 450;

    rl.setConfigFlags(rl.FLAG_MSAA_4X_HINT);
    rl.initWindow(screenWidth, screenHeight, "rl [shapes] example - bouncing ball");

    var ballPosition = new Vector2(rl.getScreenWidth() / 2.0, rl.getScreenHeight() / 2.0);
    var ballSpeed = new Vector2(5.0, 4.0);
    var ballRadius = 20;

    var pause = false;
    var framesCounter = 0;

    rl.setTargetFPS(60); // Set our game to run at 60 frames-per-second
    //----------------------------------------------------------

    // Main game loop
    while(!rl.windowShouldClose()) // Detect window close button or ESC key
    {
        // Update
        //-----------------------------------------------------
        if(rl.isKeyPressed(rl.KEY_SPACE)) pause = !pause;

        if(!pause) {
            ballPosition.x += ballSpeed.x;
            ballPosition.y += ballSpeed.y;

            // Check walls collision for bouncing
            if((ballPosition.x >= (rl.getScreenWidth() - ballRadius)) || (ballPosition.x <= ballRadius)) ballSpeed.x *= -1.0;
            if((ballPosition.y >= (rl.getScreenHeight() - ballRadius)) || (ballPosition.y <= ballRadius)) ballSpeed.y *= -1.0;
        } else framesCounter++;
        //-----------------------------------------------------

        // Draw
        //-----------------------------------------------------
        rl.beginDrawing();

        rl.clearBackground(RAYWHITE);

        rl.drawCircleV(ballPosition, ballRadius, MAROON);
        rl.drawText("PRESS SPACE to PAUSE BALL MOVEMENT", 10, rl.getScreenHeight() - 25, 20, LIGHTGRAY);

        // On pause, we draw a blinking message
        if(pause && ((framesCounter / 30) % 2)) rl.drawText("PAUSED", 350, 200, 30, GRAY);

        rl.drawFPS(10, 10);

        rl.endDrawing();
        //-----------------------------------------------------
    }

    // De-Initialization
    //---------------------------------------------------------
    rl.closeWindow(); // Close window and OpenGL context
    //----------------------------------------------------------

    return 0;
}

main()
