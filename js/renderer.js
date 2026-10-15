/**
 * Studio-Grade High-FPS Canvas Renderer
 * Renders 21-point 3D hand skeletons, bounding boxes, spatial zone heatmaps,
 * velocity vectors, motion trails, and pinch caliper diagnostics.
 */

import { FINGER_CHAINS, PALM_CONNECTIONS, ZONE_LABELS, ZONE_NAMES } from './hand-geometry.js';

// Color themes per hand
export const HAND_THEMES = {
  Left: {
    primary: '#00f0ff',
    primaryAlpha: 'rgba(0, 240, 255, 0.25)',
    glow: 'rgba(0, 240, 255, 0.75)',
    boxBg: 'rgba(2, 20, 36, 0.82)',
    boxBorder: '#00f0ff',
    badgeBg: '#0284c7',
    badgeText: '#e0f2fe',
    tag: 'LEFT'
  },
  Right: {
    primary: '#10b981',
    primaryAlpha: 'rgba(16, 185, 129, 0.25)',
    glow: 'rgba(16, 185, 129, 0.75)',
    boxBg: 'rgba(2, 32, 22, 0.82)',
    boxBorder: '#10b981',
    badgeBg: '#059669',
    badgeText: '#d1fae5',
    tag: 'RIGHT'
  }
};

// Anatomical finger bone colors
export const FINGER_COLORS = {
  thumb:  '#22c55e', // Green
  index:  '#06b6d4', // Cyan
  middle: '#3b82f6', // Blue
  ring:   '#a855f7', // Purple
  pinky:  '#ec4899', // Pink
  palm:   '#f59e0b'  // Amber
};

export class TelemetryRenderer {
  constructor(canvas, videoElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.video = videoElement;

    // Viewport layers & display options
    this.options = {
      mirror: true,
      showSkeleton: true,
      showBBox: true,
      showZones: true,
      showTrails: true,
      showVectors: true,
      showPinchCaliper: true,
      showLandmarkLabels: false,
      videoOpacity: 0.88,
      dimVideo: false
    };

    // Zone dwell accumulation for spatial heatmap
    this.zoneDwell = {
      UL: 0, UC: 0, UR: 0,
      ML: 0, MC: 0, MR: 0,
      LL: 0, LC: 0, LR: 0
    };
    this.totalDwell = 0;
  }

  setOption(key, value) {
    if (key in this.options) {
      this.options[key] = value;
    }
  }

  resetZoneHeatmap() {
    for (const k of Object.keys(this.zoneDwell)) {
      this.zoneDwell[k] = 0;
    }
    this.totalDwell = 0;
  }

  recordZoneDwell(zoneCode, dt = 1) {
    if (zoneCode in this.zoneDwell) {
      this.zoneDwell[zoneCode] += dt;
      this.totalDwell += dt;
    }
  }

  getZonePercentages() {
    const total = Math.max(1e-4, this.totalDwell);
    const result = {};
    for (const [k, v] of Object.entries(this.zoneDwell)) {
      result[k] = Math.round((v / total) * 100);
    }
    return result;
  }

