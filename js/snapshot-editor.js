/**
 * snapshot-editor.js — Snapshot grid, lightbox, and annotation editor module
 * WAZA KIMURA BJJ Video Library
 *
 * Manages:
 *  1. Snapshot grid rendering in VPanel
 *  2. Image compression on import
 *  3. Lightbox with slideshow
 *  4. Full annotation editor (select, pen, circle, arrow, rect, text, eraser, crop, rotate)
 *  5. Drag & drop reordering
 */

import { putSnapshot, getSnapshot, getSnapshotsByVideo, deleteSnapshot, syncSnapshotsFromCloud } from './snapshot-db.js';

// ════════════════════════════════════════════════════════════════
// ── Module State
// ════════════════════════════════════════════════════════════════

let currentVideoId = null;
let snapshots = [];        // [{id, videoId, blob, url, memo, annotations, order}]
let containerEl = null;    // Reference to the VPanel container element
let lbIdx = 0;             // Lightbox current index
let annIdx = -1;           // Annotation editor current snapshot index

// Annotation editor state
let annCtx = null;
let annImg = null;
let annTool = 'select';
let annColor = '#e74c3c';
let annWidth = 2;
let annFontSize = 20;
let annotations = [];
let redoStack = [];
let drawing = false;
let eraserRemovedStack = [];
let currentAnnotation = null;
let annScaleX = 1;
let annScaleY = 1;

// Selection state
let selectedIdx = null;
let selDragging = false;
let selDragStart = null;
let selOrigPos = null;
let editingTextIdx = null;

// Long-press color state
let colorLongPressTimer = null;
let colorLongPressTarget = null;

// Crop state
let cropActive = false;
let cropRect = { x: 0, y: 0, w: 0, h: 0 };
let cropDragging = null;
let cropStart = { x: 0, y: 0 };
let cropOrigRect = null;

// Drag & drop state
let dragSrcIdx = null;

// Double-click tracking for select mode
let lastClickTime = 0;
let lastClickIdx = null;

// Swipe state for lightbox
let swipeStartX = 0;

// Track whether event listeners have been bound
let globalListenersBound = false;

// ════════════════════════════════════════════════════════════════
// ── DOM Element Helpers (lazy-cached)
// ════════════════════════════════════════════════════════════════

function $(id) { return document.getElementById(id); }

function getLightbox()      { return $('snap-lightbox'); }
function getLbImg()         { return $('snap-lb-img'); }
function getLbCounter()     { return $('snap-lb-counter'); }
function getLbMemo()        { return $('snap-lb-memo'); }
function getAnnEditor()     { return $('snap-ann-editor'); }
function getAnnCanvas()     { return $('snap-ann-canvas'); }
function getAnnCanvasWrap() { return $('snap-ann-canvas-wrap'); }
function getAnnTextInput()  { return $('snap-ann-text-input'); }
function getAnnColorPopup() { return $('snap-ann-color-popup'); }
function getAnnColorPicker(){ return $('snap-ann-color-picker'); }
function getAnnFontsizeWrap() { return $('snap-ann-fontsize-wrap'); }
function getAnnDelSelBtn()  { return $('snap-ann-del-sel'); }
function getCropActionsEl() { return $('snap-crop-actions'); }
function getCropConfirmBtn(){ return $('snap-crop-confirm'); }
function getCropCancelBtn() { return $('snap-crop-cancel'); }
function getFileInput()     { return $('snap-file-input'); }

// ════════════════════════════════════════════════════════════════
// ── Utility Functions
// ════════════════════════════════════════════════════════════════

function generateId() {
  return 'snap_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / 1048576).toFixed(1) + 'MB';
}

// ════════════════════════════════════════════════════════════════
// ── Compression
// ════════════════════════════════════════════════════════════════

function getCompressionSettings() {
  const snapSettings = JSON.parse(localStorage.getItem('wk_snap_settings') || '{}');
  const maxRes = snapSettings.maxRes || 1280;
  const quality = (snapSettings.quality || 60) / 100;
  return { maxRes, quality };
}

function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const { maxRes, quality } = getCompressionSettings();
        let w = img.width, h = img.height;
        if (w > maxRes || h > maxRes) {
          if (w > h) { h = Math.round(h * maxRes / w); w = maxRes; }
          else { w = Math.round(w * maxRes / h); h = maxRes; }
        }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        c.toBlob((blob) => {
          resolve(blob);
        }, 'image/jpeg', quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ════════════════════════════════════════════════════════════════
// ── Video Data Sync Helper
// ════════════════════════════════════════════════════════════════

function syncVideoRefs() {
  const v = (window.videos || []).find(x => x.id === currentVideoId);
  if (v) {
    v.snapshots = snapshots.map((s, i) => ({ id: s.id, memo: s.memo || '', order: i }));
    window.debounceSave?.();
  }
}

// ════════════════════════════════════════════════════════════════
// ── Grid Rendering
// ════════════════════════════════════════════════════════════════

function renderGrid() {
  if (!containerEl) return;
  const grid = containerEl.querySelector('.snap-grid');
  if (!grid) return;
  const addBtn = grid.querySelector('.snap-add');

  // Remove existing thumbnails
  grid.querySelectorAll('.snap-thumb').forEach(el => el.remove());

  snapshots.forEach((snap, i) => {
    const div = document.createElement('div');
    div.className = 'snap-thumb';
    div.dataset.idx = i;

    const img = document.createElement('img');
    img.src = snap.url;
    div.appendChild(img);

    const idx = document.createElement('span');
    idx.className = 'snap-index';
    idx.textContent = i + 1;
    div.appendChild(idx);

    const del = document.createElement('button');
    del.className = 'del-btn';
    del.textContent = '\u00d7';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSnap(i);
    });
    div.appendChild(del);

    // Reorder buttons (mobile-friendly)
    if (snapshots.length > 1) {
      const reorderWrap = document.createElement('div');
      reorderWrap.className = 'snap-reorder';
      if (i > 0) {
        const leftBtn = document.createElement('button');
        leftBtn.textContent = '\u25C0';
        leftBtn.addEventListener('click', (e) => { e.stopPropagation(); moveSnap(i, i - 1); });
        leftBtn.addEventListener('touchstart', (e) => { e.stopPropagation(); }, { passive: true });
        reorderWrap.appendChild(leftBtn);
      }
      if (i < snapshots.length - 1) {
        const rightBtn = document.createElement('button');
        rightBtn.textContent = '\u25B6';
        rightBtn.addEventListener('click', (e) => { e.stopPropagation(); moveSnap(i, i + 1); });
        rightBtn.addEventListener('touchstart', (e) => { e.stopPropagation(); }, { passive: true });
        reorderWrap.appendChild(rightBtn);
      }
      div.appendChild(reorderWrap);
    }

    // Click -> lightbox
    div.addEventListener('click', () => openLightbox(i));

    // Desktop drag: only enable draggable after mouse moves ≥8px (prevent accidental reorder on click)
    let mdownX = 0, mdownY = 0, dragArmed = false;
    div.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      mdownX = e.clientX; mdownY = e.clientY;
      dragArmed = false;
      div.draggable = false;
    });
    div.addEventListener('mousemove', (e) => {
      if (dragArmed || div.draggable) return;
      const dx = e.clientX - mdownX, dy = e.clientY - mdownY;
      if (Math.sqrt(dx*dx + dy*dy) >= 8) {
        dragArmed = true;
        div.draggable = true;
      }
    });
    div.addEventListener('mouseup', () => { div.draggable = false; dragArmed = false; });
    div.addEventListener('dragstart', onDragStart);
    div.addEventListener('dragover', onDragOver);
    div.addEventListener('dragenter', onDragEnter);
    div.addEventListener('dragleave', onDragLeave);
    div.addEventListener('drop', onDrop);
    div.addEventListener('dragend', onDragEnd);

    // Prevent native long-press context menu on thumbnails
    div.addEventListener('contextmenu', (e) => e.preventDefault());

    // Touch drag (long-press 300ms → clone follows finger)
    let touchTimer = null;
    let touchActive = false;
    let touchClone = null;
    let touchStartX = 0, touchStartY = 0;

    div.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      touchTimer = setTimeout(() => {
        touchActive = true;
        div.classList.add('dragging');
        // Create floating clone
        touchClone = div.cloneNode(true);
        touchClone.className = 'snap-touch-ghost';
        const rect = div.getBoundingClientRect();
        touchClone.style.cssText = `position:fixed;z-index:9999;width:${rect.width}px;height:${rect.height}px;pointer-events:none;opacity:.85;border-radius:6px;overflow:hidden;border:2px solid var(--accent);box-shadow:0 4px 16px rgba(0,0,0,.3);transform:scale(1.1);left:${t.clientX - rect.width/2}px;top:${t.clientY - rect.height/2}px;transition:none;`;
        document.body.appendChild(touchClone);
        // Vibrate if supported
        if (navigator.vibrate) navigator.vibrate(30);
      }, 300);
    }, { passive: true });

    div.addEventListener('touchmove', (e) => {
      if (!touchActive) {
        // Cancel if finger moved too far before long-press
        const t = e.touches[0];
        const dx = t.clientX - touchStartX, dy = t.clientY - touchStartY;
        if (Math.sqrt(dx*dx + dy*dy) > 10) clearTimeout(touchTimer);
        return;
      }
      e.preventDefault();
      const touch = e.touches[0];
      // Move clone to follow finger
      if (touchClone) {
        const w = parseInt(touchClone.style.width);
        const h = parseInt(touchClone.style.height);
        touchClone.style.left = (touch.clientX - w/2) + 'px';
        touchClone.style.top = (touch.clientY - h/2) + 'px';
      }
      // Highlight drop target
      grid.querySelectorAll('.snap-thumb').forEach(t => t.classList.remove('drag-over'));
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      const thumb = target?.closest('.snap-thumb');
      if (thumb && thumb !== div) thumb.classList.add('drag-over');
    }, { passive: false });

    div.addEventListener('touchend', (e) => {
      clearTimeout(touchTimer);
      if (touchClone) { touchClone.remove(); touchClone = null; }
      if (!touchActive) return;
      touchActive = false;
      div.classList.remove('dragging');
      grid.querySelectorAll('.snap-thumb').forEach(t => t.classList.remove('drag-over'));
      const touch = e.changedTouches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      const thumb = target?.closest('.snap-thumb');
      if (thumb && thumb !== div) {
        const fromIdx = parseInt(div.dataset.idx);
        const toIdx = parseInt(thumb.dataset.idx);
        const [item] = snapshots.splice(fromIdx, 1);
        snapshots.splice(toIdx, 0, item);
        renderGrid();
        syncVideoRefs();
      }
    });

    div.addEventListener('touchcancel', () => {
      clearTimeout(touchTimer);
      if (touchClone) { touchClone.remove(); touchClone = null; }
      touchActive = false;
      div.classList.remove('dragging');
      grid.querySelectorAll('.snap-thumb').forEach(t => t.classList.remove('drag-over'));
    });

    if (addBtn) {
      grid.insertBefore(div, addBtn);
    } else {
      grid.appendChild(div);
    }
  });

  // Update count
  const countEl = containerEl.querySelector('.snap-count');
  if (countEl) countEl.textContent = snapshots.length + '枚';
}

