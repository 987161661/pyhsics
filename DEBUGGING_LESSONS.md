# 🐞 Debugging Post-Mortem: The Case of the Resetting Coordinates

## 📅 Date: 2025-12-08
## 🚩 Issue
User reported that dragging objects in the `PhysicsEditor` did not update their real coordinates, causing them to reset when switching views.

## 🐛 Root Cause
A critical line of code was commented out in `d:\physics\frontend\src\utils\PhysicsEngine.js`:
```javascript
// ...const data = this.sceneData[id]; // <--- The culprit
```
This caused `data` to be undefined, throwing an error (or silently failing depending on try/catch blocks) and preventing the update logic from executing.

## 🧠 Cognitive Traps (Why it took so long)

### 1. Complexity Bias (复杂性偏见)
*   **The Trap:** Assumed the issue was due to complex 3D-to-2D coordinate synchronization or View Mode logic.
*   **The Reality:** It was a basic syntax/reference error.
*   **The Lesson:** Check for basic runtime errors before analyzing architectural complexity.

### 2. Anchoring Effect (锚定效应)
*   **The Trap:** Anchored focus on the UI layer (`PhysicsEditor.jsx`) because that's where the user interaction happened.
*   **The Reality:** The UI sent the correct signal; the Engine dropped the ball.
*   **The Lesson:** Trace data flow across boundaries immediately. Verify the *receiver* gets and processes the data.

### 3. Confirmation Bias (确认偏误)
*   **The Trap:** Found an ID mismatch error (`body.id` vs `sceneId`) and assumed it was the *only* cause.
*   **The Reality:** The ID mismatch was real, but fixing it only revealed the next error (the commented code).
*   **The Lesson:** Do not assume fixing one bug resolves the entire feature. Always verify end-to-end.

### 4. Neglecting Runtime Verification
*   **The Trap:** Relied on reading code (static analysis) where the commented line looked like a harmless comment.
*   **The Reality:** Running a simple test script revealed `ReferenceError: data is not defined` instantly.
*   **The Lesson:** **Fail Fast.** Run reproduction scripts immediately to see actual error logs.

## 🛡️ Prevention Protocol

1.  **Logs First:** Add logs to the entry and exit points of the suspected function immediately.
2.  **Verify Core First:** Verify the Engine/Backend logic works in isolation (via script) before debugging the UI.
3.  **Question Comments:** Treat commented-out code inside function bodies as "suspects" for missing logic.
