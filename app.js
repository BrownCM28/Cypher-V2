/* ── SENTINEL — DMV Intel Map — Canvas-based Application ──────────── */

(function () {
  'use strict';

  const DATA = window.INTEL_DATA;
  const { nodes, edges, liveFeed, tagColors } = DATA;

  // ── STATE ──────────────────────────────────────────────────────────
  const state = {
    selectedNode: null,
    hoveredNode: null,
    hoveredEdge: null,
    activeTechTags: new Set(['AI', 'cyber', 'defense', 'autonomy', 'space', 'dual-use', 'quantum', 'biotech']),
    activeEntityTypes: new Set(['startup', 'government', 'vc', 'university', 'person']),
    activeSignals: new Set(['funding', 'contract', 'hiring', 'research']),
    timeWindow: 3,
    showEdges: true,
    showPeople: true,
    showLabels: true,
    // Map/viewport
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    isDragging: false,
    dragStart: null,
    feedTimer: null,
    animFrame: null,
  };

  // ── NODE TYPE CONFIG ────────────────────────────────────────────────
  const nodeConfig = {
    startup:    { color: '#e8af34', label: 'STARTUP',    icon: '⚡' },
    government: { color: '#a84b2f', label: 'GOVERNMENT', icon: '🏛' },
    vc:         { color: '#4f98a3', label: 'VENTURE',    icon: '📈' },
    university: { color: '#6daa45', label: 'RESEARCH',   icon: '🔬' },
    person:     { color: '#a86fdf', label: 'OPERATOR',   icon: '👤' },
  };

  const sizeMap = { xl: 22, lg: 17, md: 13, sm: 10 };
  const edgeColors = {
    funding:  '#4f98a3',
    contract: '#e8af34',
    talent:   '#a86fdf',
    research: '#6daa45',
  };

  // ── GEOGRAPHIC PROJECTION ──────────────────────────────────────────
  // Project lat/lng to canvas coordinates
  // DC region bounds: lat 38.7–39.2, lng -77.5–-76.7
  const GEO = {
    minLat: 38.75, maxLat: 39.22,
    minLng: -77.55, maxLng: -76.65,
  };

  function getCanvasDims() {
    const canvas = document.getElementById('main-canvas');
    return { w: canvas.width, h: canvas.height };
  }

  function geoToCanvas(lat, lng) {
    const canvas = document.getElementById('main-canvas');
    const W = canvas.width;
    const H = canvas.height;
    const padding = 60;

    const lngRange = GEO.maxLng - GEO.minLng;
    const latRange = GEO.maxLat - GEO.minLat;

    const rawX = ((lng - GEO.minLng) / lngRange) * (W - padding * 2) + padding;
    const rawY = ((GEO.maxLat - lat) / latRange) * (H - padding * 2) + padding;

    return {
      x: rawX * state.scale + state.offsetX,
      y: rawY * state.scale + state.offsetY,
    };
  }

  function getRawGeoPos(lat, lng) {
    const canvas = document.getElementById('main-canvas');
    const W = canvas.width;
    const H = canvas.height;
    const padding = 60;
    const lngRange = GEO.maxLng - GEO.minLng;
    const latRange = GEO.maxLat - GEO.minLat;
    return {
      x: ((lng - GEO.minLng) / lngRange) * (W - padding * 2) + padding,
      y: ((GEO.maxLat - lat) / latRange) * (H - padding * 2) + padding,
    };
  }

  // ── CANVAS SETUP ───────────────────────────────────────────────────
  let canvas, ctx;
  let pulsePhase = 0;

  function initCanvas() {
    canvas = document.getElementById('main-canvas');
    ctx = canvas.getContext('2d');

    // Size canvas to container
    function resize() {
      const wrap = document.getElementById('map-wrap');
      const dpr = window.devicePixelRatio || 1;
      canvas.width = wrap.clientWidth * dpr;
      canvas.height = wrap.clientHeight * dpr;
      canvas.style.width = wrap.clientWidth + 'px';
      canvas.style.height = wrap.clientHeight + 'px';
      ctx.scale(dpr, dpr);
      // Adjust logical size for drawing
      canvas._logW = wrap.clientWidth;
      canvas._logH = wrap.clientHeight;
      draw();
    }

    resize();
    window.addEventListener('resize', resize);

    // Start animation loop
    function loop() {
      pulsePhase += 0.03;
      draw();
      state.animFrame = requestAnimationFrame(loop);
    }
    loop();
  }

  // ── DRAWING ─────────────────────────────────────────────────────────
  function isDark() {
    return document.documentElement.getAttribute('data-theme') !== 'light';
  }

  function getColors() {
    if (isDark()) {
      return {
        bg: '#0a0c0e',
        bgGrad1: '#0d1018',
        bgGrad2: '#0a0c0e',
        grid: 'rgba(255,255,255,0.025)',
        gridAccent: 'rgba(79,152,163,0.08)',
        river: 'rgba(79,152,163,0.15)',
        region: 'rgba(255,255,255,0.015)',
        regionStroke: 'rgba(255,255,255,0.04)',
        text: '#cdd4dc',
        textMuted: '#6b7a88',
      };
    } else {
      return {
        bg: '#e8ecf0',
        bgGrad1: '#dde4eb',
        bgGrad2: '#e8ecf0',
        grid: 'rgba(0,0,0,0.04)',
        gridAccent: 'rgba(42,125,136,0.1)',
        river: 'rgba(42,125,136,0.2)',
        region: 'rgba(0,0,0,0.015)',
        regionStroke: 'rgba(0,0,0,0.06)',
        text: '#1a2027',
        textMuted: '#5a6878',
      };
    }
  }

  function draw() {
    if (!canvas || !ctx) return;
    const W = canvas._logW || canvas.width;
    const H = canvas._logH || canvas.height;
    const C = getColors();

    // Background
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, C.bgGrad1);
    grad.addColorStop(1, C.bgGrad2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.save();
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    const gridSpacing = 60 * state.scale;
    const startX = state.offsetX % gridSpacing;
    const startY = state.offsetY % gridSpacing;
    for (let x = startX; x < W; x += gridSpacing) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = startY; y < H; y += gridSpacing) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.restore();

    // Draw geographic region labels
    drawRegionLabels(W, H, C);

    // Draw Potomac River (simplified line)
    drawRiver(C);

    // Draw edges first (behind nodes)
    if (state.showEdges) {
      drawEdges();
    }

    // Draw nodes
    drawNodes();
  }

  function drawRegionLabels(W, H, C) {
    ctx.save();
    ctx.font = '600 10px IBM Plex Mono, monospace';
    ctx.letterSpacing = '0.1em';

    const regions = [
      { name: 'WASHINGTON DC', lat: 38.9072, lng: -77.0369, prominent: true },
      { name: 'ARLINGTON', lat: 38.8799, lng: -77.1067, prominent: false },
      { name: 'MCLEAN / LANGLEY', lat: 38.9441, lng: -77.1780, prominent: false },
      { name: 'BETHESDA', lat: 38.9807, lng: -77.1000, prominent: false },
      { name: 'FORT MEADE', lat: 39.1100, lng: -76.7720, prominent: false },
      { name: 'FAIRFAX', lat: 38.8462, lng: -77.3064, prominent: false },
      { name: 'COLLEGE PARK', lat: 38.9897, lng: -76.9378, prominent: false },
    ];

    regions.forEach(r => {
      const pos = geoToCanvas(r.lat, r.lng);
      ctx.fillStyle = r.prominent ? C.gridAccent.replace('0.08', '0.25').replace('0.1', '0.3') : C.grid.replace('0.025', '0.12').replace('0.04', '0.15');
      ctx.textAlign = 'center';
      ctx.font = r.prominent ? '600 11px IBM Plex Mono, monospace' : '400 9px IBM Plex Mono, monospace';
      ctx.fillText(r.name, pos.x, pos.y);
    });

    ctx.restore();
  }

  function drawRiver(C) {
    // Simplified Potomac path across DC area
    const riverPoints = [
      { lat: 38.865, lng: -77.42 },
      { lat: 38.878, lng: -77.37 },
      { lat: 38.888, lng: -77.29 },
      { lat: 38.895, lng: -77.22 },
      { lat: 38.900, lng: -77.12 },
      { lat: 38.875, lng: -77.02 },
      { lat: 38.840, lng: -76.94 },
      { lat: 38.800, lng: -76.88 },
    ];

    ctx.save();
    ctx.strokeStyle = C.river;
    ctx.lineWidth = 6 * state.scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    riverPoints.forEach((p, i) => {
      const pos = geoToCanvas(p.lat, p.lng);
      if (i === 0) ctx.moveTo(pos.x, pos.y);
      else ctx.lineTo(pos.x, pos.y);
    });
    ctx.stroke();

    // Label
    const midPos = geoToCanvas(38.888, -77.18);
    ctx.fillStyle = C.river.replace('0.15', '0.4').replace('0.2', '0.5');
    ctx.font = 'italic 9px IBM Plex Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('POTOMAC RIVER', midPos.x, midPos.y - 10);

    ctx.restore();
  }

  function drawEdges() {
    edges.forEach(edge => {
      // Visibility checks
      const srcNode = nodes.find(n => n.id === edge.source);
      const tgtNode = nodes.find(n => n.id === edge.target);
      if (!srcNode || !tgtNode) return;

      const srcVisible = isNodeVisible(srcNode);
      const tgtVisible = isNodeVisible(tgtNode);
      const signalType = edge.type === 'talent' ? 'hiring' : edge.type;
      const signalVisible = state.activeSignals.has(signalType);

      if (!srcVisible || !tgtVisible || !signalVisible) return;

      const src = geoToCanvas(srcNode.lat, srcNode.lng);
      const tgt = geoToCanvas(tgtNode.lat, tgtNode.lng);

      const isHovered = state.hoveredEdge === edge.id;
      const color = edgeColors[edge.type] || '#888';

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = isHovered ? 2.5 : 1.5;
      ctx.globalAlpha = isHovered ? 0.9 : 0.45;

      if (edge.type === 'talent') {
        ctx.setLineDash([6, 4]);
      }

      // Curved path
      const mx = (src.x + tgt.x) / 2;
      const my = (src.y + tgt.y) / 2;
      const dx = tgt.x - src.x;
      const dy = tgt.y - src.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const offset = Math.min(len * 0.3, 50 * state.scale);
      const nx = len > 0 ? -dy / len : 0;
      const ny = len > 0 ? dx / len : 0;
      const cx = mx + nx * offset;
      const cy = my + ny * offset;

      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.quadraticCurveTo(cx, cy, tgt.x, tgt.y);
      ctx.stroke();

      // Arrow at target
      const t = 0.85;
      const arrowX = (1-t)*(1-t)*src.x + 2*(1-t)*t*cx + t*t*tgt.x;
      const arrowY = (1-t)*(1-t)*src.y + 2*(1-t)*t*cy + t*t*tgt.y;
      const arrowAngle = Math.atan2(tgt.y - arrowY, tgt.x - arrowX);

      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.globalAlpha = isHovered ? 0.9 : 0.55;
      ctx.beginPath();
      const arrowSize = 6 * state.scale;
      ctx.moveTo(tgt.x, tgt.y);
      ctx.lineTo(
        tgt.x - arrowSize * Math.cos(arrowAngle - 0.4),
        tgt.y - arrowSize * Math.sin(arrowAngle - 0.4)
      );
      ctx.lineTo(
        tgt.x - arrowSize * Math.cos(arrowAngle + 0.4),
        tgt.y - arrowSize * Math.sin(arrowAngle + 0.4)
      );
      ctx.closePath();
      ctx.fill();

      ctx.restore();

      // Store edge path for hit testing
      edge._path = { src, tgt, cx, cy };
    });
  }

  function isNodeVisible(node) {
    if (!state.activeEntityTypes.has(node.type)) return false;
    if (node.type === 'person' && !state.showPeople) return false;
    if (!node.tags.some(t => state.activeTechTags.has(t))) return false;
    return true;
  }

  function drawNodes() {
    nodes.forEach(node => {
      if (!isNodeVisible(node)) return;

      const pos = geoToCanvas(node.lat, node.lng);
      const cfg = nodeConfig[node.type];
      const r = sizeMap[node.size] || 13;
      const isSelected = state.selectedNode === node.id;
      const isHovered = state.hoveredNode === node.id;

      ctx.save();

      // Pulse ring for xl nodes or selected
      if (node.size === 'xl' || isSelected) {
        const pulseR = r + 8 + Math.sin(pulsePhase) * 4;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pulseR, 0, Math.PI * 2);
        ctx.strokeStyle = cfg.color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.2 + Math.sin(pulsePhase) * 0.1;
        ctx.stroke();
      }

      // Selection ring
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.8;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r + 7, 0, Math.PI * 2);
        ctx.strokeStyle = cfg.color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.6;
        ctx.stroke();
      }

      // Hover ring
      if (isHovered && !isSelected) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = cfg.color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.5;
        ctx.stroke();
      }

      // Node glow
      const glow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, r * 2.5);
      glow.addColorStop(0, cfg.color + '44');
      glow.addColorStop(1, cfg.color + '00');
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.globalAlpha = 1;
      ctx.fill();

      // Node body
      const bodyGrad = ctx.createRadialGradient(pos.x - r*0.2, pos.y - r*0.2, 0, pos.x, pos.y, r);
      bodyGrad.addColorStop(0, cfg.color + 'dd');
      bodyGrad.addColorStop(1, cfg.color + '88');
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fillStyle = bodyGrad;
      ctx.globalAlpha = 1;
      ctx.fill();

      // Node border
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = cfg.color;
      ctx.lineWidth = isSelected ? 2 : 1.5;
      ctx.globalAlpha = isSelected ? 1 : 0.8;
      ctx.stroke();

      // Node type abbreviation
      const abbrev = node.type === 'startup' ? 'S' : node.type === 'government' ? 'G' : node.type === 'vc' ? 'V' : node.type === 'university' ? 'R' : 'P';
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.9;
      ctx.font = `700 ${Math.round(r * 0.75)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(abbrev, pos.x, pos.y + 0.5);

      // Label
      if (state.showLabels) {
        const labelY = pos.y + r + 10;
        ctx.font = '500 9px IBM Plex Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const textW = ctx.measureText(node.name).width;
        const isDarkMode = isDark();

        // Label background
        ctx.fillStyle = isDarkMode ? 'rgba(10,12,14,0.75)' : 'rgba(240,242,245,0.85)';
        ctx.globalAlpha = 1;
        ctx.fillRect(pos.x - textW/2 - 3, labelY - 1, textW + 6, 12);

        // Label text
        ctx.fillStyle = isDarkMode ? '#cdd4dc' : '#1a2027';
        ctx.globalAlpha = isHovered || isSelected ? 1 : 0.8;
        ctx.fillText(node.name, pos.x, labelY);
      }

      ctx.restore();

      // Store position for hit testing
      node._pos = pos;
      node._r = r;
    });
  }

  // ── HIT TESTING ─────────────────────────────────────────────────────
  function getNodeAtPos(x, y) {
    // Check in reverse order (top nodes first)
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      if (!isNodeVisible(node) || !node._pos) continue;
      const dx = x - node._pos.x;
      const dy = y - node._pos.y;
      const r = (node._r || 13) + 5;
      if (dx * dx + dy * dy <= r * r) return node;
    }
    return null;
  }

  function getEdgeAtPos(x, y) {
    if (!state.showEdges) return null;
    for (const edge of edges) {
      if (!edge._path) continue;
      const signalType = edge.type === 'talent' ? 'hiring' : edge.type;
      if (!state.activeSignals.has(signalType)) continue;
      const { src, tgt, cx, cy } = edge._path;

      // Sample points on bezier curve
      const threshold = 12;
      for (let t = 0; t <= 1; t += 0.05) {
        const bx = (1-t)*(1-t)*src.x + 2*(1-t)*t*cx + t*t*tgt.x;
        const by = (1-t)*(1-t)*src.y + 2*(1-t)*t*cy + t*t*tgt.y;
        if (Math.abs(x - bx) < threshold && Math.abs(y - by) < threshold) {
          return edge;
        }
      }
    }
    return null;
  }

  // ── MOUSE EVENTS ───────────────────────────────────────────────────
  function initMouseEvents() {
    const canvasEl = document.getElementById('main-canvas');

    // Get canvas-relative position
    function getCanvasPos(e) {
      const rect = canvasEl.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    canvasEl.addEventListener('mousemove', (e) => {
      const pos = getCanvasPos(e);

      if (state.isDragging && state.dragStart) {
        const dx = pos.x - state.dragStart.x;
        const dy = pos.y - state.dragStart.y;
        state.offsetX = state.dragStart.offsetX + dx;
        state.offsetY = state.dragStart.offsetY + dy;
        return;
      }

      const hitNode = getNodeAtPos(pos.x, pos.y);
      const hitEdge = !hitNode ? getEdgeAtPos(pos.x, pos.y) : null;

      const prevNode = state.hoveredNode;
      const prevEdge = state.hoveredEdge;

      state.hoveredNode = hitNode ? hitNode.id : null;
      state.hoveredEdge = hitEdge ? hitEdge.id : null;

      if (hitNode) {
        canvasEl.style.cursor = 'pointer';
        showNodeTooltip(e, hitNode);
      } else if (hitEdge) {
        canvasEl.style.cursor = 'pointer';
        showEdgeTooltip(e, hitEdge);
      } else {
        canvasEl.style.cursor = state.isDragging ? 'grabbing' : 'grab';
        hideTooltip();
      }
    });

    canvasEl.addEventListener('mousedown', (e) => {
      const pos = getCanvasPos(e);
      const hitNode = getNodeAtPos(pos.x, pos.y);
      if (!hitNode) {
        state.isDragging = true;
        state.dragStart = { x: pos.x, y: pos.y, offsetX: state.offsetX, offsetY: state.offsetY };
        canvasEl.style.cursor = 'grabbing';
      }
    });

    canvasEl.addEventListener('mouseup', (e) => {
      state.isDragging = false;
      state.dragStart = null;
      canvasEl.style.cursor = 'grab';
    });

    canvasEl.addEventListener('mouseleave', () => {
      state.isDragging = false;
      state.dragStart = null;
      state.hoveredNode = null;
      state.hoveredEdge = null;
      hideTooltip();
    });

    canvasEl.addEventListener('click', (e) => {
      const pos = getCanvasPos(e);
      const hitNode = getNodeAtPos(pos.x, pos.y);
      const hitEdge = !hitNode ? getEdgeAtPos(pos.x, pos.y) : null;

      if (hitNode) {
        selectNode(hitNode.id);
        document.getElementById('edge-detail-popup').style.display = 'none';
      } else if (hitEdge) {
        selectNode(null);
        showEdgeDetailPopup(e, hitEdge);
      } else {
        document.getElementById('edge-detail-popup').style.display = 'none';
        if (state.selectedNode) deselectNode();
      }
    });

    // Wheel zoom
    canvasEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      const pos = getCanvasPos(e);
      const delta = -e.deltaY * 0.001;
      const factor = Math.pow(1.1, delta * 5);

      const newScale = Math.max(0.4, Math.min(4, state.scale * factor));
      const scaleChange = newScale / state.scale;

      // Zoom toward mouse position
      state.offsetX = pos.x - (pos.x - state.offsetX) * scaleChange;
      state.offsetY = pos.y - (pos.y - state.offsetY) * scaleChange;
      state.scale = newScale;
    }, { passive: false });

    // Touch pinch
    let lastTouchDist = 0;
    canvasEl.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDist = Math.sqrt(dx*dx + dy*dy);
      }
    });

    canvasEl.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const factor = dist / lastTouchDist;
        state.scale = Math.max(0.4, Math.min(4, state.scale * factor));
        lastTouchDist = dist;
      }
    }, { passive: false });

    canvasEl.style.cursor = 'grab';
  }

  // ── TOOLTIPS ────────────────────────────────────────────────────────
  function showNodeTooltip(e, node) {
    const tt = document.getElementById('edge-tooltip');
    tt.textContent = node.name + (node.type === 'startup' ? ` — ${node.funding || ''}` : node.type === 'vc' ? ` — ${node.aum || ''}` : node.type === 'government' ? ` — ${node.budget || ''}` : '');
    tt.style.display = 'block';
    const mapRect = document.getElementById('map-wrap').getBoundingClientRect();
    tt.style.left = (e.clientX - mapRect.left + 12) + 'px';
    tt.style.top = (e.clientY - mapRect.top + 12) + 'px';
  }

  function showEdgeTooltip(e, edge) {
    const tt = document.getElementById('edge-tooltip');
    tt.textContent = edge.label;
    tt.style.display = 'block';
    const mapRect = document.getElementById('map-wrap').getBoundingClientRect();
    tt.style.left = (e.clientX - mapRect.left + 12) + 'px';
    tt.style.top = (e.clientY - mapRect.top + 12) + 'px';
  }

  function hideTooltip() {
    document.getElementById('edge-tooltip').style.display = 'none';
  }

  function showEdgeDetailPopup(e, edge) {
    const popup = document.getElementById('edge-detail-popup');
    const srcNode = nodes.find(n => n.id === edge.source);
    const tgtNode = nodes.find(n => n.id === edge.target);

    const typeColors = { funding: 'var(--c-funding)', contract: 'var(--c-contract)', talent: 'var(--c-talent)', research: 'var(--c-university)' };
    const typeLabels = { funding: 'FUNDING', contract: 'CONTRACT', talent: 'TALENT FLOW', research: 'RESEARCH LINK' };
    const col = typeColors[edge.type] || '#888';

    document.getElementById('edge-popup-type').textContent = typeLabels[edge.type] || edge.type.toUpperCase();
    document.getElementById('edge-popup-type').style.cssText = `color: ${col}; border-color: ${col}44; background: ${col}15;`;
    document.getElementById('edge-popup-label').textContent = edge.label;
    document.getElementById('edge-popup-entities').innerHTML = `
      <div class="edge-popup-entity"><span style="color:${col}">▶</span> ${srcNode ? srcNode.name : edge.source}</div>
      <div class="edge-popup-entity"><span style="color:${col}">◀</span> ${tgtNode ? tgtNode.name : edge.target}</div>
    `;
    document.getElementById('edge-popup-date').textContent = edge.date ? `Last updated: ${edge.date}` : '';

    const mapRect = document.getElementById('map-wrap').getBoundingClientRect();
    let x = e.clientX - mapRect.left + 12;
    let y = e.clientY - mapRect.top + 12;
    if (x + 300 > mapRect.width) x -= 310;
    if (y + 150 > mapRect.height) y -= 150;

    popup.style.left = x + 'px';
    popup.style.top = y + 'px';
    popup.style.display = 'block';
  }

  document.getElementById('edge-popup-close').addEventListener('click', () => {
    document.getElementById('edge-detail-popup').style.display = 'none';
  });

  // ── NODE SELECTION & INTEL PANEL ───────────────────────────────────
  function selectNode(nodeId) {
    state.selectedNode = nodeId;

    if (!nodeId) {
      document.getElementById('panel-empty').style.display = 'flex';
      document.getElementById('panel-content').style.display = 'none';
      return;
    }

    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    renderIntelPanel(node);

    // Scroll feed item into view if exists
    const feedItem = document.querySelector(`.feed-item[data-entity="${nodeId}"]`);
    if (feedItem) feedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function deselectNode() {
    state.selectedNode = null;
    document.getElementById('panel-empty').style.display = 'flex';
    document.getElementById('panel-content').style.display = 'none';
  }

  function renderIntelPanel(node) {
    const cfg = nodeConfig[node.type];
    document.getElementById('panel-empty').style.display = 'none';
    const content = document.getElementById('panel-content');
    content.style.display = 'flex';
    content.style.flexDirection = 'column';

    // Type badge
    const badge = document.getElementById('panel-type-badge');
    badge.textContent = cfg.label;
    badge.style.cssText = `color: ${cfg.color}; border-color: ${cfg.color}55; background: ${cfg.color}15; font-family: var(--font-mono); font-size: 8px; letter-spacing: 0.15em; padding: 3px 8px; border-radius: 4px; border: 1px solid;`;

    // Icon
    const iconEl = document.getElementById('panel-entity-icon');
    const typeIcons = { startup: '⚡', government: '🏛', vc: '📈', university: '🔬', person: '👤' };
    iconEl.textContent = typeIcons[node.type] || '●';
    iconEl.style.cssText = `background: ${cfg.color}22; border: 1px solid ${cfg.color}44; width: 36px; height: 36px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 18px;`;

    // Name & role
    document.getElementById('panel-name').textContent = node.name;
    const roleEl = document.getElementById('panel-role');
    if (node.role) roleEl.textContent = node.role;
    else if (node.stage) roleEl.textContent = `Stage: ${node.stage.toUpperCase()} ${node.funding ? '• ' + node.funding : ''}`;
    else if (node.budget) roleEl.textContent = node.budget;
    else if (node.aum) roleEl.textContent = `AUM: ${node.aum}`;
    else roleEl.textContent = '';

    // Tags
    const tagsEl = document.getElementById('panel-tags');
    tagsEl.innerHTML = node.tags.map(t => {
      const c = tagColors[t] || '#888';
      return `<span class="tag-chip" style="color:${c}; border-color:${c}44; background:${c}15">${t.toUpperCase()}</span>`;
    }).join('');

    // Description
    document.getElementById('panel-desc').textContent = node.description || '';

    // Stats
    const statsEl = document.getElementById('panel-stats');
    const statItems = [];
    if (node.funding) statItems.push(['TOTAL RAISED', node.funding]);
    if (node.budget) statItems.push(['BUDGET', node.budget]);
    if (node.aum) statItems.push(['AUM', node.aum]);
    if (node.stage) statItems.push(['STAGE', node.stage.toUpperCase()]);
    if (node.background) statItems.push(['BACKGROUND', node.background.length > 45 ? node.background.substring(0, 45) + '…' : node.background]);

    const connCount = edges.filter(e => e.source === node.id || e.target === node.id).length;
    statItems.push(['CONNECTIONS', connCount.toString()]);
    if (node.type !== 'person') {
      statItems.push(['RECENT SIGNALS', (node.activity || []).length.toString()]);
    }

    statsEl.innerHTML = statItems.slice(0, 4).map(([label, val]) => `
      <div class="stat-card">
        <div class="stat-card-label">${label}</div>
        <div class="stat-card-value">${val}</div>
      </div>
    `).join('');

    // Activity
    const activityEl = document.getElementById('panel-activity');
    if (node.activity && node.activity.length > 0) {
      activityEl.innerHTML = node.activity.map(a => `
        <div class="activity-item">
          <div class="activity-dot ${a.type}"></div>
          <div class="activity-content">
            <div class="activity-date">${a.date}</div>
            <div class="activity-text">${a.text}</div>
          </div>
        </div>
      `).join('');
    } else {
      activityEl.innerHTML = '<div style="font-size:11px; color: var(--text-faint);">No recent activity recorded.</div>';
    }

    // Connections
    const connEl = document.getElementById('panel-connections');
    const nodeEdges = edges.filter(e => e.source === node.id || e.target === node.id);

    if (nodeEdges.length > 0) {
      connEl.innerHTML = nodeEdges.slice(0, 8).map(edge => {
        const otherId = edge.source === node.id ? edge.target : edge.source;
        const otherNode = nodes.find(n => n.id === otherId);
        const col = edgeColors[edge.type] || '#888';
        const typeLabels = { funding: 'FUNDING', contract: 'CONTRACT', talent: 'TALENT', research: 'RESEARCH' };

        return `
          <div class="connection-item" data-target-id="${otherId}">
            <div class="connection-type-dot" style="background:${col}; width:6px; height:6px; border-radius:50%; flex-shrink:0;"></div>
            <span class="connection-name">${otherNode ? otherNode.name : otherId}</span>
            <span class="connection-label">${typeLabels[edge.type] || edge.type.toUpperCase()}</span>
          </div>
        `;
      }).join('');

      connEl.querySelectorAll('.connection-item').forEach(item => {
        item.addEventListener('click', () => {
          const targetId = item.getAttribute('data-target-id');
          if (targetId) selectNode(targetId);
        });
      });
    } else {
      connEl.innerHTML = '<div style="font-size:11px; color: var(--text-faint);">No mapped connections.</div>';
    }

    content.classList.add('panel-animate');
    setTimeout(() => content.classList.remove('panel-animate'), 300);
  }

  document.getElementById('panel-close').addEventListener('click', deselectNode);

  // ── ZOOM CONTROLS ───────────────────────────────────────────────────
  function initZoomControls() {
    const canvasEl = document.getElementById('main-canvas');
    const W = () => canvasEl._logW || canvasEl.width;
    const H = () => canvasEl._logH || canvasEl.height;

    document.getElementById('zoom-in').addEventListener('click', () => {
      const factor = 1.3;
      const cx = W() / 2, cy = H() / 2;
      const newScale = Math.min(4, state.scale * factor);
      const sc = newScale / state.scale;
      state.offsetX = cx - (cx - state.offsetX) * sc;
      state.offsetY = cy - (cy - state.offsetY) * sc;
      state.scale = newScale;
    });

    document.getElementById('zoom-out').addEventListener('click', () => {
      const factor = 1/1.3;
      const cx = W() / 2, cy = H() / 2;
      const newScale = Math.max(0.4, state.scale * factor);
      const sc = newScale / state.scale;
      state.offsetX = cx - (cx - state.offsetX) * sc;
      state.offsetY = cy - (cy - state.offsetY) * sc;
      state.scale = newScale;
    });

    document.getElementById('reset-view').addEventListener('click', () => {
      state.scale = 1;
      state.offsetX = 0;
      state.offsetY = 0;
    });
  }

  // ── LIVE FEED ──────────────────────────────────────────────────────
  function renderFeed(items) {
    const feedEl = document.getElementById('feed-list');
    feedEl.innerHTML = items.map(item => `
      <div class="feed-item" data-entity="${item.entity}">
        <div class="feed-type-dot ${item.type}"></div>
        <div class="feed-content">
          <div class="feed-time">${item.time}</div>
          <div class="feed-text">${item.text}</div>
        </div>
      </div>
    `).join('');

    feedEl.querySelectorAll('.feed-item').forEach(el => {
      el.addEventListener('click', () => {
        const entityId = el.getAttribute('data-entity');
        if (entityId) {
          selectNode(entityId);
          // Pan to entity
          const node = nodes.find(n => n.id === entityId);
          if (node) {
            const canvasEl = document.getElementById('main-canvas');
            const W = canvasEl._logW || canvasEl.width;
            const H = canvasEl._logH || canvasEl.height;
            const raw = getRawGeoPos(node.lat, node.lng);
            state.offsetX = W/2 - raw.x * state.scale;
            state.offsetY = H/2 - raw.y * state.scale;
          }
        }
      });
    });
  }

  function startFeedSimulation() {
    renderFeed(liveFeed);

    let feedIndex = 0;
    const feedRotation = [
      { id: 'n1', time: 'just now', type: 'contract', text: 'DARPA BAA update: AI-assisted ISR — solicitation closes in 14 days', entity: 'darpa' },
      { id: 'n2', time: 'just now', type: 'hiring', text: 'Anduril opens 3 senior roles in Arlington — TS/SCI required', entity: 'anduril' },
      { id: 'n3', time: 'just now', type: 'funding', text: 'Paladin Capital closes new $90M growth round in zero-trust startup', entity: 'paladin' },
      { id: 'n4', time: 'just now', type: 'research', text: 'Georgetown CSET publishes AI export control analysis cited in Senate', entity: 'georgetown' },
    ];

    state.feedTimer = setInterval(() => {
      const newItem = { ...feedRotation[feedIndex % feedRotation.length], time: 'just now' };
      feedIndex++;
      renderFeed([newItem, ...liveFeed.slice(0, 14)]);
      const signalEl = document.getElementById('stat-signals');
      if (signalEl) signalEl.textContent = parseInt(signalEl.textContent) + 1;
    }, 12000);
  }

  // ── FILTER CONTROLS ────────────────────────────────────────────────
  function initFilters() {
    document.querySelectorAll('.tag-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.getAttribute('data-tag');
        btn.classList.toggle('active');
        if (state.activeTechTags.has(tag)) state.activeTechTags.delete(tag);
        else state.activeTechTags.add(tag);
      });
    });

    document.querySelectorAll('.entity-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-entity');
        btn.classList.toggle('active');
        if (state.activeEntityTypes.has(type)) state.activeEntityTypes.delete(type);
        else state.activeEntityTypes.add(type);
      });
    });

    document.querySelectorAll('.signal-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        const signal = btn.getAttribute('data-signal');
        btn.classList.toggle('active');
        if (state.activeSignals.has(signal)) state.activeSignals.delete(signal);
        else state.activeSignals.add(signal);
      });
    });

    document.getElementById('time-slider').addEventListener('input', (e) => {
      state.timeWindow = parseInt(e.target.value);
    });

    document.getElementById('toggle-edges').addEventListener('change', (e) => {
      state.showEdges = e.target.checked;
    });

    document.getElementById('toggle-people').addEventListener('change', (e) => {
      state.showPeople = e.target.checked;
      const badge = document.getElementById('people-badge');
      badge.classList.toggle('visible', e.target.checked);
    });

    document.getElementById('toggle-labels').addEventListener('change', (e) => {
      state.showLabels = e.target.checked;
    });
  }

  // ── THEME ─────────────────────────────────────────────────────────
  function initTheme() {
    const btn = document.getElementById('theme-toggle');
    function updateIcon() {
      const dark = isDark();
      btn.innerHTML = dark ? '<i class="ph ph-moon"></i>' : '<i class="ph ph-sun"></i>';
    }
    updateIcon();
    btn.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      updateIcon();
    });
  }

  // ── FULLSCREEN (disabled in sandboxed iframe) ─────────────────────
  const fsBtn = document.getElementById('fullscreen-btn');
  if (fsBtn) { fsBtn.style.display = 'none'; }

  // ── KEYBOARD ─────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      deselectNode();
      document.getElementById('edge-detail-popup').style.display = 'none';
    }
  });

  // ── LEGEND ──────────────────────────────────────────────────────────
  function initLegend() {
    const mapWrap = document.getElementById('map-wrap');
    const legend = document.createElement('div');
    legend.className = 'map-legend';
    legend.innerHTML = `
      <div class="legend-title">LEGEND</div>
      <div class="legend-item"><div class="legend-dot" style="background: var(--c-startup)"></div>Startup</div>
      <div class="legend-item"><div class="legend-dot" style="background: var(--c-government)"></div>Government</div>
      <div class="legend-item"><div class="legend-dot" style="background: var(--c-vc)"></div>Venture Capital</div>
      <div class="legend-item"><div class="legend-dot" style="background: var(--c-university)"></div>Research Lab</div>
      <div class="legend-item"><div class="legend-dot" style="background: var(--c-person)"></div>Operator</div>
      <div style="height:1px; background:var(--border); margin:6px 0;"></div>
      <div class="legend-item"><div class="legend-line" style="background: var(--c-funding)"></div>Funding</div>
      <div class="legend-item"><div class="legend-line" style="background: var(--c-contract)"></div>Contract</div>
      <div class="legend-item"><div class="legend-line" style="background: var(--c-talent); border-top: 2px dashed var(--c-talent); background: transparent; height:2px;"></div>Talent Flow</div>
      <div class="legend-item"><div class="legend-line" style="background: var(--c-university)"></div>Research</div>
    `;
    mapWrap.appendChild(legend);
  }

  // ── INIT ──────────────────────────────────────────────────────────
  function init() {
    initTheme();
    initFilters();
    initZoomControls();
    initCanvas();
    initMouseEvents();
    initLegend();
    startFeedSimulation();

    // Show people badge initially
    document.getElementById('people-badge').classList.add('visible');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