// ════════════════════════════════════════════════════════════════
// ── Move Snap (button-based reorder, mobile-friendly)
// ════════════════════════════════════════════════════════════════

function moveSnap(fromIdx, toIdx) {
  if (fromIdx < 0 || toIdx < 0 || fromIdx >= snapshots.length || toIdx >= snapshots.length) return;
  const [item] = snapshots.splice(fromIdx, 1);
  snapshots.splice(toIdx, 0, item);
  renderGrid();
  syncVideoRefs();
}

// ════════════════════════════════════════════════════════════════
// ── Drag & Drop (desktop)
// ════════════════════════════════════════════════════════════════

function onDragStart(e) {
  dragSrcIdx = parseInt(e.currentTarget.dataset.idx);
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}
function onDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function onDragEnter(e) { e.currentTarget.classList.add('drag-over'); }
function onDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
function onDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const targetIdx = parseInt(e.currentTarget.dataset.idx);
  if (dragSrcIdx !== null && dragSrcIdx !== targetIdx) {
    const [item] = snapshots.splice(dragSrcIdx, 1);
    snapshots.splice(targetIdx, 0, item);
    renderGrid();
    syncVideoRefs();
  }
}
function onDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  e.currentTarget.draggable = false;
  dragSrcIdx = null;
}

// ════════════════════════════════════════════════════════════════
// ── Delete Snapshot
// ════════════════════════════════════════════════════════════════

async function deleteSnap(idx) {
  const snap = snapshots[idx];
  if (!snap) return;
  URL.revokeObjectURL(snap.url);
  snapshots.splice(idx, 1);

  // Remove from IndexedDB
  try {
    await deleteSnapshot(snap.id);
  } catch (err) {
    console.error('[snapshot-editor] deleteSnapshot failed:', err);
  }

  renderGrid();
  syncVideoRefs();
}

// ════════════════════════════════════════════════════════════════
// ── Lightbox
// ════════════════════════════════════════════════════════════════

function openLightbox(idx) {
  if (!snapshots.length) return;
  lbIdx = idx;
  updateLightbox();
  const lb = getLightbox();
  if (lb) lb.classList.add('active');
}

function closeLightbox() {
  const lb = getLightbox();
  if (lb) lb.classList.remove('active');
}

function updateLightbox() {
  if (!snapshots[lbIdx]) return;
  const lbImg = getLbImg();
  const lbCounter = getLbCounter();
  const lbMemo = getLbMemo();
  if (lbImg) lbImg.src = snapshots[lbIdx].url;
  if (lbCounter) lbCounter.textContent = (lbIdx + 1) + ' / ' + snapshots.length;
  if (lbMemo) lbMemo.value = snapshots[lbIdx].memo || '';
}

function lbPrevSlide() {
  if (!snapshots.length) return;
  lbIdx = (lbIdx - 1 + snapshots.length) % snapshots.length;
  updateLightbox();
}

function lbNextSlide() {
  if (!snapshots.length) return;
  lbIdx = (lbIdx + 1) % snapshots.length;
  updateLightbox();
}

// ════════════════════════════════════════════════════════════════
// ── Annotation Editor — Drawing
// ════════════════════════════════════════════════════════════════

