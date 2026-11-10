/**
 * ============================================================================
 * Virtual Chemical Storage Room - Dashboard UI Controller
 * Engineering Final-Year Project Presentation
 * ============================================================================
 * Connects the Simulation Engine to the interactive 2D Blueprint,
 * Live Multi-Zone Chart.js Visualizer, KPI Metrics, and Audit Logger.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Instantiate Simulation Engine
    const sim = new window.StorageRoomSimulation();
    let trendChart = null;
    let auditLogs = [];

    // --- DOM Element References ---
    // Controls
    const btnStart = document.getElementById('btn-start');
    const btnPause = document.getElementById('btn-pause');
    const btnReset = document.getElementById('btn-reset');
    const simStateText = document.getElementById('sim-state-text');
    const pulseIndicator = document.getElementById('pulse-indicator');
    const headerStatusText = document.getElementById('header-status-text');
    const liveClock = document.getElementById('live-clock');

    // Event Injections
    const btnToggleDoor = document.getElementById('btn-toggle-door');
    const badgeDoor = document.getElementById('badge-door');
    const btnToggleCooling = document.getElementById('btn-toggle-cooling');
    const badgeCooling = document.getElementById('badge-cooling');
    const sliderAmbient = document.getElementById('slider-ambient');
    const labelAmbientVal = document.getElementById('label-ambient-val');

    // 2D Blueprint Elements
    const roomBlueprint = document.getElementById('room-blueprint');
    const blueprintHvac = document.getElementById('blueprint-hvac');
    const blueprintHvacText = document.getElementById('blueprint-hvac-text');
    const blueprintDoorTag = document.getElementById('blueprint-door-tag');

    // KPI Header Cards
    const kpiStatusVal = document.getElementById('kpi-status-val');
    const kpiStatusBadge = document.getElementById('kpi-status-badge');
    const kpiAvgTemp = document.getElementById('kpi-avg-temp');
    const kpiHvacVal = document.getElementById('kpi-hvac-val');
    const kpiHvacBadge = document.getElementById('kpi-hvac-badge');
    const kpiDoorVal = document.getElementById('kpi-door-val');
    const kpiDoorBadge = document.getElementById('kpi-door-badge');
    const kpiAmbientSub = document.getElementById('kpi-ambient-sub');

    // Logs Container
    const eventsLogContainer = document.getElementById('events-log-container');
    const btnExportLog = document.getElementById('btn-export-log');

    // Settings Modal
    const modalSettings = document.getElementById('modal-settings');
    const btnOpenSettings = document.getElementById('btn-open-settings');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnCancelSettings = document.getElementById('btn-cancel-settings');
    const btnSaveSettings = document.getElementById('btn-save-settings');
    const cfgMaxSafe = document.getElementById('cfg-max-safe');
    const cfgCritHigh = document.getElementById('cfg-crit-high');
    const cfgMinSafe = document.getElementById('cfg-min-safe');

    // --- Live Clock Timer ---
    function updateClock() {
        const now = new Date();
        liveClock.textContent = now.toLocaleTimeString();
    }
    setInterval(updateClock, 1000);
    updateClock();

    // ========================================================================
    // 1. Chart.js Multi-Zone Temperature Trend Initialization
    // ========================================================================
    function initChart() {
        const ctx = document.getElementById('trendChart').getContext('2d');
        
        trendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'S1 – Entrance (Door)',
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.05)',
                        borderWidth: 2.2,
                        pointRadius: 2,
                        pointHoverRadius: 5,
                        data: [],
                        tension: 0.35,
                        fill: false
                    },
                    {
                        label: 'S2 – Center Room',
                        borderColor: '#8b5cf6',
                        backgroundColor: 'rgba(139, 92, 246, 0.05)',
                        borderWidth: 2.2,
                        pointRadius: 2,
                        pointHoverRadius: 5,
                        data: [],
                        tension: 0.35,
                        fill: false
                    },
                    {
                        label: 'S3 – Near Cooling HVAC',
                        borderColor: '#06b6d4',
                        backgroundColor: 'rgba(6, 182, 212, 0.05)',
                        borderWidth: 2.2,
                        pointRadius: 2,
                        pointHoverRadius: 5,
                        data: [],
                        tension: 0.35,
                        fill: false
                    },
                    {
                        label: 'S4 – Chemical Racks',
                        borderColor: '#f97316',
                        backgroundColor: 'rgba(249, 115, 22, 0.05)',
                        borderWidth: 2.2,
                        pointRadius: 2,
                        pointHoverRadius: 5,
                        data: [],
                        tension: 0.35,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            boxWidth: 12,
                            font: { family: 'Inter', size: 11, weight: '600' },
                            color: '#334155',
                            padding: 14
                        }
                    },
                    tooltip: {
                        backgroundColor: '#0f172a',
                        titleFont: { family: 'Inter', size: 12, weight: 'bold' },
                        bodyFont: { family: 'Inter', size: 11 },
                        padding: 10,
                        cornerRadius: 6,
                        callbacks: {
                            label: function(context) {
                                return ` ${context.dataset.label}: ${context.parsed.y.toFixed(1)}°C`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: '#f1f5f9' },
                        ticks: {
                            font: { family: 'Inter', size: 10 },
                            color: '#64748b',
                            maxTicksLimit: 10
                        }
                    },
                    y: {
                        min: 15,
                        max: 42,
                        grid: { color: '#e2e8f0' },
                        ticks: {
                            font: { family: 'Inter', size: 10 },
                            color: '#64748b',
                            stepSize: 5,
                            callback: function(val) { return val + '°C'; }
                        },
                        title: {
                            display: true,
                            text: 'Temperature (°C)',
                            font: { family: 'Inter', size: 11, weight: '600' },
                            color: '#64748b'
                        }
                    }
                },
                animation: { duration: 0 } // Instant snappy real-time updates
            }
        });
    }

    // ========================================================================
    // 2. UI Binding & Event Handlers
    // ========================================================================
    
    // Master Simulation Controls
    btnStart.addEventListener('click', () => {
        sim.start();
        updateSimulationStatusUI(true);
    });

    btnPause.addEventListener('click', () => {
        sim.pause();
        updateSimulationStatusUI(false);
    });

    btnReset.addEventListener('click', () => {
        sim.reset();
        updateSimulationStatusUI(false);
        eventsLogContainer.innerHTML = '';
        auditLogs = [];
        syncEventControlsUI();
    });

    function updateSimulationStatusUI(running) {
        if (running) {
            simStateText.textContent = 'Running';
            simStateText.style.color = 'var(--status-normal)';
            pulseIndicator.className = 'pulse-dot';
            headerStatusText.textContent = 'System Active (Monitoring)';
        } else {
            simStateText.textContent = 'Paused';
            simStateText.style.color = 'var(--text-muted)';
            pulseIndicator.className = 'pulse-dot paused';
            headerStatusText.textContent = 'System Paused';
        }
    }

    // Door Toggle Button
    btnToggleDoor.addEventListener('click', () => {
        sim.setDoorState(!sim.doorOpen);
        syncEventControlsUI();
    });

    // Cooling Failure Toggle Button
    btnToggleCooling.addEventListener('click', () => {
        sim.setCoolingState(!sim.coolingFailed);
        syncEventControlsUI();
    });

    // Ambient Temperature Slider
    sliderAmbient.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        labelAmbientVal.textContent = `${val.toFixed(1)}°C`;
        sim.setAmbientTemp(val);
        kpiAmbientSub.textContent = `Ambient Air: ${val.toFixed(1)}°C`;
    });

    // Synchronize buttons, badges and 2D visual elements
    function syncEventControlsUI() {
        // Door UI
        if (sim.doorOpen) {
            btnToggleDoor.textContent = '🚪 Close Entrance Door';
            btnToggleDoor.className = 'btn-toggle active-warning';
            badgeDoor.textContent = 'OPEN';
            badgeDoor.className = 'badge badge-warning';
            roomBlueprint.classList.add('door-is-open');
            blueprintDoorTag.textContent = 'DOOR OPEN (DRAFT ACTIVE)';
            blueprintDoorTag.style.background = '#fffbeb';
            blueprintDoorTag.style.color = '#b45309';

            kpiDoorVal.textContent = 'Door OPEN';
            kpiDoorBadge.textContent = 'Open (Draft)';
            kpiDoorBadge.className = 'badge badge-warning';
        } else {
            btnToggleDoor.textContent = '🚪 Open Door';
            btnToggleDoor.className = 'btn-toggle';
            badgeDoor.textContent = 'Closed';
            badgeDoor.className = 'badge badge-normal';
            roomBlueprint.classList.remove('door-is-open');
            blueprintDoorTag.textContent = 'MAIN ENTRANCE';
            blueprintDoorTag.style.background = '#f1f5f9';
            blueprintDoorTag.style.color = '#475569';

            kpiDoorVal.textContent = 'Door Closed';
            kpiDoorBadge.textContent = 'Secure';
            kpiDoorBadge.className = 'badge badge-normal';
        }

        // Cooling Unit UI
        if (sim.coolingFailed) {
            btnToggleCooling.textContent = '❄️ Restore Cooling System';
            btnToggleCooling.className = 'btn-toggle active-danger';
            badgeCooling.textContent = 'FAILED';
            badgeCooling.className = 'badge badge-critical';
            blueprintHvac.classList.add('failure');
            blueprintHvacText.textContent = 'COOLING UNIT OFFLINE';

            kpiHvacVal.textContent = 'Cooling OFFLINE';
            kpiHvacVal.style.color = 'var(--status-critical)';
            kpiHvacBadge.textContent = 'Failure';
            kpiHvacBadge.className = 'badge badge-critical';
        } else {
            btnToggleCooling.textContent = '❄️ Simulate Cooling Failure';
            btnToggleCooling.className = 'btn-toggle';
            badgeCooling.textContent = 'Active';
            badgeCooling.className = 'badge badge-normal';
            blueprintHvac.classList.remove('failure');
            blueprintHvacText.textContent = 'HVAC COOLING CHILLER';

            kpiHvacVal.textContent = 'Chilling (Active)';
            kpiHvacVal.style.color = 'var(--text-main)';
            kpiHvacBadge.textContent = 'Online';
            kpiHvacBadge.className = 'badge badge-normal';
        }
    }

    // Automated Demo Scenarios (One-Click PPT Presenter)
    document.querySelectorAll('.btn-scenario').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const scenarioId = btn.getAttribute('data-scenario');
            sim.runScenario(scenarioId);
            updateSimulationStatusUI(true);
            syncEventControlsUI();
        });
    });

    // ========================================================================
    // 3. Settings Modal Handlers
    // ========================================================================
    btnOpenSettings.addEventListener('click', () => {
        cfgMaxSafe.value = sim.thresholds.maxSafe;
        cfgCritHigh.value = sim.thresholds.criticalHigh;
        cfgMinSafe.value = sim.thresholds.minSafe;
        modalSettings.classList.add('open');
    });

    function closeModal() {
        modalSettings.classList.remove('open');
    }

    btnCloseModal.addEventListener('click', closeModal);
    btnCancelSettings.addEventListener('click', closeModal);

    btnSaveSettings.addEventListener('click', () => {
        sim.thresholds.maxSafe = parseFloat(cfgMaxSafe.value) || 27.0;
        sim.thresholds.criticalHigh = parseFloat(cfgCritHigh.value) || 29.0;
        sim.thresholds.minSafe = parseFloat(cfgMinSafe.value) || 18.0;
        closeModal();
        sim.logEvent(`Safety thresholds reconfigured: Max Safe = ${sim.thresholds.maxSafe}°C, Critical = ${sim.thresholds.criticalHigh}°C`, 'info');
    });

    // ========================================================================
    // 4. Audit Log Rendering & Export
    // ========================================================================
    sim.onEventLogged = (eventObj) => {
        auditLogs.unshift(eventObj); // Keep in memory

        const entry = document.createElement('div');
        entry.className = `event-entry alert-${eventObj.type}`;
        
        let typeBadge = 'INFO';
        if (eventObj.type === 'warning') typeBadge = '⚠️ WARNING';
        if (eventObj.type === 'critical') typeBadge = '🚨 CRITICAL';
        if (eventObj.type === 'success') typeBadge = '✅ RECOVERY';

        entry.innerHTML = `
            <div class="event-meta">
                <span>${eventObj.time}</span>
                <span>${typeBadge}</span>
            </div>
            <div class="event-text">${eventObj.message}</div>
        `;

        eventsLogContainer.prepend(entry);

        // Keep DOM lightweight
        if (eventsLogContainer.children.length > 40) {
            eventsLogContainer.removeChild(eventsLogContainer.lastChild);
        }
    };

    // Export Log to CSV/TXT file for engineering documentation
    btnExportLog.addEventListener('click', () => {
        if (auditLogs.length === 0) {
            alert('No event logs recorded yet.');
            return;
        }

        let csvContent = 'data:text/csv;charset=utf-8,Timestamp,Severity,Message\n';
        auditLogs.forEach(log => {
            csvContent += `"${log.time}","${log.type.toUpperCase()}","${log.message.replace(/"/g, '""')}"\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `ChemStorage_AuditLog_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // ========================================================================
    // 5. Main Simulation Synchronizer (Fires on each engine tick)
    // ========================================================================
    sim.onTick = (snapshot) => {
        // Sync controls in case auto-scenario triggered a state change
        syncEventControlsUI();

        // 1. Update KPI Cards
        kpiAvgTemp.textContent = `${snapshot.metrics.avgTemp}°C`;
        
        if (snapshot.systemStatus === 'CRITICAL') {
            kpiStatusVal.textContent = 'HAZARD';
            kpiStatusVal.style.color = 'var(--status-critical)';
            kpiStatusBadge.textContent = 'Critical Alert';
            kpiStatusBadge.className = 'badge badge-critical';
            pulseIndicator.className = 'pulse-dot alert';
        } else if (snapshot.systemStatus === 'WARNING') {
            kpiStatusVal.textContent = 'WARNING';
            kpiStatusVal.style.color = 'var(--status-warning)';
            kpiStatusBadge.textContent = 'Threshold Breach';
            kpiStatusBadge.className = 'badge badge-warning';
            pulseIndicator.className = 'pulse-dot alert';
        } else {
            kpiStatusVal.textContent = 'SAFE';
            kpiStatusVal.style.color = 'var(--status-normal)';
            kpiStatusBadge.textContent = 'Normal';
            kpiStatusBadge.className = 'badge badge-normal';
            if (snapshot.isRunning) pulseIndicator.className = 'pulse-dot';
        }

        // 2. Update 2D Blueprint Markers and Sensor Detail Cards
        for (const id in snapshot.sensors) {
            const s = snapshot.sensors[id];
            const state = snapshot.sensorAlertStates[id];

            // 2D Blueprint Marker Updates
            const mapTag = document.getElementById(`map-temp-${id}`);
            const mapMarker = document.getElementById(`sensor-${id.toLowerCase()}-marker`);
            
            if (mapTag) mapTag.textContent = `${s.currentTemp.toFixed(1)}°C`;
            if (mapMarker) {
                mapMarker.className = `sensor-node status-${state}`;
            }

            // Sensor Detail Card Updates
            const cardTemp = document.getElementById(`card-temp-${id}`);
            const badgeStatus = document.getElementById(`badge-status-${id}`);
            const detailCard = document.getElementById(`card-${id}`);

            if (cardTemp) cardTemp.textContent = `${s.currentTemp.toFixed(1)}°C`;
            if (badgeStatus) {
                badgeStatus.textContent = state.toUpperCase();
                badgeStatus.className = `badge badge-${state}`;
            }
            if (detailCard) {
                detailCard.className = `sensor-detail-card ${state !== 'normal' ? 'card-' + state : ''}`;
            }
        }

        // 3. Update Chart.js Data Feed
        if (trendChart && snapshot.history.labels.length > 0) {
            trendChart.data.labels = snapshot.history.labels;
            trendChart.data.datasets[0].data = snapshot.history['S1'];
            trendChart.data.datasets[1].data = snapshot.history['S2'];
            trendChart.data.datasets[2].data = snapshot.history['S3'];
            trendChart.data.datasets[3].data = snapshot.history['S4'];
            trendChart.update();
        }
    };

    // ========================================================================
    // 6. Initialization
    // ========================================================================
    initChart();
    sim.logEvent('System initialized and ready for simulation', 'info');
    sim.onTick(sim.getSnapshot()); // Initial render
});
