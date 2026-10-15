# Hand Activity Tracker — 3D Computer Vision & Telemetry Studio

A browser-based real-time **Hand Activity & Kinematics Telemetry Studio** powered by **MediaPipe Hands** and HTML5 Canvas.

The application detects, visualizes, and analyzes multi-hand 3D movements in real time directly inside the browser using your webcam, complete with a built-in **3D Hand Skeleton Simulator** for instant testing and calibration.

---

## Features

- **21-Point 3D Hand Skeleton Overlay**:
  - Color-coded anatomical finger bone chains (Thumb: Emerald, Index: Cyan, Middle: Blue, Ring: Purple, Pinky: Magenta, Palm: Amber).
  - Depth-scaled joint nodes reflecting real-time `z`-depth with outer halos.
  - Live distance caliper between thumb and index fingertips with numeric pixel readout.
  - Optional numeric joint ID labels (`0` to `20`).

- **Dynamic Bounding Box & HUD Tagging**:
  - Precision corner brackets for Left & Right hands.
  - Header telemetry badges showing handedness (`LEFT` / `RIGHT`), gesture status, and detection confidence.
  - Real-time hand translation speed (`px/s`).

- **Dual-Hand Kinematic Telemetry**:
  - **Individual Finger Flexion Progress Bars**: 3D joint angle & distance calculation for all 5 fingers (`Thumb`, `Index`, `Middle`, `Ring`, `Pinky`).
  - **Total Hand Openness Index** (`0%` closed fist to `100%` fully extended).
  - **3D Wrist Coordinate Tracking** (`X`, `Y`, `Z`).

- **Gesture & Kinematic Activity Recognition**:
  - Gestures: `🖐️ Open Palm`, `✊ Closed Fist`, `🤏 Precision Pinch`, `👌 OK Sign`, `☝️ Index Point`, `✌️ Peace / V-Sign`, `👍 Thumbs Up`, `👎 Thumbs Down`, `🤘 Rock / Horns`, `3️⃣ Three Fingers`, `4️⃣ Four Fingers`.
  - Dynamic Activities: `Stationary / Resting`, `Poised / Hovering`, `Fine Pinch Hold`, `Pinch & Drag Manipulation`, `Spatial Hand Movement`, `Rapid Swipe / Reach`, `Finger Articulation / Tapping`.

- **3x3 Spatial Reach Heatmap**:
  - Divides viewport into 9 ergonomic work sectors (`UL`, `UC`, `UR`, `ML`, `MC`, `MR`, `LL`, `LC`, `LR`).
  - Accumulates dwell percentage heat in real time and highlights active sectors.

- **Real-Time Kinematic Chart**:
  - Live 60-second scrolling sparkline plotting Left Hand Speed, Right Hand Speed, and Pinch Aperture.

- **Built-in 3D Skeleton Simulator**:
  - Seamlessly switch between **Live Webcam** and **3D Simulator**.
  - Includes 4 procedural scenarios:
    1. *Dual-Hand Ergonomic Workflow*
    2. *Gesture Cycle Showcase*
    3. *High-Velocity Zone Traversal*
    4. *Interactive Mouse / Trackpad Control* (move your cursor over the canvas to control the 3D hand in real time; click to pinch!).

- **Data Export & Reporting**:
  - **CSV Export**: Full timestamped telemetry time-series.
  - **JSON Export**: Complete session summary, zone distributions, and records.
  - **PNG Snapshot**: Instant high-res snapshot of the annotated telemetry canvas.

---

## Quick Start

Webcam access requires a local web server or HTTPS context (`http://localhost:*`):

```bash
cd hand-activity-tracker
python3 -m http.server 8000
```

Open your browser to:
[http://localhost:8000](http://localhost:8000)

1. Click **Live Webcam** to enable real-time tracking with your camera, or keep **3D Simulator** active to test all features instantly.
2. Toggle visualization layers (21-Pt Skeleton, Bounding Boxes, 3x3 Zones, Motion Trails, Velocity Vectors, Pinch Caliper) in the toolbar.
3. Export telemetry data anytime using **Export CSV** or **Export JSON**.