function drawAnnotation(ctx, a) {
  ctx.save();
  ctx.strokeStyle = a.color;
  ctx.fillStyle = a.color;
  ctx.lineWidth = a.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (a.type) {
    case 'pen':
      if (!a.points || a.points.length < 2) break;
      ctx.beginPath();
      ctx.moveTo(a.points[0].x, a.points[0].y);
      for (let i = 1; i < a.points.length; i++) ctx.lineTo(a.points[i].x, a.points[i].y);
      ctx.stroke();
      break;
    case 'circle':
      if (a.rx == null || (a.rx === 0 && a.ry === 0)) break;
      ctx.beginPath();
      ctx.ellipse(a.cx, a.cy, Math.abs(a.rx), Math.abs(a.ry), 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'arrow': {
      const dx = a.x2 - a.x1, dy = a.y2 - a.y1;
      const angle = Math.atan2(dy, dx);
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 2) break;
      const headLen = Math.min(len * 0.3, 20 + a.width * 2);
      ctx.beginPath();
      ctx.moveTo(a.x1, a.y1);
      ctx.lineTo(a.x2, a.y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(a.x2, a.y2);
      ctx.lineTo(a.x2 - headLen * Math.cos(angle - 0.4), a.y2 - headLen * Math.sin(angle - 0.4));
      ctx.moveTo(a.x2, a.y2);
      ctx.lineTo(a.x2 - headLen * Math.cos(angle + 0.4), a.y2 - headLen * Math.sin(angle + 0.4));
      ctx.stroke();
      break;
    }
    case 'rect':
      if (a.w === 0 && a.h === 0) break;
      ctx.strokeRect(a.x, a.y, a.w, a.h);
      break;
    case 'text':
      if (!a.text) break;
      const fs = a.fontSize || Math.max(16, a.width * 6);
      ctx.font = `bold ${fs}px 'DM Sans', sans-serif`;
      const lines = a.text.split('\n');
      const lh = fs * 1.3;
      lines.forEach((line, i) => {
        ctx.fillText(line, a.x, a.y + i * lh);
      });
      break;
  }
  ctx.restore();
}

// ════════════════════════════════════════════════════════════════
// ── Bounding Box / Hit Testing
// ════════════════════════════════════════════════════════════════

function getAnnotationBBox(a) {
  const pad = 6;
  const canvas = getAnnCanvas();
  switch (a.type) {
    case 'pen': {
      if (!a.points || !a.points.length) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of a.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      return { x: minX - pad, y: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 };
    }
    case 'circle': {
      const rx = Math.abs(a.rx || 0), ry = Math.abs(a.ry || 0);
      return { x: a.cx - rx - pad, y: a.cy - ry - pad, w: rx * 2 + pad * 2, h: ry * 2 + pad * 2 };
    }
    case 'arrow': {
      const minX = Math.min(a.x1, a.x2), minY = Math.min(a.y1, a.y2);
      const maxX = Math.max(a.x1, a.x2), maxY = Math.max(a.y1, a.y2);
      return { x: minX - pad, y: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 };
    }
    case 'rect': {
      const x = a.w >= 0 ? a.x : a.x + a.w;
      const y = a.h >= 0 ? a.y : a.y + a.h;
      const w = Math.abs(a.w);
      const h = Math.abs(a.h);
      return { x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2 };
    }
    case 'text': {
      if (!a.text) return null;
      const fs = a.fontSize || Math.max(16, a.width * 6);
      if (annCtx) {
        annCtx.save();
        annCtx.font = `bold ${fs}px 'DM Sans', sans-serif`;
        const m = annCtx.measureText(a.text);
        annCtx.restore();
        const tw = m.width;
        const th = fs;
        return { x: a.x - pad, y: a.y - th - pad, w: tw + pad * 2, h: th + pad * 2 };
      }
      return { x: a.x - pad, y: a.y - 20 - pad, w: 100 + pad * 2, h: 24 + pad * 2 };
    }
  }
  return null;
}

function getAnnotationBBoxFromObj(a) {
  switch (a.type) {
    case 'pen': {
      if (!a.points || !a.points.length) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of a.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    case 'circle': {
      const rx = Math.abs(a.rx || 0), ry = Math.abs(a.ry || 0);
      return { x: a.cx - rx, y: a.cy - ry, w: rx * 2, h: ry * 2 };
    }
    case 'arrow': {
      const minX = Math.min(a.x1, a.x2), minY = Math.min(a.y1, a.y2);
      return { x: minX, y: minY, w: Math.abs(a.x2 - a.x1), h: Math.abs(a.y2 - a.y1) };
    }
    case 'rect': {
      const x = a.w >= 0 ? a.x : a.x + a.w;
      const y = a.h >= 0 ? a.y : a.y + a.h;
      return { x, y, w: Math.abs(a.w), h: Math.abs(a.h) };
    }
    case 'text': {
      return { x: a.x, y: a.y - 20, w: 100, h: 24 };
    }
  }
  return null;
}

function drawSelectionBox(ctx, a) {
  const bb = getAnnotationBBox(a);
  if (!bb) return;
  ctx.save();
  ctx.strokeStyle = '#00bfff';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(bb.x, bb.y, bb.w, bb.h);
  ctx.restore();
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function hitTestAnnotation(a, px, py) {
  const tol = 10 + (a.width || 2);
  switch (a.type) {
    case 'pen': {
      if (!a.points || a.points.length < 2) return false;
      for (let i = 1; i < a.points.length; i++) {
        if (distToSegment(px, py, a.points[i - 1].x, a.points[i - 1].y, a.points[i].x, a.points[i].y) < tol) return true;
      }
      return false;
    }
    case 'circle': {
      const rx = Math.abs(a.rx || 0), ry = Math.abs(a.ry || 0);
      if (rx === 0 && ry === 0) return false;
      const nx = (px - a.cx) / (rx || 1);
      const ny = (py - a.cy) / (ry || 1);
      const d = Math.sqrt(nx * nx + ny * ny);
      const avgR = (rx + ry) / 2;
      return Math.abs(d - 1) * avgR < tol;
    }
    case 'arrow':
      return distToSegment(px, py, a.x1, a.y1, a.x2, a.y2) < tol;
    case 'rect': {
      const x = a.w >= 0 ? a.x : a.x + a.w;
      const y = a.h >= 0 ? a.y : a.y + a.h;
      const w = Math.abs(a.w), h = Math.abs(a.h);
      const d1 = distToSegment(px, py, x, y, x + w, y);
      const d2 = distToSegment(px, py, x + w, y, x + w, y + h);
      const d3 = distToSegment(px, py, x + w, y + h, x, y + h);
      const d4 = distToSegment(px, py, x, y + h, x, y);
      return Math.min(d1, d2, d3, d4) < tol;
    }
    case 'text': {
      const bb = getAnnotationBBox(a);
      if (!bb) return false;
      return px >= bb.x && px <= bb.x + bb.w && py >= bb.y && py <= bb.y + bb.h;
    }
  }
  return false;
}

function hitTestAll(px, py) {
  for (let i = annotations.length - 1; i >= 0; i--) {
    if (hitTestAnnotation(annotations[i], px, py)) return i;
  }
  return null;
}

// ════════════════════════════════════════════════════════════════
// ── Selection UI
// ════════════════════════════════════════════════════════════════

function updateSelectionUI() {
  const delBtn = getAnnDelSelBtn();
  if (delBtn) {
    if (selectedIdx !== null) {
      delBtn.classList.add('visible');
    } else {
      delBtn.classList.remove('visible');
    }
  }
  updateFontsizeVisibility();
}

function updateFontsizeVisibility() {
  const wrap = getAnnFontsizeWrap();
  if (!wrap) return;
  const textToolActive = annTool === 'text';
  const textSelected = selectedIdx !== null && annotations[selectedIdx] && annotations[selectedIdx].type === 'text';
  if (textToolActive || textSelected) {
    wrap.classList.add('visible');
    const fs = textSelected ? (annotations[selectedIdx].fontSize || 20) : annFontSize;
    wrap.querySelectorAll('.ann-fontsize-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.fs) === fs);
    });
  } else {
    wrap.classList.remove('visible');
  }
}

function deselect() {
  selectedIdx = null;
  selDragging = false;
  editingTextIdx = null;
  updateSelectionUI();
  renderAnnotations();
}

function moveAnnotation(a, dx, dy) {
  switch (a.type) {
    case 'pen':
      if (a.points) a.points.forEach(p => { p.x += dx; p.y += dy; });
      break;
    case 'circle':
      a.cx += dx; a.cy += dy;
      break;
    case 'arrow':
      a.x1 += dx; a.y1 += dy; a.x2 += dx; a.y2 += dy;
      break;
    case 'rect':
      a.x += dx; a.y += dy;
      break;
    case 'text':
      a.x += dx; a.y += dy;
      break;
  }
}

// ════════════════════════════════════════════════════════════════
// ── Annotation Editor — Canvas Management
// ════════════════════════════════════════════════════════════════

function resizeAnnCanvas() {
  if (!annImg) return;
  const canvas = getAnnCanvas();
  const wrap = getAnnCanvasWrap();
  if (!canvas || !wrap) return;
  const maxW = wrap.clientWidth - 20;
  const maxH = wrap.clientHeight - 20;
  let w = annImg.naturalWidth, h = annImg.naturalHeight;
  const scale = Math.min(maxW / w, maxH / h, 1);
  const dispW = Math.round(w * scale);
  const dispH = Math.round(h * scale);
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = dispW + 'px';
  canvas.style.height = dispH + 'px';
  annScaleX = w / dispW;
  annScaleY = h / dispH;
}

function renderAnnotations() {
  if (!annImg) return;
  const canvas = getAnnCanvas();
  if (!canvas || !annCtx) return;
  annCtx.clearRect(0, 0, canvas.width, canvas.height);
  annCtx.drawImage(annImg, 0, 0);
  annotations.forEach((a, i) => {
    drawAnnotation(annCtx, a);
    if (i === selectedIdx) drawSelectionBox(annCtx, a);
  });
  if (currentAnnotation) drawAnnotation(annCtx, currentAnnotation);

  // Render crop overlay if active
  if (cropActive && cropRect.w !== 0 && cropRect.h !== 0) {
    renderCropOverlay(annCtx);
  }
}

// ════════════════════════════════════════════════════════════════
// ── Crop Rendering & Logic
// ════════════════════════════════════════════════════════════════

function normalizeCropRect() {
  let { x, y, w, h } = cropRect;
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
  return { x, y, w, h };
}

function renderCropOverlay(ctx) {
  const canvas = getAnnCanvas();
  if (!canvas) return;
  const nr = normalizeCropRect();

  // Dark overlay
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Clear the crop area
  ctx.clearRect(nr.x, nr.y, nr.w, nr.h);
  // Re-draw in crop area
  ctx.beginPath();
  ctx.rect(nr.x, nr.y, nr.w, nr.h);
  ctx.clip();
  ctx.drawImage(annImg, 0, 0);
  annotations.forEach(a => drawAnnotation(ctx, a));
  ctx.restore();

  // Dashed border
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(nr.x, nr.y, nr.w, nr.h);
  ctx.setLineDash([]);
  ctx.restore();

  // Corner handles
  drawCropHandle(ctx, nr.x, nr.y);
  drawCropHandle(ctx, nr.x + nr.w, nr.y);
  drawCropHandle(ctx, nr.x, nr.y + nr.h);
  drawCropHandle(ctx, nr.x + nr.w, nr.y + nr.h);

  // Edge midpoint handles
  drawCropHandle(ctx, nr.x + nr.w / 2, nr.y);
  drawCropHandle(ctx, nr.x + nr.w / 2, nr.y + nr.h);
  drawCropHandle(ctx, nr.x, nr.y + nr.h / 2);
  drawCropHandle(ctx, nr.x + nr.w, nr.y + nr.h / 2);

  positionCropActions(nr);
}

function drawCropHandle(ctx, cx, cy) {
  const s = 4;
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 3;
  ctx.fillRect(cx - s, cy - s, s * 2, s * 2);
  ctx.restore();
}

function positionCropActions(nr) {
  const canvas = getAnnCanvas();
  const wrap = getAnnCanvasWrap();
  const cropEl = getCropActionsEl();
  if (!canvas || !wrap || !cropEl) return;

  const canvasRect = canvas.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  const screenX = nr.x / annScaleX + (canvasRect.left - wrapRect.left) + nr.w / (2 * annScaleX);
  const screenY = (nr.y + nr.h) / annScaleY + (canvasRect.top - wrapRect.top) + 8;
  cropEl.style.display = 'flex';
  cropEl.style.left = screenX + 'px';
  cropEl.style.top = screenY + 'px';
  cropEl.style.transform = 'translateX(-50%)';
}

function getCropHandleAt(px, py) {
  const nr = normalizeCropRect();
  const tol = 12;

  if (Math.abs(px - nr.x) < tol && Math.abs(py - nr.y) < tol) return 'nw';
  if (Math.abs(px - (nr.x + nr.w)) < tol && Math.abs(py - nr.y) < tol) return 'ne';
  if (Math.abs(px - nr.x) < tol && Math.abs(py - (nr.y + nr.h)) < tol) return 'sw';
  if (Math.abs(px - (nr.x + nr.w)) < tol && Math.abs(py - (nr.y + nr.h)) < tol) return 'se';

  if (Math.abs(py - nr.y) < tol && px > nr.x + tol && px < nr.x + nr.w - tol) return 'n';
  if (Math.abs(py - (nr.y + nr.h)) < tol && px > nr.x + tol && px < nr.x + nr.w - tol) return 's';
  if (Math.abs(px - nr.x) < tol && py > nr.y + tol && py < nr.y + nr.h - tol) return 'w';
  if (Math.abs(px - (nr.x + nr.w)) < tol && py > nr.y + tol && py < nr.y + nr.h - tol) return 'e';

  if (px >= nr.x && px <= nr.x + nr.w && py >= nr.y && py <= nr.y + nr.h) return 'move';

  return null;
}

function applyCrop() {
  const canvas = getAnnCanvas();
  if (!canvas) return;
  const nr = normalizeCropRect();
  if (nr.w < 2 || nr.h < 2) { exitCropMode(); return; }

  const cx = Math.max(0, Math.round(nr.x));
  const cy = Math.max(0, Math.round(nr.y));
  const cw = Math.min(Math.round(nr.w), canvas.width - cx);
  const ch = Math.min(Math.round(nr.h), canvas.height - cy);
  if (cw < 2 || ch < 2) { exitCropMode(); return; }

  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext('2d');
  ctx.drawImage(annImg, cx, cy, cw, ch, 0, 0, cw, ch);

  // Transform annotations
  const newAnnotations = [];
  for (const a of annotations) {
    const shifted = JSON.parse(JSON.stringify(a));
    switch (shifted.type) {
      case 'pen':
        if (shifted.points) {
          shifted.points = shifted.points.map(p => ({ x: p.x - cx, y: p.y - cy }));
        }
        break;
      case 'circle':
        shifted.cx -= cx;
        shifted.cy -= cy;
        break;
      case 'arrow':
        shifted.x1 -= cx; shifted.y1 -= cy;
        shifted.x2 -= cx; shifted.y2 -= cy;
        break;
      case 'rect':
        shifted.x -= cx;
        shifted.y -= cy;
        break;
      case 'text':
        shifted.x -= cx;
        shifted.y -= cy;
        break;
    }

    const bb = getAnnotationBBoxFromObj(shifted);
    if (bb && bb.x + bb.w > 0 && bb.y + bb.h > 0 && bb.x < cw && bb.y < ch) {
      newAnnotations.push(shifted);
    }
  }
  annotations = newAnnotations;
  redoStack = [];

  const dataUrl = c.toDataURL('image/png');
  const newImg = new Image();
  newImg.onload = () => {
    annImg = newImg;
    exitCropMode();
    resizeAnnCanvas();
    renderAnnotations();
  };
  newImg.src = dataUrl;
}

function exitCropMode() {
  cropActive = false;
  cropDragging = null;
  cropRect = { x: 0, y: 0, w: 0, h: 0 };
  const cropEl = getCropActionsEl();
  if (cropEl) cropEl.style.display = 'none';

  annTool = 'select';
  const editor = getAnnEditor();
  if (editor) {
    editor.querySelectorAll('.ann-tool[data-tool]').forEach(b => b.classList.remove('active'));
    const selectBtn = editor.querySelector('.ann-tool[data-tool="select"]');
    if (selectBtn) selectBtn.classList.add('active');
  }
  updateFontsizeVisibility();
}

// ════════════════════════════════════════════════════════════════
// ── Rotate Logic
// ════════════════════════════════════════════════════════════════

function rotateImage(clockwise) {
  if (!annImg) return;
  const origW = annImg.naturalWidth || annImg.width;
  const origH = annImg.naturalHeight || annImg.height;

  const c = document.createElement('canvas');
  c.width = origH;
  c.height = origW;
  const ctx = c.getContext('2d');

  ctx.save();
  if (clockwise) {
    ctx.translate(origH, 0);
    ctx.rotate(Math.PI / 2);
  } else {
    ctx.translate(0, origW);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(annImg, 0, 0);
  ctx.restore();

  annotations.forEach(a => {
    if (clockwise) {
      rotateAnnotation90CW(a, origW, origH);
    } else {
      rotateAnnotation90CCW(a, origW, origH);
    }
  });
  redoStack = [];

  const dataUrl = c.toDataURL('image/png');
  const newImg = new Image();
  newImg.onload = () => {
    annImg = newImg;
    resizeAnnCanvas();
    renderAnnotations();
  };
  newImg.src = dataUrl;
}

function rotateAnnotation90CW(a, origW, origH) {
  switch (a.type) {
    case 'pen':
      if (a.points) {
        a.points = a.points.map(p => ({ x: origH - p.y, y: p.x }));
      }
      break;
    case 'circle': {
      const newCx = origH - a.cy;
      const newCy = a.cx;
      a.cx = newCx;
      a.cy = newCy;
      const tmpRx = a.rx, tmpRy = a.ry;
      a.rx = -tmpRy;
      a.ry = tmpRx;
      break;
    }
    case 'arrow': {
      const nx1 = origH - a.y1, ny1 = a.x1;
      const nx2 = origH - a.y2, ny2 = a.x2;
      a.x1 = nx1; a.y1 = ny1;
      a.x2 = nx2; a.y2 = ny2;
      break;
    }
    case 'rect': {
      const nx = origH - a.y - a.h;
      const ny = a.x;
      const nw = a.h;
      const nh = a.w;
      a.x = nx; a.y = ny; a.w = nw; a.h = nh;
      break;
    }
    case 'text': {
      const ntx = origH - a.y;
      const nty = a.x;
      a.x = ntx; a.y = nty;
      break;
    }
  }
}

function rotateAnnotation90CCW(a, origW, origH) {
  switch (a.type) {
    case 'pen':
      if (a.points) {
        a.points = a.points.map(p => ({ x: p.y, y: origW - p.x }));
      }
      break;
    case 'circle': {
      const newCx = a.cy;
      const newCy = origW - a.cx;
      a.cx = newCx;
      a.cy = newCy;
      const tmpRx = a.rx, tmpRy = a.ry;
      a.rx = tmpRy;
      a.ry = -tmpRx;
      break;
    }
    case 'arrow': {
      const nx1 = a.y1, ny1 = origW - a.x1;
      const nx2 = a.y2, ny2 = origW - a.x2;
      a.x1 = nx1; a.y1 = ny1;
      a.x2 = nx2; a.y2 = ny2;
      break;
    }
    case 'rect': {
      const nx = a.y;
      const ny = origW - a.x - a.w;
      const nw = a.h;
      const nh = a.w;
      a.x = nx; a.y = ny; a.w = nw; a.h = nh;
      break;
    }
    case 'text': {
      const ntx = a.y;
      const nty = origW - a.x;
      a.x = ntx; a.y = nty;
      break;
    }
  }
}

// ════════════════════════════════════════════════════════════════
// ── Canvas Pointer Helpers
// ════════════════════════════════════════════════════════════════

function _getZoom() {
  return parseFloat(document.body.style.zoom) || 1;
}

function canvasPos(e) {
  const canvas = getAnnCanvas();
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  const z = _getZoom();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: (clientX / z - rect.left) * annScaleX,
    y: (clientY / z - rect.top) * annScaleY
  };
}

function canvasPosFromEnd(e) {
  const canvas = getAnnCanvas();
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  const z = _getZoom();
  const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
  const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
  return {
    x: (clientX / z - rect.left) * annScaleX,
    y: (clientY / z - rect.top) * annScaleY
  };
}

// ════════════════════════════════════════════════════════════════
// ── Text Re-edit
// ════════════════════════════════════════════════════════════════

function openTextReEdit(a) {
  const textInput = getAnnTextInput();
  const wrap = getAnnCanvasWrap();
  const canvas = getAnnCanvas();
  if (!textInput || !wrap || !canvas) return;

  // 既存のフォントサイズ・色をエディタに反映
  annColor = a.color || annColor;
  annFontSize = a.fontSize || annFontSize;
  // カラーボタンのアクティブ状態を更新
  const colorBtns = document.querySelectorAll('.ann-color');
  colorBtns.forEach(b => b.classList.toggle('active', b.dataset.color === annColor));
  // フォントサイズボタンのアクティブ状態を更新
  updateFontsizeVisibility();

  textInput.style.display = 'block';
  const wrapRect = wrap.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  const screenX = a.x / annScaleX + (canvasRect.left - wrapRect.left);
  const screenY = a.y / annScaleY + (canvasRect.top - wrapRect.top);
  textInput.style.left = screenX + 'px';
  textInput.style.top = screenY + 'px';
  textInput.value = a.text || '';
  textInput.dataset.ax = a.x;
  textInput.dataset.ay = a.y;
  textInput.dataset.mode = 'edit';
  textInput.dataset.editIdx = editingTextIdx;
  setTimeout(() => { textInput.focus(); textInput.select(); }, 50);
}

// ════════════════════════════════════════════════════════════════
// ── Annotation Editor — Pointer Events
// ════════════════════════════════════════════════════════════════

function onAnnDown(e) {
  // Crop mode
  if (annTool === 'crop') {
    const pos = canvasPos(e);
    e.preventDefault();

    if (cropActive && cropRect.w !== 0 && cropRect.h !== 0) {
      const handle = getCropHandleAt(pos.x, pos.y);
      if (handle) {
        cropDragging = handle;
        cropStart = pos;
        cropOrigRect = { ...normalizeCropRect() };
        return;
      }
    }

    cropActive = true;
    cropRect = { x: pos.x, y: pos.y, w: 0, h: 0 };
    cropDragging = 'create';
    cropStart = pos;
    const cropEl = getCropActionsEl();
    if (cropEl) cropEl.style.display = 'none';
    renderAnnotations();
    return;
  }

  // Select mode
  if (annTool === 'select') {
    const pos = canvasPos(e);
    const hitIdx = hitTestAll(pos.x, pos.y);
    const now = Date.now();

    // Double-click detection on text
    if (hitIdx !== null && hitIdx === lastClickIdx && (now - lastClickTime) < 400) {
      const a = annotations[hitIdx];
      if (a.type === 'text') {
        selectedIdx = hitIdx;
        editingTextIdx = hitIdx;
        openTextReEdit(a);
        lastClickTime = 0;
        lastClickIdx = null;
        e.preventDefault();
        return;
      }
    }
    lastClickTime = now;
    lastClickIdx = hitIdx;

    if (hitIdx !== null) {
      selectedIdx = hitIdx;
      selDragging = true;
      selDragStart = pos;
      selOrigPos = JSON.parse(JSON.stringify(annotations[hitIdx]));
      updateSelectionUI();
      renderAnnotations();
    } else {
      deselect();
    }
    e.preventDefault();
    return;
  }

  // Eraser mode
  if (annTool === 'eraser') {
    e.preventDefault();
    drawing = true;
    eraserRemovedStack = [];
    const pos = canvasPos(e);
    const hitIdx = hitTestAll(pos.x, pos.y);
    if (hitIdx !== null) {
      eraserRemovedStack.push(annotations.splice(hitIdx, 1)[0]);
      renderAnnotations();
    }
    return;
  }

  // Text mode
  if (annTool === 'text') {
    const pos = canvasPos(e);
    const textInput = getAnnTextInput();
    const wrap = getAnnCanvasWrap();
    if (!textInput || !wrap) return;
    textInput.style.display = 'block';
    const wrapRect = wrap.getBoundingClientRect();
    const z = _getZoom();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    textInput.style.left = (clientX / z - wrapRect.left) + 'px';
    textInput.style.top = (clientY / z - wrapRect.top) + 'px';
    textInput.value = '';
    textInput.dataset.ax = pos.x;
    textInput.dataset.ay = pos.y;
    textInput.dataset.mode = 'new';
    setTimeout(() => textInput.focus(), 50);
    return;
  }

  // Drawing tools (pen, circle, arrow, rect)
  drawing = true;
  const pos = canvasPos(e);
  e.preventDefault();

  switch (annTool) {
    case 'pen':
      currentAnnotation = { type: 'pen', points: [pos], color: annColor, width: annWidth };
      break;
    case 'circle':
      currentAnnotation = { type: 'circle', cx: pos.x, cy: pos.y, rx: 0, ry: 0, color: annColor, width: annWidth };
      break;
    case 'arrow':
      currentAnnotation = { type: 'arrow', x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y, color: annColor, width: annWidth };
      break;
    case 'rect':
      currentAnnotation = { type: 'rect', x: pos.x, y: pos.y, w: 0, h: 0, color: annColor, width: annWidth };
      break;
  }
}

function onAnnMove(e) {
  // Crop mode drag
  if (annTool === 'crop' && cropDragging) {
    e.preventDefault();
    const pos = canvasPos(e);
    const dx = pos.x - cropStart.x;
    const dy = pos.y - cropStart.y;

    if (cropDragging === 'create') {
      cropRect.w = pos.x - cropRect.x;
      cropRect.h = pos.y - cropRect.y;
    } else if (cropDragging === 'move') {
      cropRect.x = cropOrigRect.x + dx;
      cropRect.y = cropOrigRect.y + dy;
      cropRect.w = cropOrigRect.w;
      cropRect.h = cropOrigRect.h;
    } else {
      let { x, y, w, h } = cropOrigRect;
      switch (cropDragging) {
        case 'nw': x += dx; y += dy; w -= dx; h -= dy; break;
        case 'ne': y += dy; w += dx; h -= dy; break;
        case 'sw': x += dx; w -= dx; h += dy; break;
        case 'se': w += dx; h += dy; break;
        case 'n': y += dy; h -= dy; break;
        case 's': h += dy; break;
        case 'w': x += dx; w -= dx; break;
        case 'e': w += dx; break;
      }
      cropRect.x = x;
      cropRect.y = y;
      cropRect.w = w;
      cropRect.h = h;
    }
    renderAnnotations();
    return;
  }

  // Select mode drag
  if (annTool === 'select' && selDragging && selectedIdx !== null && selDragStart) {
    e.preventDefault();
    const pos = canvasPos(e);
    const dx = pos.x - selDragStart.x;
    const dy = pos.y - selDragStart.y;
    const a = annotations[selectedIdx];
    const orig = selOrigPos;
    switch (a.type) {
      case 'pen':
        if (orig.points) a.points = orig.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
        break;
      case 'circle':
        a.cx = orig.cx + dx; a.cy = orig.cy + dy;
        break;
      case 'arrow':
        a.x1 = orig.x1 + dx; a.y1 = orig.y1 + dy;
        a.x2 = orig.x2 + dx; a.y2 = orig.y2 + dy;
        break;
      case 'rect':
        a.x = orig.x + dx; a.y = orig.y + dy;
        break;
      case 'text':
        a.x = orig.x + dx; a.y = orig.y + dy;
        break;
    }
    renderAnnotations();
    return;
  }

  // Eraser mode drag
  if (annTool === 'eraser' && drawing) {
    e.preventDefault();
    const pos = canvasPos(e);
    const hitIdx = hitTestAll(pos.x, pos.y);
    if (hitIdx !== null) {
      eraserRemovedStack.push(annotations.splice(hitIdx, 1)[0]);
      renderAnnotations();
    }
    return;
  }

  if (!drawing || !currentAnnotation) return;
  e.preventDefault();
  const pos = canvasPos(e);

  switch (currentAnnotation.type) {
    case 'pen':
      currentAnnotation.points.push(pos);
      break;
    case 'circle':
      currentAnnotation.rx = pos.x - currentAnnotation.cx;
      currentAnnotation.ry = pos.y - currentAnnotation.cy;
      break;
    case 'arrow':
      currentAnnotation.x2 = pos.x;
      currentAnnotation.y2 = pos.y;
      break;
    case 'rect':
      currentAnnotation.w = pos.x - currentAnnotation.x;
      currentAnnotation.h = pos.y - currentAnnotation.y;
      break;
  }
  renderAnnotations();
}

function onAnnUp(e) {
  // Crop mode drag end
  if (annTool === 'crop' && cropDragging) {
    cropDragging = null;
    cropOrigRect = null;
    const nr = normalizeCropRect();
    if (nr.w > 5 && nr.h > 5) {
      positionCropActions(nr);
    }
    return;
  }

  // Eraser mode end
  if (annTool === 'eraser' && drawing) {
    drawing = false;
    if (eraserRemovedStack && eraserRemovedStack.length > 0) {
      redoStack = [];
    }
    eraserRemovedStack = [];
    return;
  }

  // Select mode drag end
  if (annTool === 'select' && selDragging) {
    selDragging = false;
    selDragStart = null;
    selOrigPos = null;
    return;
  }

  if (!drawing || !currentAnnotation) return;
  drawing = false;
  annotations.push(currentAnnotation);
  redoStack = [];
  currentAnnotation = null;
  renderAnnotations();
}

// ════════════════════════════════════════════════════════════════
// ── Open / Close Annotation Editor
// ════════════════════════════════════════════════════════════════

function openAnnotationEditor(idx) {
  annIdx = idx;
  const snap = snapshots[idx];
  annotations = JSON.parse(JSON.stringify(snap.annotations || []));
  redoStack = [];
  selectedIdx = null;
  editingTextIdx = null;
  selDragging = false;
  cropActive = false;

  const cropEl = getCropActionsEl();
  if (cropEl) cropEl.style.display = 'none';
  updateSelectionUI();

  const editor = getAnnEditor();
  if (!editor) return;
  editor.classList.add('active');

  // Default to select tool
  annTool = 'select';
  editor.querySelectorAll('.ann-tool[data-tool]').forEach(b => b.classList.remove('active'));
  const selectBtn = editor.querySelector('.ann-tool[data-tool="select"]');
  if (selectBtn) selectBtn.classList.add('active');
  updateFontsizeVisibility();

  const canvas = getAnnCanvas();
  if (canvas) {
    annCtx = canvas.getContext('2d');
  }

  annImg = new Image();
  annImg.onload = () => {
    resizeAnnCanvas();
    renderAnnotations();
  };
  annImg.src = snap.url;
}

function closeAnnotationEditor() {
  const editor = getAnnEditor();
  if (editor) editor.classList.remove('active');
}

// ════════════════════════════════════════════════════════════════
// ── Save Annotation Editor
// ════════════════════════════════════════════════════════════════

async function saveAnnotationEditor() {
  if (cropActive) return;
  if (!annImg || annIdx < 0 || !snapshots[annIdx]) return;

  const c = document.createElement('canvas');
  c.width = annImg.naturalWidth || annImg.width;
  c.height = annImg.naturalHeight || annImg.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(annImg, 0, 0);
  annotations.forEach(a => drawAnnotation(ctx, a));

  const { quality } = getCompressionSettings();

  return new Promise((resolve) => {
    c.toBlob(async (blob) => {
      const snap = snapshots[annIdx];
      URL.revokeObjectURL(snap.url);
      snap.blob = blob;
      snap.url = URL.createObjectURL(blob);
      snap.annotations = JSON.parse(JSON.stringify(annotations));

      // Persist to IndexedDB
      try {
        await putSnapshot(snap.id, snap.videoId, blob, snap.annotations);
      } catch (err) {
        console.error('[snapshot-editor] putSnapshot on save failed:', err);
      }

      closeAnnotationEditor();
      renderGrid();
      syncVideoRefs();
      resolve();
    }, 'image/jpeg', quality);
  });
}

// ════════════════════════════════════════════════════════════════
// ── Bind Editor UI Events
// ════════════════════════════════════════════════════════════════

function bindEditorEvents() {
  // Canvas pointer events
  const canvas = getAnnCanvas();
  if (canvas) {
    canvas.addEventListener('mousedown', onAnnDown);
    canvas.addEventListener('mousemove', onAnnMove);
    canvas.addEventListener('mouseup', onAnnUp);
    canvas.addEventListener('mouseleave', onAnnUp);
    canvas.addEventListener('touchstart', onAnnDown, { passive: false });
    canvas.addEventListener('touchmove', onAnnMove, { passive: false });
    canvas.addEventListener('touchend', onAnnUp);
  }

  // Crop buttons
  const cropConfirm = getCropConfirmBtn();
  const cropCancel = getCropCancelBtn();
  if (cropConfirm) cropConfirm.addEventListener('click', () => applyCrop());
  if (cropCancel) cropCancel.addEventListener('click', () => { exitCropMode(); renderAnnotations(); });

  // Rotate buttons
  const rotateCW = $('snap-ann-rotate-cw');
  const rotateCCW = $('snap-ann-rotate-ccw');
  if (rotateCW) rotateCW.addEventListener('click', () => { if (!cropActive) rotateImage(true); });
  if (rotateCCW) rotateCCW.addEventListener('click', () => { if (!cropActive) rotateImage(false); });

  // Tool selection
  const editor = getAnnEditor();
  if (editor) {
    editor.querySelectorAll('.ann-tool[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (cropActive && btn.dataset.tool !== 'crop') {
          exitCropMode();
          renderAnnotations();
        }
        annTool = btn.dataset.tool;
        editor.querySelectorAll('.ann-tool[data-tool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const annCanvas = getAnnCanvas();
        if (annCanvas) annCanvas.classList.toggle('eraser-cursor', annTool === 'eraser');
        if (annTool !== 'select') {
          selectedIdx = null;
          updateSelectionUI();
          renderAnnotations();
        }
        if (annTool === 'crop') {
          cropActive = true;
          cropRect = { x: 0, y: 0, w: 0, h: 0 };
          cropDragging = null;
        }
        updateFontsizeVisibility();
      });
    });
  }

  // Color selection
  const colorsContainer = $('snap-ann-colors');
  if (colorsContainer) {
    colorsContainer.querySelectorAll('.ann-color').forEach(btn => {
      btn.addEventListener('click', () => {
        if (colorLongPressTarget === btn) { colorLongPressTarget = null; return; }
        annColor = btn.dataset.color;
        colorsContainer.querySelectorAll('.ann-color').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (selectedIdx !== null && annotations[selectedIdx]) {
          annotations[selectedIdx].color = annColor;
          renderAnnotations();
        }
      });

      btn.addEventListener('pointerdown', () => {
        colorLongPressTarget = null;
        colorLongPressTimer = setTimeout(() => {
          colorLongPressTarget = btn;
          const picker = getAnnColorPicker();
          const popup = getAnnColorPopup();
          if (!picker || !popup) return;
          picker.value = btn.dataset.color;
          const btnRect = btn.getBoundingClientRect();
          popup.style.position = 'fixed';
          popup.style.left = (btnRect.left + btnRect.width / 2 - 26) + 'px';
          popup.style.top = (btnRect.top - 48) + 'px';
          popup.style.bottom = 'auto';
          popup.classList.add('visible');
          popup.dataset.targetColor = btn.dataset.color;
          popup._targetBtn = btn;
          picker.click();
        }, 500);
      });
      btn.addEventListener('pointerup', () => clearTimeout(colorLongPressTimer));
      btn.addEventListener('pointerleave', () => clearTimeout(colorLongPressTimer));
      btn.addEventListener('pointercancel', () => clearTimeout(colorLongPressTimer));
    });
  }

  // Color picker
  const colorPicker = getAnnColorPicker();
  const colorPopup = getAnnColorPopup();
  if (colorPicker && colorPopup) {
    colorPicker.addEventListener('input', (e) => {
      const newColor = e.target.value;
      const btn = colorPopup._targetBtn;
      if (btn) {
        btn.dataset.color = newColor;
        btn.style.background = newColor;
        if (btn.classList.contains('active')) {
          annColor = newColor;
        }
      }
    });
    colorPicker.addEventListener('change', () => {
      colorPopup.classList.remove('visible');
    });
  }

  // Width selection
  if (editor) {
    editor.querySelectorAll('.ann-width').forEach(btn => {
      btn.addEventListener('click', () => {
        annWidth = parseInt(btn.dataset.w);
        editor.querySelectorAll('.ann-width').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (selectedIdx !== null && annotations[selectedIdx]) {
          annotations[selectedIdx].width = annWidth;
          renderAnnotations();
        }
      });
    });
  }

  // Font size selection
  const fontsizeWrap = getAnnFontsizeWrap();
  if (fontsizeWrap) {
    fontsizeWrap.querySelectorAll('.ann-fontsize-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const fs = parseInt(btn.dataset.fs);
        annFontSize = fs;
        fontsizeWrap.querySelectorAll('.ann-fontsize-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (selectedIdx !== null && annotations[selectedIdx] && annotations[selectedIdx].type === 'text') {
          annotations[selectedIdx].fontSize = fs;
          renderAnnotations();
        }
      });
    });
  }

  // Delete selected
  const delSelBtn = getAnnDelSelBtn();
  if (delSelBtn) {
    delSelBtn.addEventListener('click', () => {
      if (selectedIdx !== null && annotations[selectedIdx]) {
        redoStack.push(annotations.splice(selectedIdx, 1)[0]);
        selectedIdx = null;
        updateSelectionUI();
        renderAnnotations();
      }
    });
  }

  // Undo / Redo / Clear
  const undoBtn = $('snap-ann-undo');
  const redoBtn = $('snap-ann-redo');
  const clearBtn = $('snap-ann-clear');
  if (undoBtn) {
    undoBtn.addEventListener('click', () => {
      if (cropActive) return;
      if (annotations.length) {
        if (selectedIdx !== null) deselect();
        redoStack.push(annotations.pop());
        renderAnnotations();
      }
    });
  }
  if (redoBtn) {
    redoBtn.addEventListener('click', () => {
      if (cropActive) return;
      if (redoStack.length) {
        if (selectedIdx !== null) deselect();
        annotations.push(redoStack.pop());
        renderAnnotations();
      }
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (cropActive) return;
      if (annotations.length && confirm('全ての注釈を削除しますか？')) {
        redoStack.push(...annotations.reverse());
        annotations = [];
        selectedIdx = null;
        updateSelectionUI();
        renderAnnotations();
      }
    });
  }

  // Save / Cancel
  const saveBtn = $('snap-ann-save');
  const cancelBtn = $('snap-ann-cancel');
  if (saveBtn) saveBtn.addEventListener('click', () => saveAnnotationEditor());
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (cropActive) { exitCropMode(); renderAnnotations(); return; }
      closeAnnotationEditor();
    });
  }

  // Text input confirm
  const textInput = getAnnTextInput();
  if (textInput) {
    textInput.addEventListener('keydown', (e) => {
      // Ctrl+Enter or Cmd+Enter で確定（Enterは改行）
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const text = textInput.value.trim();
        const mode = textInput.dataset.mode;

        if (mode === 'edit') {
          const idx = parseInt(textInput.dataset.editIdx);
          if (text && annotations[idx]) {
            annotations[idx].text = text;
            annotations[idx].color = annColor;
            annotations[idx].fontSize = annFontSize;
            renderAnnotations();
          }
          editingTextIdx = null;
        } else {
          if (text) {
            annotations.push({
              type: 'text',
              text,
              x: parseFloat(textInput.dataset.ax),
              y: parseFloat(textInput.dataset.ay),
              color: annColor,
              width: annWidth,
              fontSize: annFontSize
            });
            redoStack = [];
            renderAnnotations();
          }
        }
        textInput.style.display = 'none';
        textInput.value = '';
      }
      if (e.key === 'Escape') {
        textInput.style.display = 'none';
        textInput.value = '';
        editingTextIdx = null;
      }
    });
  }
}