  /**
   * Main render loop invocation
   */
  renderFrame({ handResults = [], isSimulated = false }) {
    const { canvas, ctx } = this;
    const w = canvas.width;
    const h = canvas.height;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // 1. Draw Video / Background Layer
    if (this.video && this.video.readyState >= 2 && !isSimulated) {
      ctx.save();
      if (this.options.mirror) {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.globalAlpha = this.options.videoOpacity;
      if (this.options.dimVideo) {
        ctx.filter = 'brightness(0.55) contrast(1.15)';
      }
      ctx.drawImage(this.video, 0, 0, w, h);
      ctx.restore();
    } else {
      // Dark cyber-grid studio backdrop for simulator or camera standby
      this.renderBackdrop(w, h, isSimulated);
    }

    // 2. Spatial 3x3 Reach Zones Overlay
    if (this.options.showZones) {
      this.renderZones(w, h, handResults);
    }

    // 3. Motion Trails
    if (this.options.showTrails) {
      for (const hand of handResults) {
        this.renderTrails(w, h, hand);
      }
    }

    // 4. 21-point 3D Skeleton & Calipers
    for (const hand of handResults) {
      const theme = HAND_THEMES[hand.handedness] || HAND_THEMES.Right;

      if (this.options.showSkeleton) {
        this.renderSkeleton(w, h, hand, theme);
      }

      if (this.options.showPinchCaliper) {
        this.renderPinchCaliper(w, h, hand, theme);
      }

      if (this.options.showVectors) {
        this.renderVelocityVector(w, h, hand, theme);
      }

      if (this.options.showBBox) {
        this.renderBoundingBox(w, h, hand, theme);
      }
    }

    // 5. Watermark / Camera Status overlay
    this.renderTelemetryHUD(w, h, handResults.length, isSimulated);

    ctx.restore();
  }

  renderBackdrop(w, h, isSimulated) {
    const { ctx } = this;
    // Dark radial gradient
    const grad = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, Math.max(w, h) * 0.75);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(1, '#020617');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.35)';
    ctx.lineWidth = 1;
    const step = 48;
    ctx.beginPath();
    for (let x = 0; x < w; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0; y < h; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    if (isSimulated) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.18)';
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillText('SYNTHETIC 3D SKELETON SIMULATOR MODE ACTIVE', 18, h - 22);
    }
  }

  renderZones(w, h, handResults) {
    const { ctx } = this;
    const colW = w / 3;
    const rowH = h / 3;

    // Get active zones in current frame
    const activeZones = new Set(handResults.map(h => h.zone.code));
    const percentages = this.getZonePercentages();

    ctx.save();
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const code = ZONE_LABELS[r][c];
        const isActive = activeZones.has(code);
        const pct = percentages[code] || 0;
        const x = c * colW;
        const y = r * rowH;

        // Dwell heat fill
        if (pct > 0 || isActive) {
          const heatAlpha = Math.min(0.25, (pct / 100) * 0.4 + (isActive ? 0.08 : 0));
          ctx.fillStyle = isActive ? `rgba(0, 240, 255, ${heatAlpha + 0.08})` : `rgba(59, 130, 246, ${heatAlpha})`;
          ctx.fillRect(x + 2, y + 2, colW - 4, rowH - 4);
        }

        // Zone borders
        ctx.strokeStyle = isActive ? 'rgba(0, 240, 255, 0.45)' : 'rgba(100, 116, 139, 0.18)';
        ctx.lineWidth = isActive ? 1.5 : 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x + 1, y + 1, colW - 2, rowH - 2);
        ctx.setLineDash([]);

        // Zone Badge
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillStyle = isActive ? '#00f0ff' : 'rgba(148, 163, 184, 0.65)';
        ctx.fillText(`${code} • ${pct}%`, x + 8, y + 16);
      }
    }
    ctx.restore();
  }

  renderTrails(w, h, hand) {
    const { ctx } = this;
    const theme = HAND_THEMES[hand.handedness] || HAND_THEMES.Right;

    // 1. Palm velocity trail
    if (hand.trail && hand.trail.length > 2) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 1; i < hand.trail.length; i++) {
        const p0 = hand.trail[i - 1];
        const p1 = hand.trail[i];
        const alpha = (i / hand.trail.length) * 0.45;
        const thickness = 2 + (i / hand.trail.length) * 3.5;

        ctx.strokeStyle = theme.primary;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = thickness;
        ctx.beginPath();
        ctx.moveTo(p0.x * w, p0.y * h);
        ctx.lineTo(p1.x * w, p1.y * h);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2. Index fingertip precision trail
    if (hand.indexTrail && hand.indexTrail.length > 2) {
      ctx.save();
      for (let i = 1; i < hand.indexTrail.length; i++) {
        const p0 = hand.indexTrail[i - 1];
        const p1 = hand.indexTrail[i];
        const alpha = (i / hand.indexTrail.length) * 0.75;
        ctx.strokeStyle = p1.pinched ? '#f59e0b' : '#38bdf8';
        ctx.globalAlpha = alpha;
        ctx.lineWidth = p1.pinched ? 3 : 1.5;
        ctx.beginPath();
        ctx.moveTo(p0.x * w, p0.y * h);
        ctx.lineTo(p1.x * w, p1.y * h);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  renderSkeleton(w, h, hand, theme) {
    const { ctx } = this;
    const lms = hand.landmarks;

    ctx.save();

    // 1. Draw Palm connections
    ctx.strokeStyle = FINGER_COLORS.palm;
    ctx.lineWidth = 2.8;
    ctx.shadowBlur = 8;
    ctx.shadowColor = FINGER_COLORS.palm;
    ctx.beginPath();
    for (const [a, b] of PALM_CONNECTIONS) {
      ctx.moveTo(lms[a].x * w, lms[a].y * h);
      ctx.lineTo(lms[b].x * w, lms[b].y * h);
    }
    ctx.stroke();

    // 2. Draw Finger Chains
    for (const [finger, chain] of Object.entries(FINGER_CHAINS)) {
      const color = FINGER_COLORS[finger];
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 9;
      ctx.lineWidth = 3.2;

      ctx.beginPath();
      for (let i = 0; i < chain.length - 1; i++) {
        const idxA = chain[i];
        const idxB = chain[i + 1];
        ctx.moveTo(lms[idxA].x * w, lms[idxA].y * h);
        ctx.lineTo(lms[idxB].x * w, lms[idxB].y * h);
      }
      ctx.stroke();
    }

    // 3. Draw 21 Landmark Nodes with 3D Depth scaling
    ctx.shadowBlur = 0;
    for (let i = 0; i < lms.length; i++) {
      const lm = lms[i];
      const px = lm.x * w;
      const py = lm.y * h;
      const z = lm.z || 0;

      // Base radius scaled by z depth (closer = larger)
      const baseR = Math.max(3.2, Math.min(8.5, 5.0 - z * 24));
      const isTip = [4, 8, 12, 16, 20].includes(i);
      const isWrist = i === 0;

      // Outer glow ring for fingertips and wrist
      if (isTip || isWrist) {
        ctx.strokeStyle = isWrist ? theme.primary : '#ffffff';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(px, py, baseR + 3.2, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Joint core circle
      ctx.fillStyle = isTip ? '#ffffff' : theme.primary;
      ctx.beginPath();
      ctx.arc(px, py, baseR, 0, Math.PI * 2);
      ctx.fill();

      // Inner dot
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(px, py, Math.max(1.5, baseR * 0.42), 0, Math.PI * 2);
      ctx.fill();

      // Optional landmark index number
      if (this.options.showLandmarkLabels) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '8px ui-monospace, monospace';
        ctx.fillText(i.toString(), px + baseR + 2, py - 2);
      }
    }

    ctx.restore();
  }

  renderPinchCaliper(w, h, hand, theme) {
    const { ctx } = this;
    const lms = hand.landmarks;
    const thumbTip = lms[4];
    const indexTip = lms[8];
    const dx = thumbTip.x - indexTip.x;
    const dy = thumbTip.y - indexTip.y;
    const pixelDist = Math.hypot(dx * w, dy * h);
    const midX = ((thumbTip.x + indexTip.x) / 2) * w;
    const midY = ((thumbTip.y + indexTip.y) / 2) * h;
    const isPinched = hand.gesture.id === 'PINCH' || hand.gesture.id === 'OK_SIGN';

    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = isPinched ? '#f59e0b' : 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = isPinched ? 2.5 : 1.5;

    ctx.beginPath();
    ctx.moveTo(thumbTip.x * w, thumbTip.y * h);
    ctx.lineTo(indexTip.x * w, indexTip.y * h);
    ctx.stroke();
    ctx.setLineDash([]);

    // Caliper distance tag pill
    const tagText = `${Math.round(pixelDist)}px`;
    ctx.font = '10px ui-monospace, monospace';
    const tagW = ctx.measureText(tagText).width + 10;
    ctx.fillStyle = isPinched ? 'rgba(245, 158, 11, 0.92)' : 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = isPinched ? '#fde047' : 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.roundRect(midX - tagW / 2, midY - 9, tagW, 16, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isPinched ? '#000000' : '#e2e8f0';
    ctx.fillText(tagText, midX - tagW / 2 + 5, midY + 3);
    ctx.restore();
  }

  renderVelocityVector(w, h, hand, theme) {
    const { ctx } = this;
    const pc = hand.palmCenter;
    const v = hand.velocityVec;
    const speed = hand.speedNorm;

    if (speed < 0.08) return;

    const startX = pc.x * w;
    const startY = pc.y * h;
    const scale = 55; // Pixels per normalized unit velocity
    const endX = startX + v.vx * scale;
    const endY = startY + v.vy * scale;

    ctx.save();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Arrowhead
    const angle = Math.atan2(endY - startY, endX - startX);
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - 8 * Math.cos(angle - Math.PI / 6), endY - 8 * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(endX - 8 * Math.cos(angle + Math.PI / 6), endY - 8 * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  renderBoundingBox(w, h, hand, theme) {
    const { ctx } = this;
    const { minX, minY, width, height } = hand.bbox;
    const bx = minX * w;
    const by = minY * h;
    const bw = width * w;
    const bh = height * h;
    const corner = Math.min(24, Math.min(bw, bh) * 0.28);

    ctx.save();

    // Subtle background tint inside bounding box
    ctx.fillStyle = theme.primaryAlpha;
    ctx.fillRect(bx, by, bw, bh);

    // Corner brackets
    ctx.strokeStyle = theme.boxBorder;
    ctx.lineWidth = 2.5;

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(bx, by + corner);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx + corner, by);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(bx + bw - corner, by);
    ctx.lineTo(bx + bw, by);
    ctx.lineTo(bx + bw, by + corner);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(bx, by + bh - corner);
    ctx.lineTo(bx, by + bh);
    ctx.lineTo(bx + corner, by + bh);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(bx + bw - corner, by + bh);
    ctx.lineTo(bx + bw, by + bh);
    ctx.lineTo(bx + bw, by + bh - corner);
    ctx.stroke();

    // Telemetry Header Card above/inside bounding box
    const cardY = Math.max(14, by - 36);
    const badgeText = `${theme.tag} HAND`;
    const gestureText = `${hand.gesture.icon} ${hand.gesture.name}`;
    const activityText = `${hand.activity.name}`;
    const speedText = `${hand.speedPxPerSec} px/s`;

    ctx.font = 'bold 11px system-ui, sans-serif';
    const tagW = ctx.measureText(badgeText).width + 12;

    ctx.font = '11px system-ui, sans-serif';
    const gestW = ctx.measureText(gestureText).width + 12;
    const totalW = Math.max(bw, tagW + gestW + 8);

    // Header bar background
    ctx.fillStyle = theme.boxBg;
    ctx.strokeStyle = theme.boxBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx, cardY, totalW, 30, 4);
    ctx.fill();
    ctx.stroke();

    // Handedness pill
    ctx.fillStyle = theme.badgeBg;
    ctx.beginPath();
    ctx.roundRect(bx + 4, cardY + 5, tagW, 20, 3);
    ctx.fill();
    ctx.fillStyle = theme.badgeText;
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillText(badgeText, bx + 10, cardY + 19);

    // Gesture Name
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText(gestureText, bx + tagW + 10, cardY + 19);

    // Sub-bar with Activity State and Speed
    const subY = by + bh + 4;
    if (subY + 22 < h) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.35)';
      ctx.beginPath();
      ctx.roundRect(bx, subY, bw, 20, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = hand.activity.color;
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(`• ${activityText}`, bx + 6, subY + 14);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px ui-monospace, monospace';
      const speedW = ctx.measureText(speedText).width;
      ctx.fillText(speedText, bx + bw - speedW - 6, subY + 14);
    }

    ctx.restore();
  }

  renderTelemetryHUD(w, h, handCount, isSimulated) {
    const { ctx } = this;
    ctx.save();
    // Top-left live status indicator
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(14, 14, 185, 28, 6);
    ctx.fill();
    ctx.stroke();

    // Glowing status dot
    const statusColor = handCount > 0 ? '#10b981' : (isSimulated ? '#00f0ff' : '#f59e0b');
    ctx.fillStyle = statusColor;
    ctx.shadowColor = statusColor;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(26, 28, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#f8fafc';
    ctx.font = '600 11px system-ui, sans-serif';
    const statusMsg = handCount > 0
      ? `TRACKING (${handCount} HAND${handCount > 1 ? 'S' : ''})`
      : (isSimulated ? 'SIMULATOR ACTIVE' : 'LOOKING FOR HANDS');
    ctx.fillText(statusMsg, 38, 32);

    ctx.restore();
  }
}

/**
 * 60-Second Real-Time Kinematic Chart Canvas
 */
export class KinematicSparklineChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.historyLength = 90;
    this.leftSpeedHistory = new Array(this.historyLength).fill(0);
    this.rightSpeedHistory = new Array(this.historyLength).fill(0);
    this.pinchDistHistory = new Array(this.historyLength).fill(0);
  }

  pushSample(leftSpeed = 0, rightSpeed = 0, pinchDist = 0) {
    this.leftSpeedHistory.shift();
    this.leftSpeedHistory.push(leftSpeed);

    this.rightSpeedHistory.shift();
    this.rightSpeedHistory.push(rightSpeed);

    this.pinchDistHistory.shift();
    this.pinchDistHistory.push(pinchDist);
  }

  render() {
    const { canvas, ctx } = this;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Background & grid
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5);
    ctx.lineTo(w, h * 0.5);
    ctx.moveTo(0, h * 0.25);
    ctx.lineTo(w, h * 0.25);
    ctx.moveTo(0, h * 0.75);
    ctx.lineTo(w, h * 0.75);
    ctx.stroke();

    const maxSpeed = 1.6; // normalized speed ceiling

    // Draw Left Hand Speed (Cyan)
    this.drawLine(this.leftSpeedHistory, maxSpeed, '#00f0ff', 'rgba(0, 240, 255, 0.12)', w, h);

    // Draw Right Hand Speed (Emerald)
    this.drawLine(this.rightSpeedHistory, maxSpeed, '#10b981', 'rgba(16, 185, 129, 0.12)', w, h);

    // Draw Pinch Proximity (Gold dashed)
    this.drawPinchLine(this.pinchDistHistory, '#f59e0b', w, h);
  }

  drawLine(data, maxVal, strokeColor, fillColor, w, h) {
    const { ctx } = this;
    const n = data.length;
    const dx = w / (n - 1);

    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < n; i++) {
      const val = Math.min(maxVal, data[i]);
      const x = i * dx;
      const y = h - (val / maxVal) * (h - 8) - 4;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Area fill
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.restore();
  }

  drawPinchLine(data, strokeColor, w, h) {
    const { ctx } = this;
    const n = data.length;
    const dx = w / (n - 1);

    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.setLineDash([2, 3]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();

    for (let i = 0; i < n; i++) {
      const val = Math.max(0, Math.min(1, data[i]));
      const x = i * dx;
      const y = h - val * (h - 8) - 4;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

