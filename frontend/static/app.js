document.addEventListener('DOMContentLoaded', () => {
  // API Endpoint configuration for GitHub Pages & Cross-Origin requests
  const CLOUD_RUN_API_URL = 'https://travel-planner-api-659310514131.us-central1.run.app';
  const API_BASE_URL = (window.location.hostname.includes('github.io') || window.location.protocol === 'file:')
    ? CLOUD_RUN_API_URL
    : '';

  // Global State
  let currentSessionId = null;
  let isItineraryModified = false;

  // DOM Elements
  const chatsList = document.getElementById('chats-list');
  const currentChatTitle = document.getElementById('current-chat-title');
  const currentChatId = document.getElementById('current-chat-id');
  const chatMessages = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const btnSend = document.getElementById('btn-send');
  const btnNewChat = document.getElementById('btn-new-chat');
  const chkIncludeItinerary = document.getElementById('chk-include-itinerary');
  const selEditMode = document.getElementById('sel-edit-mode');

  const itineraryEditor = document.getElementById('itinerary-editor');
  const itineraryPreview = document.getElementById('itinerary-preview');
  const tabEdit = document.getElementById('tab-edit');
  const tabView = document.getElementById('tab-view');
  const tabMap = document.getElementById('tab-map');
  const editorContainer = document.getElementById('editor-container');
  const previewContainer = document.getElementById('preview-container');
  const mapContainer = document.getElementById('map-container');
  const googleMapIframe = document.getElementById('google-map-iframe');
  const selMapLocation = document.getElementById('sel-map-location');
  const mapLocationsList = document.getElementById('map-locations-list');
  const mapLocationCount = document.getElementById('map-location-count');

  const tabDiff = document.getElementById('tab-diff');
  const diffContainer = document.getElementById('diff-container');
  const btnApproveDiff = document.getElementById('btn-approve-diff');
  const btnRejectDiff = document.getElementById('btn-reject-diff');
  const diffView = document.getElementById('diff-view');

  let currentProposedContent = null;

  const btnSaveItinerary = document.getElementById('btn-save-itinerary');
  const btnSyncAgent = document.getElementById('btn-sync-agent');
  const saveIndicator = document.getElementById('save-indicator');
  const charCounter = document.getElementById('char-counter');

  // --- INITIALIZATION ---
  initApp();

  async function initApp() {
    await loadItinerary();
    await loadChatsList();
    
    // Default or create new session if none exists
    if (!currentSessionId) {
      await startNewChat();
    }

    setupEventListeners();
  }

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    // Chat form submit
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleSendMessage();
    });

    // Enter to send (Shift+Enter for newline)
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    });

    // New Chat button
    btnNewChat.addEventListener('click', () => {
      startNewChat();
    });

    // Itinerary Editor Tabs
    tabEdit.addEventListener('click', () => switchTab('edit'));
    tabView.addEventListener('click', () => switchTab('view'));
    if (tabMap) tabMap.addEventListener('click', () => switchTab('map'));
    if (tabDiff) tabDiff.addEventListener('click', () => switchTab('diff'));

    if (btnApproveDiff) {
      btnApproveDiff.addEventListener('click', async () => {
        if (!currentProposedContent) return;
        btnApproveDiff.disabled = true;
        btnApproveDiff.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Applying...';
        try {
          const res = await fetch(`${API_BASE_URL}/api/itinerary/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: currentProposedContent })
          });
          if (res.ok) {
            await loadItinerary();
            hideDiffTab();
          } else {
            alert('Failed to approve itinerary edit.');
          }
        } catch (err) {
          alert('Error approving itinerary edit: ' + err.message);
        } finally {
          btnApproveDiff.disabled = false;
          btnApproveDiff.innerHTML = '<i class="fa-solid fa-check"></i> Approve & Apply';
        }
      });
    }

    if (btnRejectDiff) {
      btnRejectDiff.addEventListener('click', () => {
        hideDiffTab();
      });
    }

    if (selMapLocation) {
      selMapLocation.addEventListener('change', (e) => {
        updateMapFrameLocation(e.target.value);
      });
    }

    function switchTab(mode) {
      tabEdit.classList.toggle('active', mode === 'edit');
      tabView.classList.toggle('active', mode === 'view');
      if (tabMap) tabMap.classList.toggle('active', mode === 'map');
      if (tabDiff) tabDiff.classList.toggle('active', mode === 'diff');

      editorContainer.classList.toggle('hidden', mode !== 'edit');
      previewContainer.classList.toggle('hidden', mode !== 'view');
      if (mapContainer) mapContainer.classList.toggle('hidden', mode !== 'map');
      if (diffContainer) diffContainer.classList.toggle('hidden', mode !== 'diff');

      if (mode === 'view') {
        renderMarkdownPreview();
      } else if (mode === 'map') {
        renderMapView();
      }
    }

    function computeLineDiff(oldText, newText) {
      const oldLines = oldText ? oldText.split('\n') : [];
      const newLines = newText ? newText.split('\n') : [];
      
      const matrix = Array(oldLines.length + 1).fill(null).map(() => Array(newLines.length + 1).fill(0));
      for (let x = 1; x <= oldLines.length; x++) {
        for (let y = 1; y <= newLines.length; y++) {
          if (oldLines[x - 1] === newLines[y - 1]) {
            matrix[x][y] = matrix[x - 1][y - 1] + 1;
          } else {
            matrix[x][y] = Math.max(matrix[x - 1][y], matrix[x][y - 1]);
          }
        }
      }
      
      let x = oldLines.length, y = newLines.length;
      const lcs = [];
      while (x > 0 && y > 0) {
        if (oldLines[x - 1] === newLines[y - 1]) {
          lcs.unshift({ type: 'unchanged', line: oldLines[x - 1], oldIdx: x - 1, newIdx: y - 1 });
          x--; y--;
        } else if (matrix[x - 1][y] >= matrix[x][y - 1]) {
          x--;
        } else {
          y--;
        }
      }
      
      const diffLines = [];
      let oldPos = 0, newPos = 0;
      for (const item of lcs) {
        while (oldPos < item.oldIdx) {
          diffLines.push({ type: 'removed', content: oldLines[oldPos] });
          oldPos++;
        }
        while (newPos < item.newIdx) {
          diffLines.push({ type: 'added', content: newLines[newPos] });
          newPos++;
        }
        diffLines.push({ type: 'unchanged', content: item.line });
        oldPos++;
        newPos++;
      }
      while (oldPos < oldLines.length) {
        diffLines.push({ type: 'removed', content: oldLines[oldPos] });
        oldPos++;
      }
      while (newPos < newLines.length) {
        diffLines.push({ type: 'added', content: newLines[newPos] });
        newPos++;
      }
      
      return diffLines;
    }

    function renderDiffView(oldText, newText) {
      if (!diffView) return;
      const diffLines = computeLineDiff(oldText, newText);
      diffView.innerHTML = '';
      
      let addedCount = 0;
      let removedCount = 0;

      diffLines.forEach(line => {
        const lineEl = document.createElement('div');
        lineEl.className = `diff-line ${line.type}`;
        let prefix = '  ';
        if (line.type === 'added') {
          prefix = '+ ';
          addedCount++;
        } else if (line.type === 'removed') {
          prefix = '- ';
          removedCount++;
        }
        lineEl.textContent = prefix + line.content;
        diffView.appendChild(lineEl);
      });

      const diffInfo = document.querySelector('.diff-toolbar-info span');
      if (diffInfo) {
        diffInfo.innerHTML = `Agent Proposed Itinerary Changes <span style="color:#7ee787; font-size:0.85rem; margin-left:8px;">+${addedCount} lines</span> <span style="color:#ff7b72; font-size:0.85rem; margin-left:4px;">-${removedCount} lines</span>`;
      }
    }

    function showDiffTab(proposedContent) {
      currentProposedContent = proposedContent;
      if (tabDiff) {
        tabDiff.classList.remove('hidden');
      }
      renderDiffView(itineraryEditor.value, proposedContent);
      switchTab('diff');
    }

    function hideDiffTab() {
      currentProposedContent = null;
      if (tabDiff) {
        tabDiff.classList.add('hidden');
      }
      switchTab('view');
    }

    // Manual Edit in Itinerary Editor
    itineraryEditor.addEventListener('input', () => {
      isItineraryModified = true;
      saveIndicator.className = 'status-unsaved';
      saveIndicator.innerHTML = '<i class="fa-solid fa-pen"></i> Unsaved changes...';
      updateCharCount();
    });

    // Save Itinerary Button
    btnSaveItinerary.addEventListener('click', () => {
      saveItinerary();
    });

    // Sync Agent Button
    btnSyncAgent.addEventListener('click', async () => {
      await saveItinerary();
      addSystemNotification('Itinerary synced with AI Agent context!');
    });

    // Quick Prompts
    document.querySelectorAll('.prompt-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const promptText = chip.getAttribute('data-prompt');
        chatInput.value = promptText;
        chatInput.focus();
      });
    });
  }

  // --- ITINERARY SOURCE OF TRUTH (MD) FUNCTIONS ---
  async function loadItinerary() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/itinerary`);
      const data = await res.json();
      itineraryEditor.value = data.content || '';
      updateCharCount();
      renderMarkdownPreview();
      isItineraryModified = false;
      saveIndicator.className = 'status-saved';
      saveIndicator.innerHTML = '<i class="fa-solid fa-check"></i> Saved to disk';
    } catch (err) {
      console.error('Failed to load itinerary:', err);
    }
  }

  async function saveItinerary() {
    try {
      btnSaveItinerary.disabled = true;
      btnSaveItinerary.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

      const res = await fetch(`${API_BASE_URL}/api/itinerary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: itineraryEditor.value })
      });

      if (res.ok) {
        isItineraryModified = false;
        saveIndicator.className = 'status-saved';
        saveIndicator.innerHTML = '<i class="fa-solid fa-check"></i> Saved to disk';
        renderMarkdownPreview();
      } else {
        alert('Failed to save itinerary file.');
      }
    } catch (err) {
      alert('Error saving itinerary: ' + err.message);
    } finally {
      btnSaveItinerary.disabled = false;
      btnSaveItinerary.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Itinerary';
    }
  }

  function renderMarkdownPreview() {
    if (window.marked) {
      itineraryPreview.innerHTML = marked.parse(itineraryEditor.value || '');
    } else {
      itineraryPreview.textContent = itineraryEditor.value;
    }
  }

  function updateCharCount() {
    const text = itineraryEditor.value || '';
    charCounter.textContent = `${text.length} chars | ${text.trim().split(/\s+/).filter(Boolean).length} words`;
  }

  let leafletMap = null;
  let leafletMarkersGroup = null;
  let isGoogleEmbedMode = false;

  const btnToggleMapProvider = document.getElementById('btn-toggle-map-provider');
  const interactiveLeafletMapDiv = document.getElementById('interactive-leaflet-map');

  if (btnToggleMapProvider) {
    btnToggleMapProvider.addEventListener('click', () => {
      isGoogleEmbedMode = !isGoogleEmbedMode;
      if (isGoogleEmbedMode) {
        interactiveLeafletMapDiv.classList.add('hidden');
        googleMapIframe.classList.remove('hidden');
        btnToggleMapProvider.innerHTML = `<i class="fa-solid fa-map-location-dot"></i> Marker Map`;
      } else {
        googleMapIframe.classList.add('hidden');
        interactiveLeafletMapDiv.classList.remove('hidden');
        btnToggleMapProvider.innerHTML = `<i class="fa-solid fa-layer-group"></i> Embed View`;
        if (leafletMap) leafletMap.invalidateSize();
      }
    });
  }

  // Known Coordinates Dictionary for Bullet Spot Accuracy
  const SPOT_COORDINATES = {
    "sensō-ji temple": { lat: 35.7148, lng: 139.7967, type: "attraction", icon: "⛩️", rating: "4.8 ⭐ (72,400+ reviews)", title: "Sensō-ji Temple" },
    "sensoji temple": { lat: 35.7148, lng: 139.7967, type: "attraction", icon: "⛩️", rating: "4.8 ⭐ (72,400+ reviews)", title: "Sensō-ji Temple" },
    "asakusa culture tourist info center": { lat: 35.7107, lng: 139.7964, type: "attraction", icon: "🏙️", rating: "4.5 ⭐ (4,200+ reviews)", title: "Asakusa Culture Tourist Info Center" },
    "daikokuya": { lat: 35.7132, lng: 139.7948, type: "dining", icon: "🍤", rating: "4.3 ⭐ (3,100+ reviews)", title: "Daikokuya Tempura Asakusa" },
    "kappabashi": { lat: 35.7135, lng: 139.7891, type: "area", icon: "🔪", rating: "Focus Area", title: "Kappabashi Kitchen Street" },
    "sumida riverwalk": { lat: 35.7121, lng: 139.8005, type: "attraction", icon: "🌉", rating: "4.4 ⭐ (1,500+ reviews)", title: "Sumida Riverwalk" },
    "tokyo national museum": { lat: 35.7188, lng: 139.7765, type: "attraction", icon: "🏛️", rating: "4.6 ⭐ (18,900+ reviews)", title: "Tokyo National Museum" },
    "hoppy dori": { lat: 35.7138, lng: 139.7938, type: "dining", icon: "🍻", rating: "4.4 ⭐ (2,200+ reviews)", title: "Hoppy Dori Izakaya Street" },
    "shibuya sky": { lat: 35.6584, lng: 139.7022, type: "attraction", icon: "🏙️", rating: "4.7 ⭐ (14,200+ reviews)", title: "Shibuya Sky & Observatory" },
    "shibuya scramble": { lat: 35.6595, lng: 139.7004, type: "attraction", icon: "🚶", rating: "4.6 ⭐ (38,100+ reviews)", title: "Shibuya Scramble Crossing" },
    "tsukiji outer market": { lat: 35.6654, lng: 139.7707, type: "dining", icon: "🍣", rating: "4.5 ⭐ (28,900+ reviews)", title: "Tsukiji Outer Market" },
    "imperial palace east gardens": { lat: 35.6865, lng: 139.7562, type: "attraction", icon: "🏯", rating: "4.5 ⭐ (15,400+ reviews)", title: "Imperial Palace East Gardens" },
    "fushimi inari taisha": { lat: 34.9671, lng: 135.7727, type: "attraction", icon: "⛩️", rating: "4.8 ⭐ (58,300+ reviews)", title: "Fushimi Inari Taisha (Kyoto)" },
    "fushimi inari": { lat: 34.9671, lng: 135.7727, type: "attraction", icon: "⛩️", rating: "4.8 ⭐ (58,300+ reviews)", title: "Fushimi Inari Taisha (Kyoto)" },
    "ginza kyubey": { lat: 35.6698, lng: 139.7618, type: "dining", icon: "🍣", rating: "4.6 ⭐ (1,850+ reviews)", title: "Ginza Kyubey (Sushi)" },
    "meiji jingu shrine": { lat: 35.6764, lng: 139.6993, type: "attraction", icon: "⛩️", rating: "4.6 ⭐ (31,000+ reviews)", title: "Meiji Jingu Shrine" },
    "meiji shrine": { lat: 35.6764, lng: 139.6993, type: "attraction", icon: "⛩️", rating: "4.6 ⭐ (31,000+ reviews)", title: "Meiji Jingu Shrine" },
    "harajuku": { lat: 35.6702, lng: 139.7027, type: "area", icon: "🛍️", rating: "Focus Area", title: "Harajuku & Takeshita St" },
    "shinjuku memory lane": { lat: 35.6928, lng: 139.6996, type: "dining", icon: "🏮", rating: "4.5 ⭐ (5,200+ reviews)", title: "Shinjuku Omoide Yokocho" },
    "kiyomizu-dera temple": { lat: 34.9949, lng: 135.7850, type: "attraction", icon: "⛩️", rating: "4.7 ⭐ (35,600+ reviews)", title: "Kiyomizu-dera Temple (Kyoto)" },
    "kiyomizu-dera": { lat: 34.9949, lng: 135.7850, type: "attraction", icon: "⛩️", rating: "4.7 ⭐ (35,600+ reviews)", title: "Kiyomizu-dera Temple (Kyoto)" },
    "sannen-zaka": { lat: 34.9972, lng: 135.7818, type: "area", icon: "🍡", rating: "Focus Area", title: "Sannen-zaka Historic Street" },
    "gion district": { lat: 35.0037, lng: 135.7772, type: "area", icon: "🏮", rating: "Focus Area", title: "Gion Geisha District" },
    "gion": { lat: 35.0037, lng: 135.7772, type: "area", icon: "🏮", rating: "Focus Area", title: "Gion Geisha District" },
    "camellia tea house": { lat: 34.9985, lng: 135.7812, type: "attraction", icon: "🍵", rating: "4.9 ⭐ (850+ reviews)", title: "Camellia Tea House Kyoto" },
    "pontocho alley": { lat: 35.0051, lng: 135.7711, type: "dining", icon: "🍱", rating: "4.6 ⭐ (8,400+ reviews)", title: "Pontocho Alley Dining" },
    "pontocho": { lat: 35.0051, lng: 135.7711, type: "dining", icon: "🍱", rating: "4.6 ⭐ (8,400+ reviews)", title: "Pontocho Alley Dining" }
  };

  function extractLocationsFromItinerary(markdownText) {
    if (!markdownText) return [];

    const foundLocations = new Set();
    const lines = markdownText.split('\n');
    let inScheduleSection = false;

    lines.forEach(line => {
      const trimmed = line.trim();

      // Track sections
      if (trimmed.startsWith('#') || trimmed.startsWith('##')) {
        const lowerHeader = trimmed.toLowerCase();
        if (lowerHeader.includes('schedule') || lowerHeader.includes('day-by-day') || lowerHeader.includes('itinerary')) {
          inScheduleSection = true;
        } else if (lowerHeader.includes('overview') || lowerHeader.includes('weather') || lowerHeader.includes('budget') || lowerHeader.includes('cost') || lowerHeader.includes('packing') || lowerHeader.includes('checklist')) {
          inScheduleSection = false;
        }
      }

      // Strictly parse bullet point lines within schedule section
      if (inScheduleSection && (trimmed.startsWith('*') || trimmed.startsWith('-') || trimmed.startsWith('+') || /^\d+\./.test(trimmed))) {
        if (trimmed.toLowerCase().includes('reservation note') || trimmed.toLowerCase().includes('tip:')) {
          return;
        }

        // 1. Extract bold items **Spot Name**
        const boldMatches = trimmed.match(/\*\*(.*?)\*\*/g);
        if (boldMatches) {
          boldMatches.forEach(bm => {
            const clean = bm.replace(/\*/g, '').trim();
            if (
              clean.length > 2 &&
              clean.length < 50 &&
              !clean.toLowerCase().includes('day') &&
              !clean.toLowerCase().includes('budget') &&
              !clean.toLowerCase().includes('total') &&
              !clean.toLowerCase().includes('time') &&
              !clean.toLowerCase().includes('morning') &&
              !clean.toLowerCase().includes('afternoon') &&
              !clean.toLowerCase().includes('evening') &&
              !clean.toLowerCase().includes('mid-day') &&
              !clean.toLowerCase().includes('note')
            ) {
              foundLocations.add(clean);
            }
          });
        }

        // 2. Match known spot titles
        Object.keys(SPOT_COORDINATES).forEach(key => {
          const item = SPOT_COORDINATES[key];
          if (item.type === 'city') return;
          if (trimmed.toLowerCase().includes(key)) {
            foundLocations.add(item.title);
          }
        });
      }
    });

    return Array.from(foundLocations);
  }

  function initLeafletMapIfNeeded() {
    if (leafletMap || !window.L || !interactiveLeafletMapDiv) return;

    // Dark Map Tile Layer (CartoDB Dark Matter)
    leafletMap = L.map('interactive-leaflet-map').setView([35.6762, 139.7503], 12);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(leafletMap);

    leafletMarkersGroup = L.layerGroup().addTo(leafletMap);
  }

  function renderMapView() {
    initLeafletMapIfNeeded();

    const rawLocations = extractLocationsFromItinerary(itineraryEditor.value);
    
    // Resolve markers with coordinates
    const spotMarkers = [];
    let extraOffset = 0;

    rawLocations.forEach(locName => {
      const lower = locName.toLowerCase().trim();
      let matched = null;

      for (const k in SPOT_COORDINATES) {
        if (lower.includes(k) || k.includes(lower)) {
          matched = SPOT_COORDINATES[k];
          break;
        }
      }

      if (matched) {
        spotMarkers.push({
          name: matched.title || locName,
          lat: matched.lat,
          lng: matched.lng,
          icon: matched.icon,
          rating: matched.rating,
          type: matched.type
        });
      } else {
        // Pseudo-geocode near Tokyo center with offset
        extraOffset += 0.015;
        spotMarkers.push({
          name: locName,
          lat: 35.6762 + (Math.sin(extraOffset) * 0.04),
          lng: 139.7503 + (Math.cos(extraOffset) * 0.05),
          icon: "📍",
          rating: "Spot Landmark",
          type: "spot"
        });
      }
    });

    if (mapLocationCount) {
      mapLocationCount.textContent = `${spotMarkers.length} marker${spotMarkers.length === 1 ? '' : 's'} displayed`;
    }

    // Populate Selector Dropdown
    if (selMapLocation) {
      selMapLocation.innerHTML = `<option value="ALL">📍 All Itinerary Markers (${spotMarkers.length})</option>`;
      spotMarkers.forEach((m, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = `${m.icon} ${m.name}`;
        selMapLocation.appendChild(opt);
      });

      selMapLocation.onchange = (e) => {
        const val = e.target.value;
        if (val === "ALL") {
          fitAllMarkers(spotMarkers);
        } else {
          const selectedMarker = spotMarkers[parseInt(val)];
          if (selectedMarker && leafletMap) {
            leafletMap.flyTo([selectedMarker.lat, selectedMarker.lng], 15, { duration: 1.2 });
            updateMapFrameLocation(selectedMarker.name + ", Japan");
          }
        }
      };
    }

    // Render Markers on Leaflet Map
    if (leafletMap && leafletMarkersGroup) {
      leafletMarkersGroup.clearLayers();
      const latLngBounds = [];

      spotMarkers.forEach(m => {
        latLngBounds.push([m.lat, m.lng]);

        // Custom HTML Marker Icon
        const customIcon = L.divIcon({
          className: 'custom-map-pin',
          html: `<div style="background:#0f172a; color:#38bdf8; border:2px solid #38bdf8; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; font-size:16px; box-shadow:0 0 10px rgba(56,189,248,0.5);">${m.icon}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });

        const popupContent = `
          <div style="font-family:Inter,sans-serif; color:#f8fafc; padding:4px;">
            <div style="font-weight:700; font-size:0.95rem; margin-bottom:4px; color:#38bdf8;">${m.icon} ${m.name}</div>
            <div style="font-size:0.8rem; color:#94a3b8; margin-bottom:8px;"><i class="fa-solid fa-star" style="color:#f59e0b;"></i> ${m.rating}</div>
            <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(m.name + ' Japan')}" target="_blank" style="display:inline-block; background:#0284c7; color:#fff; padding:4px 10px; border-radius:4px; font-size:0.75rem; text-decoration:none; font-weight:600;">Open in Google Maps ↗</a>
          </div>
        `;

        L.marker([m.lat, m.lng], { icon: customIcon })
          .bindPopup(popupContent)
          .addTo(leafletMarkersGroup);
      });

      if (latLngBounds.length > 0) {
        leafletMap.fitBounds(latLngBounds, { padding: [40, 40] });
      }

      setTimeout(() => {
        leafletMap.invalidateSize();
      }, 200);
    }

    // Populate Location Chips below
    if (mapLocationsList) {
      mapLocationsList.innerHTML = '';

      const overviewChip = document.createElement('button');
      overviewChip.type = 'button';
      overviewChip.className = 'map-spot-chip active';
      overviewChip.innerHTML = `<i class="fa-solid fa-layer-group"></i> Fit All (${spotMarkers.length})`;
      overviewChip.addEventListener('click', () => {
        document.querySelectorAll('.map-spot-chip').forEach(c => c.classList.remove('active'));
        overviewChip.classList.add('active');
        if (selMapLocation) selMapLocation.value = "ALL";
        fitAllMarkers(spotMarkers);
      });
      mapLocationsList.appendChild(overviewChip);

      spotMarkers.forEach((m, idx) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'map-spot-chip';
        chip.innerHTML = `${m.icon} ${m.name}`;
        chip.addEventListener('click', () => {
          document.querySelectorAll('.map-spot-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          if (selMapLocation) selMapLocation.value = idx.toString();
          if (leafletMap) leafletMap.flyTo([m.lat, m.lng], 15, { duration: 1 });
          updateMapFrameLocation(m.name + ", Japan");
        });
        mapLocationsList.appendChild(chip);
      });
    }
  }

  function fitAllMarkers(spotMarkers) {
    if (!leafletMap || !spotMarkers || spotMarkers.length === 0) return;
    const bounds = spotMarkers.map(m => [m.lat, m.lng]);
    leafletMap.fitBounds(bounds, { padding: [40, 40] });
    updateMapFrameLocation("Tokyo, Japan");
  }

  function updateMapFrameLocation(queryLocation) {
    if (!googleMapIframe) return;
    const encoded = encodeURIComponent(queryLocation);
    googleMapIframe.src = `https://maps.google.com/maps?q=${encoded}&t=&z=13&ie=UTF8&iwloc=&output=embed`;
  }

  // --- PAST CHATS / SESSIONS FUNCTIONS ---
  async function loadChatsList() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/chats`);
      const data = await res.json();
      renderChatsList(data.sessions || []);
    } catch (err) {
      console.error('Failed to load chats list:', err);
    }
  }

  function renderChatsList(sessions) {
    if (!sessions || sessions.length === 0) {
      chatsList.innerHTML = '<div style="padding:10px; font-size:0.8rem; color:var(--text-muted);">No previous chats found.</div>';
      return;
    }

    chatsList.innerHTML = '';
    sessions.forEach(s => {
      const item = document.createElement('div');
      item.className = `chat-item ${s.session_id === currentSessionId ? 'active' : ''}`;
      item.setAttribute('data-id', s.session_id);

      const dateStr = s.updated_at ? new Date(s.updated_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

      item.innerHTML = `
        <div>
          <div class="chat-title">${escapeHtml(s.title || 'Trip Session')}</div>
          <div class="chat-date">${dateStr} (${s.message_count || 0} msgs)</div>
        </div>
        <button class="btn-delete-chat" title="Delete Session"><i class="fa-solid fa-trash"></i></button>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.btn-delete-chat')) {
          e.stopPropagation();
          deleteSession(s.session_id);
          return;
        }
        switchSession(s.session_id);
      });

      chatsList.appendChild(item);
    });
  }

  async function startNewChat() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/chats/new`, { method: 'POST' });
      const data = await res.json();
      currentSessionId = data.session_id;
      currentChatTitle.textContent = data.title;
      currentChatId.querySelector('.id-val').textContent = currentSessionId.slice(0, 8) + '...';
      
      // Clear message view & show welcome card
      chatMessages.innerHTML = `
        <div class="welcome-card">
          <div class="welcome-icon">🗺️</div>
          <h3>Welcome to Travel Planner AI!</h3>
          <p>Ask me to plan a trip, fetch live weather using Open-Meteo, estimate budget breakdowns, or update your master <code>itinerary.md</code> file.</p>
          <div class="quick-prompts">
            <span class="prompt-chip" data-prompt="Analyze my current itinerary.md file and suggest specific attraction or dinner restaurant recommendations to insert between my schedule bullets. Highlight any spots that require advance reservations! 🍽️">🍽️ Recommend Dining & Spots (With Reservation Alerts)</span>
            <span class="prompt-chip" data-prompt="What is the live weather in Tokyo and Paris right now?">☀️ Live weather in Tokyo & Paris</span>
            <span class="prompt-chip" data-prompt="I want to plan a 5-day trip to Tokyo with a $2000 budget. I love food and culture. Update my itinerary.md!">🍣 5-Day Tokyo Trip ($2000 budget)</span>
            <span class="prompt-chip" data-prompt="Search for top cultural and food attractions in Kyoto.">🏯 Top spots in Kyoto</span>
          </div>
        </div>
      `;

      // Re-bind quick prompts
      document.querySelectorAll('.prompt-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          chatInput.value = chip.getAttribute('data-prompt');
          chatInput.focus();
        });
      });

      await loadChatsList();
    } catch (err) {
      console.error('Error starting new chat:', err);
    }
  }

  async function switchSession(sessionId) {
    if (sessionId === currentSessionId) return;
    try {
      const res = await fetch(`/api/chats/${sessionId}`);
      if (!res.ok) return;
      const data = await res.json();
      currentSessionId = sessionId;
      currentChatTitle.textContent = data.title || 'Trip Session';
      currentChatId.querySelector('.id-val').textContent = currentSessionId.slice(0, 8) + '...';

      // Render conversation messages
      chatMessages.innerHTML = '';
      (data.messages || []).forEach(msg => {
        appendMessageUI(msg.role, msg.content, msg.tool_traces, msg.proposed_itinerary, msg.auto_applied);
      });

      await loadChatsList();
    } catch (err) {
      console.error('Error switching session:', err);
    }
  }

  async function deleteSession(sessionId) {
    if (!confirm('Are you sure you want to delete this chat history?')) return;
    try {
      await fetch(`/api/chats/${sessionId}`, { method: 'DELETE' });
      if (sessionId === currentSessionId) {
        await startNewChat();
      } else {
        await loadChatsList();
      }
    } catch (err) {
      console.error('Error deleting session:', err);
    }
  }

  // --- CHAT & OBSERVABILITY MESSAGING ---
  async function handleSendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    // Append User Message to UI
    appendMessageUI('user', text);
    chatInput.value = '';

    // Append Loading Assistant Message
    const loadingMessageId = 'loading-' + Date.now();
    appendLoadingMessageUI(loadingMessageId);

    btnSend.disabled = true;
    btnSend.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Thinking...';

    try {
      const res = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: currentSessionId,
          message: text,
          include_itinerary: chkIncludeItinerary.checked,
          auto_allow_edits: selEditMode ? (selEditMode.value === 'auto') : false
        })
      });

      const data = await res.json();
      removeLoadingMessageUI(loadingMessageId);

      // Update currentSessionId if newly assigned
      if (data.session_id) {
        currentSessionId = data.session_id;
      }

      // Append Assistant Response & Tool Traces
      appendMessageUI('assistant', data.reply, data.tool_traces, data.proposed_itinerary, data.auto_applied);

      if (data.auto_applied) {
        await loadItinerary();
        addSystemNotification('⚡ Agent automatically updated itinerary.md on disk!');
      }

      // Reload chats menu to reflect message count & updated title
      await loadChatsList();

    } catch (err) {
      removeLoadingMessageUI(loadingMessageId);
      appendMessageUI('assistant', '⚠️ Error communicating with agent: ' + err.message);
    } finally {
      btnSend.disabled = false;
      btnSend.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send';
    }
  }

  function appendMessageUI(role, content, toolTraces = [], proposedItinerary = null, autoApplied = false) {
    const row = document.createElement('div');
    row.className = `message-row ${role}`;

    const sender = document.createElement('div');
    sender.className = 'message-sender';
    sender.textContent = role === 'user' ? 'You' : 'Travel Planner AI';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    
    // Format assistant text with basic bold / list rendering
    if (role === 'assistant') {
      bubble.innerHTML = formatAssistantResponse(content);
    } else {
      bubble.textContent = content;
    }

    row.appendChild(sender);
    row.appendChild(bubble);

    // Render Tool Execution Stack Trace Accordion if toolTraces exist
    if (role === 'assistant' && toolTraces && toolTraces.length > 0) {
      const traceBox = createToolTraceAccordion(toolTraces);
      row.appendChild(traceBox);
    }

    // Render Permission Approval Card if proposed_itinerary is present
    if (role === 'assistant' && proposedItinerary && !autoApplied) {
      const card = createPermissionApprovalCard(proposedItinerary);
      row.appendChild(card);
      showDiffTab(proposedItinerary);
    }

    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function createPermissionApprovalCard(proposedContent) {
    const card = document.createElement('div');
    card.className = 'permission-approval-card';

    card.innerHTML = `
      <div class="permission-title">
        <i class="fa-solid fa-shield-halved"></i> Permission Requested: Update <code>itinerary.md</code>
      </div>
      <div style="font-size:0.8rem; color:var(--text-muted); line-height:1.4; margin-bottom:8px;">
        The agent proposed changes to your master itinerary. View the visual diff in the Proposed Diff tab above or decide below.
      </div>
      <div class="permission-actions" style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn-view-diff" style="background:#334155; color:#fff; border:1px solid #475569; border-radius:6px; padding:6px 12px; font-size:0.8rem; cursor:pointer;"><i class="fa-solid fa-code-compare"></i> View Proposed Diff</button>
        <button class="btn-approve"><i class="fa-solid fa-check"></i> Approve & Save</button>
        <button class="btn-reject"><i class="fa-solid fa-xmark"></i> Reject Edit</button>
      </div>
    `;

    const btnViewDiffCard = card.querySelector('.btn-view-diff');
    const btnApprove = card.querySelector('.btn-approve');
    const btnReject = card.querySelector('.btn-reject');

    if (btnViewDiffCard) {
      btnViewDiffCard.addEventListener('click', () => {
        showDiffTab(proposedContent);
      });
    }

    btnApprove.addEventListener('click', async () => {
      btnApprove.disabled = true;
      btnApprove.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
      try {
        const res = await fetch(`${API_BASE_URL}/api/itinerary/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: proposedContent })
        });
        if (res.ok) {
          card.innerHTML = `
            <div class="permission-title" style="color:var(--success-color);">
              <i class="fa-solid fa-circle-check"></i> Itinerary Edit Approved & Saved to Disk!
            </div>
          `;
          await loadItinerary();
          hideDiffTab();
        } else {
          alert('Failed to approve itinerary edit.');
        }
      } catch (err) {
        alert('Error approving itinerary edit: ' + err.message);
      }
    });

    btnReject.addEventListener('click', () => {
      card.innerHTML = `
        <div style="font-size:0.8rem; color:var(--text-muted); font-style:italic;">
          ❌ Proposed itinerary edit rejected by user.
        </div>
      `;
      hideDiffTab();
    });

    return card;
  }

  function createToolTraceAccordion(traces) {
    const box = document.createElement('div');
    box.className = 'tool-trace-box';

    const header = document.createElement('div');
    header.className = 'tool-trace-header';

    const callCount = traces.filter(t => t.type === 'call' || t.type === 'response').length;

    header.innerHTML = `
      <div class="trace-title">
        <i class="fa-solid fa-code-branch"></i> Tool Execution Stack Trace (${callCount} tools executed)
      </div>
      <div style="color:var(--text-muted); font-size:0.75rem;">
        <i class="fa-solid fa-chevron-down toggle-icon"></i>
      </div>
    `;

    const body = document.createElement('div');
    body.className = 'trace-body hidden';

    traces.forEach(t => {
      const item = document.createElement('div');
      item.className = 'trace-item';

      if (t.type === 'call') {
        item.innerHTML = `
          <div class="trace-item-header">
            <span class="tool-name-badge"><i class="fa-solid fa-play"></i> CALL: ${escapeHtml(t.tool_name)}</span>
            <span class="tool-duration">${t.timestamp.split('T')[1].slice(0, 8)}</span>
          </div>
          <div class="trace-detail-block">Input Args: ${escapeHtml(JSON.stringify(t.args, null, 2))}</div>
        `;
      } else if (t.type === 'response') {
        item.innerHTML = `
          <div class="trace-item-header">
            <span class="tool-name-badge" style="background-color:#065f46; color:#a7f3d0;"><i class="fa-solid fa-check"></i> RESULT: ${escapeHtml(t.tool_name)}</span>
            <span class="tool-duration">${t.duration_ms || 0}ms</span>
          </div>
          <div class="trace-detail-block">Output: ${escapeHtml(JSON.stringify(t.response, null, 2))}</div>
        `;
      } else if (t.type === 'error') {
        item.innerHTML = `
          <div class="trace-item-header">
            <span class="tool-name-badge" style="background-color:#991b1b; color:#fecaca;"><i class="fa-solid fa-triangle-exclamation"></i> ERROR</span>
          </div>
          <div class="trace-detail-block">${escapeHtml(JSON.stringify(t.response, null, 2))}</div>
        `;
      }
      body.appendChild(item);
    });

    header.addEventListener('click', () => {
      body.classList.toggle('hidden');
      const icon = header.querySelector('.toggle-icon');
      if (body.classList.contains('hidden')) {
        icon.className = 'fa-solid fa-chevron-down toggle-icon';
      } else {
        icon.className = 'fa-solid fa-chevron-up toggle-icon';
      }
    });

    box.appendChild(header);
    box.appendChild(body);
    return box;
  }

  function appendLoadingMessageUI(id) {
    const row = document.createElement('div');
    row.className = 'message-row assistant';
    row.id = id;

    row.innerHTML = `
      <div class="message-sender">Travel Planner AI</div>
      <div class="message-bubble" style="color:var(--text-muted); display:flex; align-items:center; gap:8px;">
        <i class="fa-solid fa-compass fa-spin" style="color:var(--primary-color);"></i>
        Analyzing travel request, checking live weather & planning itinerary...
      </div>
    `;

    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function removeLoadingMessageUI(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  function addSystemNotification(text) {
    const notification = document.createElement('div');
    notification.style.cssText = 'background:#1e293b; border:1px solid var(--primary-color); color:#38bdf8; padding:8px 12px; border-radius:8px; font-size:0.8rem; text-align:center; margin:10px auto; max-width:80%;';
    notification.innerHTML = `<i class="fa-solid fa-info-circle"></i> ${escapeHtml(text)}`;
    chatMessages.appendChild(notification);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function formatAssistantResponse(text) {
    if (window.marked) {
      return marked.parse(text || '');
    }
    return escapeHtml(text).replace(/\n/g, '<br>');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
});