// ════════════════════════════════════════════════════════════════
// ── Bind Lightbox Events
// ════════════════════════════════════════════════════════════════

function bindLightboxEvents() {
  const lb = getLightbox();
  if (!lb) return;

  const lbCloseBtn = $('snap-lb-close');
  const lbPrevBtn = $('snap-lb-prev');
  const lbNextBtn = $('snap-lb-next');
  const lbMemo = getLbMemo();
  const lbEditBtn = $('snap-lb-edit');

  if (lbCloseBtn) lbCloseBtn.addEventListener('click', closeLightbox);
  lb.addEventListener('click', (e) => { if (e.target === lb) closeLightbox(); });
  if (lbPrevBtn) lbPrevBtn.addEventListener('click', (e) => { e.stopPropagation(); lbPrevSlide(); });
  if (lbNextBtn) lbNextBtn.addEventListener('click', (e) => { e.stopPropagation(); lbNextSlide(); });
  if (lbMemo) {
    lbMemo.addEventListener('input', () => {
      if (snapshots[lbIdx]) {
        snapshots[lbIdx].memo = lbMemo.value;
        syncVideoRefs();
      }
    });
  }
  if (lbEditBtn) {
    lbEditBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeLightbox();
      openAnnotationEditor(lbIdx);
    });
  }

  // Swipe
  lb.addEventListener('touchstart', (e) => { swipeStartX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - swipeStartX;
    if (Math.abs(dx) > 50) {
      if (dx < 0) lbNextSlide();
      else lbPrevSlide();
    }
  });
}

