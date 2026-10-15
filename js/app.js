/**
 * Hand Activity Tracker - Main Application Controller
 * Orchestrates MediaPipe Hands webcam pipeline, 3D simulation fallback,
 * UI telemetry cards, spatial heatmap, event stream, and session data exports.
 */

import { HandKinematicTracker, ZONE_LABELS } from './hand-geometry.js';
import { HandActivitySimulator, SIMULATION_MODES } from './simulator.js';
import { TelemetryRenderer, KinematicSparklineChart } from './renderer.js';

class HandActivityTrackerApp {
  constructor() {
    this.video = document.getElementById('webcamVideo');
    this.canvas = document.getElementById('outputCanvas');
    this.chartCanvas = document.getElementById('sparklineCanvas');

    // Subsystems
    this.renderer = new TelemetryRenderer(this.canvas, this.video);
    this.chart = new KinematicSparklineChart(this.chartCanvas);
    this.simulator = new HandActivitySimulator();
    this.leftTracker = new HandKinematicTracker('Left');
    this.rightTracker = new HandKinematicTracker('Right');

    // Run-state
    this.mode = 'SIMULATOR'; // 'WEBCAM' | 'SIMULATOR'
    this.cameraInstance = null;
    this.handsDetector = null;
    this.isMediaPipeReady = false;
    this.isTrackingRunning = false;
    this.lastFrameTime = performance.now();
    this.fpsCounter = 0;
    this.fpsTimer = performance.now();
    this.currentFps = 60;
    this.inferenceLatencyMs = 12;

    // Session Metrics
    this.sessionStartTime = performance.now();
    this.activeTimeMs = 0;
    this.idleTimeMs = 0;
    this.peakSpeedPx = 0;
    this.gestureChangeCount = 0;
    this.lastObservedGestures = { Left: null, Right: null };

    // Telemetry log for CSV / JSON export
    this.telemetryRecords = [];
    this.eventLogStream = [];
    this.maxLogItems = 60;

    // Mouse control bindings for simulator
    this.setupMouseControl();
    this.bindUIEvents();
  }

  async init() {
    this.resizeCanvases();
    window.addEventListener('resize', () => this.resizeCanvases());

    // Populate simulation mode dropdown
    this.populateSimulationModes();

    // Check if MediaPipe is available in global scope
    if (typeof window.Hands === 'function') {
      await this.initMediaPipe();
      this.populateCameraDevices();
    } else {
      console.warn('MediaPipe Hands script not detected or blocked; starting in 3D Simulator mode.');
      this.setMode('SIMULATOR');
    }

    // Start render / processing loop
    this.isTrackingRunning = true;
    requestAnimationFrame(t => this.mainLoop(t));
    this.addEventLog('SYSTEM', 'Hand Activity Tracker initialized and operational', '#00f0ff');
  }

  resizeCanvases() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const aspect = 16 / 9;
    let w = rect.width;
    let h = rect.width / aspect;

    if (h > rect.height && rect.height > 200) {
      h = rect.height;
      w = h * aspect;
    }

    this.canvas.width = Math.round(w);
    this.canvas.height = Math.round(h);