// ════════════════════════════════════════════════════════════════
// ── Global Key & Resize Handlers
// ════════════════════════════════════════════════════════════════

function onGlobalKeydown(e) {
  const editor = getAnnEditor();
  const lb = getLightbox();
  const textInput = getAnnTextInput();

  // Annotation editor shortcuts
  if (editor && editor.classList.contains('active')) {
    if (textInput && e.target === textInput) return;
    if (e.key === 'Escape') {
      if (cropActive) { exitCropMode(); renderAnnotations(); return; }
      if (selectedIdx !== null) { deselect(); return; }
      closeAnnotationEditor();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdx !== null) {
      e.preventDefault();
      redoStack.push(annotations.splice(selectedIdx, 1)[0]);
      selectedIdx = null;
      updateSelectionUI();
      renderAnnotations();
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') {
        e.preventDefault();
        if (cropActive) return;
        if (e.shiftKey) {
          if (redoStack.length) { annotations.push(redoStack.pop()); renderAnnotations(); }
        } else {
          if (annotations.length) { redoStack.push(annotations.pop()); renderAnnotations(); }
        }
      }
    }
    return;
  }

  // Lightbox shortcuts
  if (lb && lb.classList.contains('active')) {
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') lbPrevSlide();
    if (e.key === 'ArrowRight') lbNextSlide();
  }
}

function onGlobalResize() {
  const editor = getAnnEditor();
  if (editor && editor.classList.contains('active') && annImg) {
    resizeAnnCanvas();
    renderAnnotations();
  }
}

function onGlobalPointerDown(e) {
  const popup = getAnnColorPopup();
  if (popup && !popup.contains(e.target) && !e.target.classList.contains('ann-color')) {
    popup.classList.remove('visible');
  }
}

function bindGlobalListeners() {
  if (globalListenersBound) return;
  globalListenersBound = true;

  document.addEventListener('keydown', onGlobalKeydown);
  window.addEventListener('resize', onGlobalResize);
  document.addEventListener('pointerdown', onGlobalPointerDown);

  // Paste handler — only when VPanel is open and annotation editor is NOT open
  document.addEventListener('paste', (e) => {
    if (!currentVideoId) return;
    const annEd = getAnnEditor();
    if (annEd && annEd.classList.contains('active')) return;
    // Don't intercept if user is typing in a textarea/input (except snapshot memo)
    const tag = e.target?.tagName;
    if (tag === 'TEXTAREA' || (tag === 'INPUT' && e.target.type !== 'file')) return;
    handleSnapshotPaste(e, currentVideoId);
  });
}

// ════════════════════════════════════════════════════════════════
// ── Add Button Binding
// ════════════════════════════════════════════════════════════════