    if (this.chartCanvas) {
      this.chartCanvas.width = this.chartCanvas.parentElement.clientWidth || 340;
      this.chartCanvas.height = 72;
    }
  }

  populateSimulationModes() {
    const sel = document.getElementById('simPresetSelect');
    if (!sel) return;
    sel.innerHTML = '';
    for (const [key, info] of Object.entries(SIMULATION_MODES)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = info.label;
      sel.appendChild(opt);
    }
    sel.value = this.simulator.mode;
    sel.addEventListener('change', e => {
      this.simulator.setMode(e.target.value);
      this.addEventLog('SIMULATOR', `Switched to ${SIMULATION_MODES[e.target.value].label}`, '#94a3b8');
    });
  }

  async populateCameraDevices() {
    const select = document.getElementById('cameraSelect');
    if (!select || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      select.innerHTML = '';
      if (videoDevices.length === 0) {
        select.innerHTML = '<option value="">Default Camera</option>';
        return;
      }
      videoDevices.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `Camera ${index + 1}`;
        select.appendChild(option);
      });
    } catch (e) {
      console.warn('Could not enumerate cameras:', e);
    }
  }

  async initMediaPipe() {
    try {
      this.handsDetector = new window.Hands({
        locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });

      this.handsDetector.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.65,
        minTrackingConfidence: 0.65
      });

      this.handsDetector.onResults(results => this.onMediaPipeResults(results));
      this.isMediaPipeReady = true;
      console.log('MediaPipe Hands initialized successfully.');
    } catch (err) {
      console.error('Failed to initialize MediaPipe Hands:', err);
      this.isMediaPipeReady = false;
    }
  }

  async startWebcam(deviceId = null) {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert('Webcam access is not supported by your browser or environment.');
      return;
    }

    try {
      const constraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = stream;
      await this.video.play();

      if (window.Camera && this.handsDetector) {
        if (this.cameraInstance) {
          try { this.cameraInstance.stop(); } catch (_) {}
        }
        this.cameraInstance = new window.Camera(this.video, {
          onFrame: async () => {
            if (this.mode === 'WEBCAM' && this.handsDetector) {
              const t0 = performance.now();
              await this.handsDetector.send({ image: this.video });
              this.inferenceLatencyMs = Math.round(performance.now() - t0);
            }
          },
          width: 1280,
          height: 720
        });
        this.cameraInstance.start();
      }

      this.setMode('WEBCAM');
      this.addEventLog('WEBCAM', 'Webcam stream online at 1280x720', '#10b981');
    } catch (err) {
      console.error('Webcam initialization error:', err);
      alert(`Could not start webcam: ${err.message}. Staying in 3D Simulator mode.`);
      this.setMode('SIMULATOR');
    }
  }

  stopWebcam() {
    if (this.video.srcObject) {
      this.video.srcObject.getTracks().forEach(track => track.stop());
      this.video.srcObject = null;
    }
    if (this.cameraInstance) {
      try { this.cameraInstance.stop(); } catch (_) {}
      this.cameraInstance = null;
    }
  }

  setMode(newMode) {
    this.mode = newMode;
    const badge = document.getElementById('trackingStatusBadge');
    const simControls = document.getElementById('simControlsRow');

    if (newMode === 'WEBCAM') {
      if (badge) {
        badge.textContent = 'LIVE WEBCAM';
        badge.className = 'status-badge live';
      }
      if (simControls) simControls.style.display = 'none';
      document.getElementById('btnStartWebcam')?.classList.add('active');
      document.getElementById('btnStartSimulator')?.classList.remove('active');
    } else {
      if (badge) {
        badge.textContent = '3D SIMULATOR';
        badge.className = 'status-badge sim';
      }
      if (simControls) simControls.style.display = 'flex';
      document.getElementById('btnStartSimulator')?.classList.add('active');
      document.getElementById('btnStartWebcam')?.classList.remove('active');
    }
  }

  setupMouseControl() {
    // Allows interactive positioning in simulator mode
    const handleMove = e => {
      if (this.mode !== 'SIMULATOR' || this.simulator.mode !== 'INTERACTIVE_CURSOR') return;
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      this.simulator.setCursorState(x, y);
    };

    const handleDown = () => {
      if (this.mode === 'SIMULATOR') this.simulator.setCursorState(undefined, undefined, true);
    };

    const handleUp = () => {
      if (this.mode === 'SIMULATOR') this.simulator.setCursorState(undefined, undefined, false);
    };

    this.canvas.addEventListener('mousemove', handleMove);
    this.canvas.addEventListener('mousedown', handleDown);
    window.addEventListener('mouseup', handleUp);

    // Click canvas in simulator to cycle manual gesture preset
    this.canvas.addEventListener('click', () => {
      if (this.mode === 'SIMULATOR' && this.simulator.mode === 'INTERACTIVE_CURSOR') {
        this.simulator.cycleManualPreset();
      }
    });
  }

  /**
   * Main Render & Telemetry Loop
   */
  mainLoop(timestamp) {
    if (!this.isTrackingRunning) return;

    // Calculate FPS
    const dt = timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;
    this.fpsCounter++;
    if (timestamp - this.fpsTimer >= 500) {
      this.currentFps = Math.round((this.fpsCounter * 1000) / (timestamp - this.fpsTimer));
      this.fpsCounter = 0;
      this.fpsTimer = timestamp;
      document.getElementById('fpsValue').textContent = `${this.currentFps} FPS`;
      document.getElementById('latencyValue').textContent = `${this.inferenceLatencyMs} ms`;
    }

    if (this.mode === 'SIMULATOR') {
      const aspect = this.canvas.width / (this.canvas.height || 1);
      const simResults = this.simulator.generateFrame(timestamp, aspect);
      this.processHandsResults(simResults, timestamp, true);
    }

    requestAnimationFrame(t => this.mainLoop(t));
  }

  onMediaPipeResults(results) {
    if (this.mode !== 'WEBCAM') return;
    this.processHandsResults(results, performance.now(), false);
  }

  processHandsResults(results, timestamp, isSimulated) {
    const rawLandmarks = results.multiHandLandmarks || [];
    const rawHandedness = results.multiHandedness || [];
    const processedHands = [];

    // Track active dt
    const frameDtSec = Math.min(0.1, (timestamp - (this.lastProcessTime || timestamp)) / 1000);
    this.lastProcessTime = timestamp;

    for (let i = 0; i < rawLandmarks.length; i++) {
      const landmarks = rawLandmarks[i];
      let handednessLabel = rawHandedness[i]?.label || (i === 0 ? 'Left' : 'Right');

      // Adjust for mirror setting if using webcam
      if (this.renderer.options.mirror && !isSimulated) {
        handednessLabel = handednessLabel === 'Left' ? 'Right' : 'Left';
      }

      const tracker = handednessLabel === 'Left' ? this.leftTracker : this.rightTracker;
      const handData = tracker.update(landmarks, timestamp);
      processedHands.push(handData);

      // Record spatial zone dwell
      this.renderer.recordZoneDwell(handData.zone.code, frameDtSec);

      // Check for gesture state transitions
      this.checkGestureTransition(handData);

      // Track peak speed
      if (handData.speedPxPerSec > this.peakSpeedPx) {
        this.peakSpeedPx = handData.speedPxPerSec;
        document.getElementById('peakSpeedVal').textContent = `${this.peakSpeedPx} px/s`;
      }
    }

    // Update active vs idle session timers
    if (processedHands.length > 0) {
      this.activeTimeMs += frameDtSec * 1000;
    } else {
      this.idleTimeMs += frameDtSec * 1000;
    }

    // Render Canvas
    this.renderer.renderFrame({
      handResults: processedHands,
      isSimulated
    });

    // Update Sparkline Chart
    const leftHand = processedHands.find(h => h.handedness === 'Left');
    const rightHand = processedHands.find(h => h.handedness === 'Right');
    const leftSpeed = leftHand ? leftHand.speedNorm : 0;
    const rightSpeed = rightHand ? rightHand.speedNorm : 0;
    const pinchAperture = rightHand
      ? (1 - Math.min(1, rightHand.gesture.pinchDistNorm || 1))
      : (leftHand ? (1 - Math.min(1, leftHand.gesture.pinchDistNorm || 1)) : 0);

    this.chart.pushSample(leftSpeed, rightSpeed, pinchAperture);
    this.chart.render();

    // Update Telemetry Cards & Session Metrics
    this.updateTelemetryDOM(processedHands);
    this.updateSessionStatsDOM();
    this.updateSpatialHeatmapDOM();

    // Sample telemetry log every ~250ms if active
    if (processedHands.length > 0 && (!this.lastSampleTime || timestamp - this.lastSampleTime >= 250)) {
      this.lastSampleTime = timestamp;
      this.sampleTelemetry(processedHands, timestamp);
    }
  }

  checkGestureTransition(hand) {
    const prev = this.lastObservedGestures[hand.handedness];
    if (prev !== hand.gesture.id) {
      this.lastObservedGestures[hand.handedness] = hand.gesture.id;
      this.gestureChangeCount++;
      document.getElementById('gestureCountVal').textContent = this.gestureChangeCount;

      this.addEventLog(
        hand.handedness.toUpperCase(),
        `${hand.gesture.icon} ${hand.gesture.name} (${hand.activity.name}) in ${hand.zone.code}`,
        hand.handedness === 'Left' ? '#00f0ff' : '#10b981'
      );
    }
  }

  updateTelemetryDOM(hands) {
    const leftHand = hands.find(h => h.handedness === 'Left');
    const rightHand = hands.find(h => h.handedness === 'Right');

    this.updateSingleHandCard('Left', leftHand);
    this.updateSingleHandCard('Right', rightHand);
  }

  updateSingleHandCard(side, hand) {
    const prefix = side.toLowerCase();
    const card = document.getElementById(`${prefix}HandCard`);
    if (!card) return;

    if (!hand) {
      card.classList.add('dimmed');
      document.getElementById(`${prefix}StatusText`).textContent = 'NO HAND DETECTED';
      document.getElementById(`${prefix}GestureBadge`).textContent = '---';
      document.getElementById(`${prefix}ActivityBadge`).textContent = 'Idle';
      return;
    }

    card.classList.remove('dimmed');
    document.getElementById(`${prefix}StatusText`).textContent = 'ACTIVE TRACKING';
    document.getElementById(`${prefix}GestureBadge`).textContent = `${hand.gesture.icon} ${hand.gesture.name}`;
    document.getElementById(`${prefix}ActivityBadge`).textContent = hand.activity.name;
    document.getElementById(`${prefix}ActivityBadge`).style.color = hand.activity.color;

    // Wrist Coordinates
    document.getElementById(`${prefix}CoordX`).textContent = hand.landmarks[0].x.toFixed(2);
    document.getElementById(`${prefix}CoordY`).textContent = hand.landmarks[0].y.toFixed(2);
    document.getElementById(`${prefix}CoordZ`).textContent = (hand.landmarks[0].z || 0).toFixed(2);

    // Speed & Zone
    document.getElementById(`${prefix}SpeedVal`).textContent = `${hand.speedPxPerSec} px/s`;
    document.getElementById(`${prefix}ZoneVal`).textContent = `${hand.zone.code} (${hand.zone.name})`;
    document.getElementById(`${prefix}OpennessVal`).textContent = `${hand.extensions.openness}%`;

    // Finger Extension Bars
    const ext = hand.extensions;
    this.setBarWidth(`${prefix}ThumbBar`, ext.thumb * 100);
    this.setBarWidth(`${prefix}IndexBar`, ext.index * 100);
    this.setBarWidth(`${prefix}MiddleBar`, ext.middle * 100);
    this.setBarWidth(`${prefix}RingBar`, ext.ring * 100);
    this.setBarWidth(`${prefix}PinkyBar`, ext.pinky * 100);
  }

  setBarWidth(id, pct) {
    const bar = document.getElementById(id);
    if (bar) bar.style.width = `${Math.max(4, Math.min(100, pct))}%`;
  }

  updateSessionStatsDOM() {
    const formatTime = ms => {
      const totalSec = Math.floor(ms / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    document.getElementById('activeTimeVal').textContent = formatTime(this.activeTimeMs);
    document.getElementById('idleTimeVal').textContent = formatTime(this.idleTimeMs);

    const totalDistance = Math.round((this.leftTracker.totalDistanceNorm + this.rightTracker.totalDistanceNorm) * 1280);
    document.getElementById('totalDistanceVal').textContent = `${totalDistance} px`;
  }

  updateSpatialHeatmapDOM() {
    const percentages = this.renderer.getZonePercentages();
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const code = ZONE_LABELS[r][c];
        const cell = document.getElementById(`zoneCell_${code}`);
        if (cell) {
          const pct = percentages[code] || 0;
          cell.textContent = `${code} ${pct}%`;
          const intensity = Math.min(1, pct / 35);
          cell.style.backgroundColor = `rgba(0, 240, 255, ${intensity * 0.45})`;
          cell.style.borderColor = pct > 0 ? '#00f0ff' : 'rgba(51, 65, 85, 0.5)';
        }
      }
    }
  }

  addEventLog(source, message, color = '#f8fafc') {
    const timeStr = new Date().toTimeString().split(' ')[0];
    this.eventLogStream.unshift({ time: timeStr, source, message, color });
    if (this.eventLogStream.length > this.maxLogItems) {
      this.eventLogStream.pop();
    }

    const container = document.getElementById('eventLogList');
    if (!container) return;

    container.innerHTML = this.eventLogStream
      .map(
        item => `
        <div class="log-entry">
          <span class="log-time">${item.time}</span>
          <span class="log-source" style="color: ${item.color}">[${item.source}]</span>
          <span class="log-msg">${item.message}</span>
        </div>
      `
      )
      .join('');
  }

  sampleTelemetry(hands, timestamp) {
    for (const h of hands) {
      this.telemetryRecords.push({
        timestamp: new Date().toISOString(),
        relTimeMs: Math.round(timestamp - this.sessionStartTime),
        hand: h.handedness,
        gesture: h.gesture.name,
        activity: h.activity.name,
        speedPxPerSec: h.speedPxPerSec,
        zone: h.zone.code,
        openness: h.extensions.openness,
        wristX: h.landmarks[0].x.toFixed(4),
        wristY: h.landmarks[0].y.toFixed(4),
        wristZ: (h.landmarks[0].z || 0).toFixed(4),
        thumbExt: h.extensions.thumb,
        indexExt: h.extensions.index,
        middleExt: h.extensions.middle,
        ringExt: h.extensions.ring,
        pinkyExt: h.extensions.pinky
      });
    }
  }

  exportCSV() {
    if (this.telemetryRecords.length === 0) {
      alert('No telemetry records captured yet. Allow tracking to run for a few seconds.');
      return;
    }

    const headers = Object.keys(this.telemetryRecords[0]);
    const csvRows = [headers.join(',')];

    for (const row of this.telemetryRecords) {
      const values = headers.map(h => `"${(row[h] ?? '').toString().replace(/"/g, '""')}"`);
      csvRows.push(values.join(','));
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hand-activity-telemetry-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.addEventLog('EXPORT', `Saved ${this.telemetryRecords.length} records to CSV`, '#f59e0b');
  }

  exportJSON() {
    if (this.telemetryRecords.length === 0) {
      alert('No telemetry records captured yet.');
      return;
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      summary: {
        activeTimeMs: Math.round(this.activeTimeMs),
        idleTimeMs: Math.round(this.idleTimeMs),
        peakSpeedPx: this.peakSpeedPx,
        gestureTransitions: this.gestureChangeCount,
        zoneHeatmap: this.renderer.getZonePercentages()
      },
      records: this.telemetryRecords
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hand-activity-session-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.addEventLog('EXPORT', 'Session exported as JSON archive', '#f59e0b');
  }

  captureSnapshot() {
    const dataUrl = this.canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `hand-activity-snapshot-${Date.now()}.png`;
    a.click();
    this.addEventLog('SNAPSHOT', 'Captured PNG snapshot of telemetry viewport', '#a855f7');
  }

  resetSession() {
    this.telemetryRecords = [];
    this.eventLogStream = [];
    this.activeTimeMs = 0;
    this.idleTimeMs = 0;
    this.peakSpeedPx = 0;
    this.gestureChangeCount = 0;
    this.leftTracker = new HandKinematicTracker('Left');
    this.rightTracker = new HandKinematicTracker('Right');
    this.renderer.resetZoneHeatmap();
    this.updateSessionStatsDOM();
    this.updateSpatialHeatmapDOM();
    this.addEventLog('SYSTEM', 'Session statistics and telemetry buffer reset', '#00f0ff');
  }

  bindUIEvents() {
    // Mode toggles
    document.getElementById('btnStartWebcam')?.addEventListener('click', () => {
      const deviceId = document.getElementById('cameraSelect')?.value;
      this.startWebcam(deviceId);
    });

    document.getElementById('btnStartSimulator')?.addEventListener('click', () => {
      this.stopWebcam();
      this.setMode('SIMULATOR');
      this.addEventLog('SYSTEM', 'Switched to 3D Landmark Simulator', '#00f0ff');
    });

    document.getElementById('cameraSelect')?.addEventListener('change', e => {
      if (this.mode === 'WEBCAM') {
        this.startWebcam(e.target.value);
      }
    });

    // Viewport Display Layer Checkboxes
    const layerBindings = [
      ['chkSkeleton', 'showSkeleton'],
      ['chkBBox', 'showBBox'],
      ['chkZones', 'showZones'],
      ['chkTrails', 'showTrails'],
      ['chkVectors', 'showVectors'],
      ['chkPinchCaliper', 'showPinchCaliper'],
      ['chkLandmarkLabels', 'showLandmarkLabels'],
      ['chkMirror', 'mirror'],
      ['chkDimVideo', 'dimVideo']
    ];

    for (const [id, optKey] of layerBindings) {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', e => {
          this.renderer.setOption(optKey, e.target.checked);
        });
      }
    }

    // Action buttons
    document.getElementById('btnExportCSV')?.addEventListener('click', () => this.exportCSV());
    document.getElementById('btnExportJSON')?.addEventListener('click', () => this.exportJSON());
    document.getElementById('btnSnapshot')?.addEventListener('click', () => this.captureSnapshot());
    document.getElementById('btnResetSession')?.addEventListener('click', () => this.resetSession());

    // Fullscreen button
    document.getElementById('btnFullscreen')?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  }
}

// Bootstrap once DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  window.app = new HandActivityTrackerApp();
  window.app.init();
});

export { HandActivityTrackerApp };