function bindAddButton() {
  if (!containerEl) return;
  const addBtn = containerEl.querySelector('#snap-add-btn');
  const fileInput = getFileInput();

  if (addBtn && fileInput) {
    addBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) {
        addSnapshotImages(currentVideoId, [...fileInput.files]);
      }
      fileInput.value = '';
    });
  }
}

// ════════════════════════════════════════════════════════════════
// ── Exported Functions
// ════════════════════════════════════════════════════════════════

/**
 * Initialize the snapshot section inside VPanel.
 * Called when VPanel opens for a specific video.
 * @param {string} videoId - The video ID
 * @param {HTMLElement} container - The container element to render into
 */
export async function initSnapshotSection(videoId, container) {
  cleanupSnapshots(); // cleanup previous session
  currentVideoId = videoId;
  containerEl = container;

  const v = (window.videos || []).find(x => x.id === videoId);
  const refs = v?.snapshots || [];

  container.innerHTML = `
    <div class="fsec">
      <div class="fsec-title">
        SNAPSHOT
        <span class="snap-count">${refs.length}枚</span>
      </div>
      <div class="snap-grid">
        <button class="snap-add" id="snap-add-btn">
          <span style="font-size:16px">&#128247;</span>
          追加
        </button>
      </div>
    </div>`;

  bindAddButton();
  bindGlobalListeners();
  bindLightboxEvents();
  bindEditorEvents();

  if (!refs.length) { snapshots = []; return; }

  // ── Phase 1: ローカル IndexedDB から即座に描画 ──
  // (クラウド同期を待たずにキャッシュ済みのスナップショットを表示)
  let localSnaps = [];
  try {
    localSnaps = await getSnapshotsByVideo(videoId);
  } catch (e) {
    console.warn('[snapshot-editor] local getSnapshotsByVideo failed:', e);
  }
  if (currentVideoId !== videoId) return; // 切り替わった

  const buildEntry = (ref, i, db) => {
    if (!db || !db.blob) return null;
    return {
      id:          ref.id,
      videoId,
      blob:        db.blob,
      url:         URL.createObjectURL(db.blob),
      memo:        ref.memo || '',
      annotations: db.annotations || [],
      order:       i,
    };
  };

  const localMap = new Map(localSnaps.map(s => [s.id, s]));
  snapshots = refs.map((ref, i) => buildEntry(ref, i, localMap.get(ref.id))).filter(Boolean);
  renderGrid();

  // ── Phase 2: クラウドから不足分をバックグラウンド取得 ──
  const missing = refs.filter(r => !localMap.has(r.id));
  if (!missing.length) return;

  try {
    const fetched = await syncSnapshotsFromCloud(videoId, missing);
    if (currentVideoId !== videoId) return;
    const fetchedMap = new Map(fetched.map(s => [s.id, s]));
    let updated = false;
    snapshots = refs.map((ref, i) => {
      const existing = snapshots.find(s => s.id === ref.id);
      if (existing) return { ...existing, order: i };
      const db = fetchedMap.get(ref.id);
      const e = buildEntry(ref, i, db);
      if (e) updated = true;
      return e;
    }).filter(Boolean);
    if (updated) renderGrid();
  } catch (err) {
    console.warn('[snapshot-editor] background cloud sync failed:', err);
  }
}

/**
 * Compress and store images for a video.
 * Called from paste handler and file picker.
 * @param {string} videoId - The video ID
 * @param {File[]} files - Array of image files
 */
export async function addSnapshotImages(videoId, files) {
  if (!videoId || !files || !files.length) return;

  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;

    const blob = await compressImage(file);
    const id = generateId();
    const url = URL.createObjectURL(blob);

    const snap = {
      id,
      videoId,
      blob,
      url,
      memo: '',
      annotations: [],
      order: snapshots.length
    };
    snapshots.push(snap);

    // Persist to IndexedDB
    try {
      await putSnapshot(id, videoId, blob, []);
    } catch (err) {
      console.error('[snapshot-editor] putSnapshot failed:', err);
    }
  }

  renderGrid();
  syncVideoRefs();
}

/**
 * Paste event handler. Extracts image files from clipboard and calls addSnapshotImages.
 * @param {ClipboardEvent} e - The paste event
 * @param {string} videoId - The video ID
 */
export function handleSnapshotPaste(e, videoId) {
  const editor = getAnnEditor();
  if (editor && editor.classList.contains('active')) return;

  const items = e.clipboardData?.items;
  if (!items) return;
  const files = [];
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      files.push(item.getAsFile());
    }
  }
  if (files.length) addSnapshotImages(videoId, files);
}

/**
 * Cleanup when VPanel closes. Revokes all object URLs and clears state.
 */
export function cleanupSnapshots() {
  for (const snap of snapshots) {
    if (snap.url) {
      try { URL.revokeObjectURL(snap.url); } catch (_) { /* noop */ }
    }
  }
  snapshots = [];
  currentVideoId = null;
  containerEl = null;
  lbIdx = 0;
  annIdx = -1;
  annImg = null;
  annCtx = null;
  annotations = [];
  redoStack = [];
  drawing = false;
  currentAnnotation = null;
  selectedIdx = null;
  selDragging = false;
  selDragStart = null;
  selOrigPos = null;
  editingTextIdx = null;
  cropActive = false;
  cropDragging = null;
  cropRect = { x: 0, y: 0, w: 0, h: 0 };
  dragSrcIdx = null;

  // Close overlays if open
  closeLightbox();
  closeAnnotationEditor();
}

/**
 * Returns lightweight refs array for storing in Firestore video data.
 * @param {string} videoId - The video ID
 * @returns {Array<{id: string, memo: string, order: number}>}
 */
export function getSnapshotRefs(videoId) {
  if (videoId !== currentVideoId) return [];
  return snapshots.map((s, i) => ({
    id: s.id,
    memo: s.memo || '',
    order: i
  }));
}

// ════════════════════════════════════════════════════════════════
// ── Window-exposed functions (for onclick handlers in HTML)
// ════════════════════════════════════════════════════════════════

window.snapOpenLightbox = (idx) => openLightbox(idx);
window.snapDelete = (idx) => deleteSnap(idx);
window.snapAddFile = (videoId) => {
  const fileInput = getFileInput();
  if (fileInput) {
    currentVideoId = videoId;
    fileInput.click();
  }
};
