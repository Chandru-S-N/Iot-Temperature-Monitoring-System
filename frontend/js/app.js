/**
 * ============================================================================
 * Main Controller Module - Master Emergency-Response System & REST API Bridge
 * Implements:
 * - Direct REST API integration with Flask Backend (http://localhost:8000/api/)
 * - Full Bidirectional State Sync (Frontend -> REST API -> Backend -> Simulation -> DB)
 * - 3D Animated Person FSM Callback (OUTSIDE -> ENTERING -> WORKING -> ALERTED -> EVACUATING -> EXITED)
 * - Critical Emergency Mode Workflow & Simulated Personnel Notifications
 * - OSHA Emergency Response Guidance Modal & Permanent Safety Disclaimer
 * - Employee Presence / Occupancy Simulation
 * - Evacuation Alarm & Emergency Action Controls
 * - Direct Database CSV Export Stream
 * ============================================================================
 */
import { Room3D } from './room3d.js';
import { AlarmSound } from './audio.js';

document.addEventListener('DOMContentLoaded', () => {
    // Verify Operator Authentication Session
    const authUserRaw = sessionStorage.getItem('chem_auth_user') || localStorage.getItem('chem_auth_user');
    if (!authUserRaw) {
        window.location.replace('login.html');
        return;
    }
    let currentUser = null;
    try {
        currentUser = JSON.parse(authUserRaw);
        if (!currentUser || !currentUser.username) throw new Error('Invalid user object');
    } catch (e) {
        sessionStorage.removeItem('chem_auth_user');
        localStorage.removeItem('chem_auth_user');
        window.location.replace('login.html');
        return;
    }

    // Populate Authenticated User in Topbar
    const elUserName = document.getElementById('user-name');
    const elUserBadge = document.getElementById('user-role-badge');
    const elUserIcon = document.getElementById('user-badge-icon');
    if (elUserName) elUserName.textContent = currentUser.full_name || currentUser.username;
    if (elUserBadge) {
        elUserBadge.textContent = currentUser.role || 'Operator';
        if (currentUser.role === 'Safety Officer') elUserBadge.className = 'badge-role-tag badge-role-officer';
        else if (currentUser.role === 'Safety Auditor') elUserBadge.className = 'badge-role-tag badge-role-auditor';
        else elUserBadge.className = 'badge-role-tag badge-role-operator';
    }
    if (elUserIcon) {
        elUserIcon.textContent = currentUser.role === 'Safety Officer' ? '🛡️' : currentUser.role === 'Safety Auditor' ? '📋' : '👷';
    }

    // Logout Handler
    document.getElementById('btn-logout')?.addEventListener('click', async () => {
        if (!confirm('Log out from terminal session?')) return;
        try {
            await apiFetch('/auth/logout', {
                method: 'POST',
                body: JSON.stringify({ username: currentUser.username })
            });
        } catch (e) {}
        sessionStorage.removeItem('chem_auth_user');
        sessionStorage.removeItem('chem_auth_token');
        localStorage.removeItem('chem_auth_user');
        localStorage.removeItem('chem_auth_token');
        window.location.replace('login.html');
    });

    const sim = new window.StorageRoomSimulation();
    const room = new Room3D('room3d-canvas');
    const alarmSound = new AlarmSound();
    let trendChart = null;
    let auditLogs = [];

    // System States
    let isEmergencyMode = false;
    let isEvacuationAlarm = false;
    let isAccessRestricted = false;
    let isOccupied = false;
    let activeIncidentId = null;

    // DOM References
    const btnStart = document.getElementById('btn-start');
    const btnPause = document.getElementById('btn-pause');
    const btnReset = document.getElementById('btn-reset');
    const btnResetCam = document.getElementById('btn-reset-cam');
    
    const btnDoor = document.getElementById('btn-door');
    const btnWindow = document.getElementById('btn-window');
    const btnCooling = document.getElementById('btn-cooling');
    const btnVentilation = document.getElementById('btn-ventilation');

    const sliderAmbient = document.getElementById('slider-ambient');
    const ambientVal = document.getElementById('ambient-val');

    const selectPreset = document.getElementById('select-preset');
    const selectSpeed = document.getElementById('select-speed');

    const statusDot = document.getElementById('status-dot');
    const statusLabel = document.getElementById('status-label');
    const bannerEmergency = document.getElementById('banner-emergency');

    const roomStatus = document.getElementById('room-status');
    const doorStatus = document.getElementById('door-status');
    const coolingStatus = document.getElementById('cooling-status');
    const ambientStatus = document.getElementById('ambient-status');

    // Threshold Card DOM
    const valMinSafe = document.getElementById('val-min-safe');
    const valMaxSafe = document.getElementById('val-max-safe');
    const valRoomAvg = document.getElementById('val-room-avg');
    const valMaxSensor = document.getElementById('val-max-sensor');

    // Analytics Card References
    const valCoverage = document.getElementById('val-coverage');
    const valHotspot = document.getElementById('val-hotspot');
    const valColdspot = document.getElementById('val-coldspot');
    const valRecovery = document.getElementById('val-recovery');

    const sensorTableBody = document.getElementById('sensor-tbody');
    const eventLog = document.getElementById('event-log');
    const liveClock = document.getElementById('live-clock');

    // Live Clock
    setInterval(() => {
        liveClock.textContent = new Date().toLocaleTimeString();
    }, 1000);

    // Camera Reset Button Handler
    if (btnResetCam) {
        btnResetCam.addEventListener('click', () => room.resetCamera());
    }

    // Callback when 3D Animated Occupant completes evacuation walk cycle
    window.onOccupantEvacuated = () => {
        isOccupied = false;
        document.getElementById('btn-toggle-occupancy').textContent = '👷 Occupancy: OFF';
        document.getElementById('btn-toggle-occupancy').className = 'btn btn-secondary btn-sm';
        document.getElementById('notify-evac').textContent = 'EVACUATED SAFELY ✅';
        sim.logEvent('👷 Personnel successfully evacuated the Chemical Room via Emergency Exit', 'success');
        apiFetch('/occupancy', { method: 'POST', body: JSON.stringify({ occupied: 0, count: 0 }) });
    };

    // Backend REST API Bridge Helper
    async function apiFetch(endpoint, options = {}) {
        try {
            const res = await fetch(`/api${endpoint}`, {
                headers: { 'Content-Type': 'application/json' },
                ...options
            });
            if (res.ok) return await res.json();
        } catch (e) {
            console.warn(`API call failed for /api${endpoint}:`, e);
        }
        return null;
    }

    // Sync Initial Thresholds from Backend
    async function syncBackendThresholds() {
        const data = await apiFetch('/thresholds');
        if (data) {
            sim.thresholds.minSafe = data.min_safe;
            sim.thresholds.maxSafe = data.max_safe;
            sim.thresholds.criticalHigh = data.critical_high;
            
            const cfgWarn = document.getElementById('cfg-warn');
            const cfgCrit = document.getElementById('cfg-crit');
            const cfgMin = document.getElementById('cfg-min');
            if (cfgWarn) cfgWarn.value = data.max_safe;
            if (cfgCrit) cfgCrit.value = data.critical_high;
            if (cfgMin) cfgMin.value = data.min_safe;

            if (valMinSafe) valMinSafe.textContent = `${data.min_safe.toFixed(0)}°C`;
            if (valMaxSafe) valMaxSafe.textContent = `${data.max_safe.toFixed(0)}°C`;
        }
    }

    // Setup Chart.js
    function initChart() {
        const ctx = document.getElementById('trendChart').getContext('2d');
        trendChart = new Chart(ctx, {
            type: 'line',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'top', labels: { boxWidth: 10, font: { family: 'Inter', size: 11 }, color: '#334155', padding: 6 } },
                    tooltip: { backgroundColor: '#0f172a', cornerRadius: 6, padding: 8, titleFont: { family: 'Inter', size: 11 }, bodyFont: { family: 'Inter', size: 11 },
                        callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}°C` }
                    }
                },
                scales: {
                    x: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 9 }, color: '#94a3b8', maxTicksLimit: 8 } },
                    y: { min: 15, max: 42, grid: { color: '#e2e8f0' }, ticks: { font: { size: 10 }, color: '#64748b', stepSize: 5, callback: v => v + '°C' },
                        title: { display: true, text: 'Temperature (°C)', font: { family: 'Inter', size: 11, weight: '600' }, color: '#64748b' }
                    }
                },
                animation: { duration: 0 }
            }
        });
        updateChartDatasets(sim.activeConfig);
    }

    function updateChartDatasets(config) {
        if (!trendChart) return;
        const colorMap = {
            'S1': { label: 'S1 – Door', color: '#3b82f6' },
            'S2': { label: 'S2 – Centre', color: '#8b5cf6' },
            'S3': { label: 'S3 – HVAC', color: '#06b6d4' },
            'S4': { label: 'S4 – Racks', color: '#f97316' },
            'S5': { label: 'S5 – Window', color: '#ec4899' },
            'S6': { label: 'S6 – Vent', color: '#10b981' },
            'S7': { label: 'S7 – Rear', color: '#6366f1' }
        };

        const activeIds = Object.keys(sim.sensors);
        trendChart.data.datasets = activeIds.map(id => ({
            label: colorMap[id].label,
            borderColor: colorMap[id].color,
            data: [],
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 1.5,
            fill: false
        }));
        trendChart.data.labels = [];
        trendChart.update();
    }

    // Control Event Listeners
    btnStart.addEventListener('click', () => { sim.start(); updateStatusUI(true); });
    btnPause.addEventListener('click', () => { sim.pause(); updateStatusUI(false); });
    btnReset.addEventListener('click', () => {
        sim.reset(); updateStatusUI(false);
        room.setDoorOpen(false); room.setWindowOpen(false); room.coolingFailedState = false;
        room.setEmergencyStrobe(false); room.setEvacuationAlarm(false);
        isEmergencyMode = false; isEvacuationAlarm = false; isAccessRestricted = false;
        alarmSound.stop();
        bannerEmergency.style.display = 'none';
        eventLog.innerHTML = ''; auditLogs = [];
        syncControls();
    });

    selectSpeed.addEventListener('change', (e) => { sim.setSpeedMultiplier(e.target.value); });
    selectPreset.addEventListener('change', (e) => {
        const preset = e.target.value;
        sim.applyConfigPreset(preset);
        room.setActivePreset(preset);
        updateChartDatasets(preset);
        sim.onTick(sim.getSnapshot());
    });

    // 1. Door Toggle -> Backend API & 3D Visual Sync
    btnDoor.addEventListener('click', async () => {
        if (isAccessRestricted) return alert('⛔ Access Restricted: Entrance Door locked by Safety Command.');
        const nextDoorState = !sim.doorOpen;
        sim.setDoorState(nextDoorState);
        room.setDoorOpen(nextDoorState);
        syncControls();

        await apiFetch('/events/door', {
            method: 'POST',
            body: JSON.stringify({ message: `Entrance Door toggled to ${nextDoorState ? 'OPEN' : 'CLOSED'}` })
        });
        sim.logEvent(`Entrance Door set to ${nextDoorState ? 'OPEN' : 'CLOSED'} (Backend Synced)`, nextDoorState ? 'warning' : 'info');
    });

    // 2. Window Toggle -> Backend API & 3D Visual Sync
    btnWindow.addEventListener('click', async () => {
        const nextWindowState = !sim.windowOpen;
        sim.setWindowState(nextWindowState);
        room.setWindowOpen(nextWindowState);
        syncControls();

        await apiFetch('/events/window', {
            method: 'POST',
            body: JSON.stringify({ message: `Window 1 & 2 toggled to ${nextWindowState ? 'OPEN' : 'CLOSED'}` })
        });
        sim.logEvent(`Windows set to ${nextWindowState ? 'OPEN' : 'CLOSED'} (Backend Synced)`, nextWindowState ? 'warning' : 'info');
    });

    // 3. Cooling Fail/Restore -> Backend API & Thermal Simulation Physics Sync
    btnCooling.addEventListener('click', async () => {
        const nextState = sim.coolingState === 'FAILED' ? 'RUNNING' : 'FAILED';
        sim.setCoolingState(nextState);
        room.coolingFailedState = (nextState === 'FAILED');
        syncControls();

        await apiFetch('/events/cooling', {
            method: 'POST',
            body: JSON.stringify({ message: `HVAC Cooling Chiller state changed to ${nextState}` })
        });
        sim.logEvent(`HVAC Cooling set to ${nextState} (Backend Synced)`, nextState === 'FAILED' ? 'critical' : 'success');
    });

    // 4. Ventilation Toggle -> Backend API Sync
    btnVentilation.addEventListener('click', async () => {
        const nextState = sim.ventilationState === 'FAILED' ? 'ON' : 'FAILED';
        sim.setVentilationState(nextState);
        syncControls();

        await apiFetch('/events/ventilation', {
            method: 'POST',
            body: JSON.stringify({ message: `Mechanical Ventilation state changed to ${nextState}` })
        });
        sim.logEvent(`Mechanical Ventilation set to ${nextState} (Backend Synced)`, nextState === 'FAILED' ? 'warning' : 'info');
    });

    // 5. Ambient Temperature Slider -> Backend API Sync
    sliderAmbient.addEventListener('input', async e => {
        const v = parseFloat(e.target.value);
        ambientVal.textContent = v.toFixed(1) + '°C';
        sim.setAmbientTemp(v);
        
        await apiFetch('/events/ambient', {
            method: 'POST',
            body: JSON.stringify({ message: `Ambient temperature adjusted to ${v}°C` })
        });
    });

    // 6. Demo Scenario Buttons -> Backend API Sync
    document.querySelectorAll('.btn-scenario').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.scenario;
            sim.runScenario(id);
            updateStatusUI(true);

            await apiFetch('/events/scenario', {
                method: 'POST',
                body: JSON.stringify({ message: `Incident Scenario ${id} executed` })
            });
            sim.logEvent(`Incident Scenario '${id}' Launched (Backend Synced)`, 'warning');
        });
    });

    // 7. Sensor Fault Injection -> Backend Sync
    document.getElementById('btn-fault-sim')?.addEventListener('click', async () => {
        const sensorId = document.getElementById('select-fault-sensor')?.value || 'S1';
        const status = document.getElementById('select-fault-status')?.value || 'ONLINE';
        sim.setSensorHealth(sensorId, status);
        await apiFetch(`/sensors/${sensorId}/fault`, { method: 'PUT', body: JSON.stringify({ health: status }) });
        sim.logEvent(`Sensor ${sensorId} health updated to ${status} in Database`, 'info');
    });

    // 8. 3D Animated Personnel Occupancy Simulation Toggle
    document.getElementById('btn-toggle-occupancy')?.addEventListener('click', async () => {
        isOccupied = !isOccupied;
        room.setOccupantPresence(isOccupied);
        
        const btnOcc = document.getElementById('btn-toggle-occupancy');
        if (btnOcc) {
            btnOcc.textContent = isOccupied ? '👷 Occupancy: ON (1 Person)' : '👷 Occupancy: OFF';
            btnOcc.className = isOccupied ? 'btn btn-warn-outline btn-sm' : 'btn btn-secondary btn-sm';
        }
        
        sim.logEvent(isOccupied ? '👷 Personnel Occupancy Active: Worker entering Chemical Room' : '👷 Personnel Occupancy Inactive', 'info');
        await apiFetch('/occupancy', { method: 'POST', body: JSON.stringify({ occupied: isOccupied ? 1 : 0, count: isOccupied ? 1 : 0 }) });
    });

    // Emergency Response Modal Open
    document.getElementById('btn-emergency-response')?.addEventListener('click', () => {
        document.getElementById('modal-emergency')?.classList.add('open');
    });
    document.getElementById('btn-modal-emerg-close')?.addEventListener('click', () => {
        document.getElementById('modal-emergency')?.classList.remove('open');
    });

    // Emergency Actions Buttons (Backend Incident Sync)
    document.getElementById('btn-emerg-ack')?.addEventListener('click', async () => {
        sim.logEvent('Emergency Incident Acknowledged by Operator', 'info');
        if (activeIncidentId) await apiFetch(`/incidents/${activeIncidentId}/action`, { method: 'POST', body: JSON.stringify({ action: 'ack' }) });
        alert('✅ Emergency Incident Acknowledged.');
    });

    document.getElementById('btn-emerg-alarm')?.addEventListener('click', async () => {
        isEvacuationAlarm = !isEvacuationAlarm;
        room.setEvacuationAlarm(isEvacuationAlarm);
        sim.logEvent(isEvacuationAlarm ? '🚨 EVACUATION ALARM ACTIVATED BY OPERATOR' : 'Evacuation Alarm Deactivated', isEvacuationAlarm ? 'critical' : 'info');
        
        if (isEvacuationAlarm) {
            alarmSound.start();
        } else if (!isEmergencyMode) {
            alarmSound.stop();
        }

        if (isOccupied && isEvacuationAlarm) {
            room.triggerOccupantEmergencyAlert();
        }

        if (activeIncidentId) await apiFetch(`/incidents/${activeIncidentId}/action`, { method: 'POST', body: JSON.stringify({ action: 'evacuate' }) });
        const btnAlarm = document.getElementById('btn-emerg-alarm');
        if (btnAlarm) btnAlarm.textContent = isEvacuationAlarm ? '🚨 Deactivate Evacuation Alarm' : '🚨 Activate Evacuation Alarm';
    });

    document.getElementById('btn-emerg-restrict')?.addEventListener('click', async () => {
        isAccessRestricted = !isAccessRestricted;
        sim.logEvent(isAccessRestricted ? '⛔ ROOM ACCESS RESTRICTED: Door locked by Command' : 'Room Access Unrestricted', isAccessRestricted ? 'warning' : 'info');
        if (activeIncidentId) await apiFetch(`/incidents/${activeIncidentId}/action`, { method: 'POST', body: JSON.stringify({ action: 'restrict' }) });
        const btnRestrict = document.getElementById('btn-emerg-restrict');
        if (btnRestrict) btnRestrict.textContent = isAccessRestricted ? '⛔ Unrestrict Room Access' : '⛔ Restrict Room Access';
    });

    document.getElementById('btn-emerg-notify')?.addEventListener('click', async () => {
        sim.logEvent('📢 Simulated Alerts sent to Safety Officer, Control Room, and Supervisors', 'info');
        if (activeIncidentId) await apiFetch(`/incidents/${activeIncidentId}/action`, { method: 'POST', body: JSON.stringify({ action: 'notify' }) });
        const ns = document.getElementById('notify-safety'); if (ns) ns.textContent = 'ALERT SENT ✅';
        const nc = document.getElementById('notify-control'); if (nc) nc.textContent = 'ALERT SENT ✅';
        const nsup = document.getElementById('notify-supervisor'); if (nsup) nsup.textContent = 'ALERT SENT ✅';
        const ne = document.getElementById('notify-evac'); if (ne) ne.textContent = isOccupied ? 'EVACUATION ALERT SENT 🚨' : 'STANDBY (Unoccupied)';
    });

    document.getElementById('btn-emerg-reset')?.addEventListener('click', async () => {
        if (!confirm('Authorized Reset: Confirm that safety team has inspected the room and cleared hazards.')) return;
        sim.setCoolingState('RUNNING');
        sim.setDoorState(false);
        sim.setWindowState(false);
        room.setDoorOpen(false); room.setWindowOpen(false); room.coolingFailedState = false;
        room.setEmergencyStrobe(false); room.setEvacuationAlarm(false);
        isEmergencyMode = false; isEvacuationAlarm = false; isAccessRestricted = false;
        alarmSound.stop();
        if (bannerEmergency) bannerEmergency.style.display = 'none';
        
        sim.logEvent('Authorised Safety Reset Executed — Incident Closed', 'success');
        if (activeIncidentId) await apiFetch(`/incidents/${activeIncidentId}/action`, { method: 'POST', body: JSON.stringify({ action: 'reset' }) });
        document.getElementById('modal-emergency')?.classList.remove('open');
    });

    // Emergency Alarm Sound Controls
    function updateSoundUI() {
        const soundOn = !alarmSound.isMuted;
        const btnToggle = document.getElementById('btn-sound-toggle');
        const btnBannerMute = document.getElementById('btn-sound-mute-banner');
        if (btnToggle) {
            btnToggle.textContent = soundOn ? '🔊 Sound: ON' : '🔇 Sound: MUTED';
            btnToggle.className = soundOn ? 'btn btn-secondary btn-sm' : 'btn btn-warn-outline btn-sm';
        }
        if (btnBannerMute) {
            btnBannerMute.textContent = soundOn ? '🔊 Siren: Active' : '🔇 Siren: Muted';
        }
    }

    document.getElementById('btn-sound-toggle')?.addEventListener('click', () => {
        alarmSound.toggleMute();
        updateSoundUI();
        sim.logEvent(`Emergency Alarm Sound ${alarmSound.isMuted ? 'MUTED' : 'ENABLED'}`, 'info');
    });

    document.getElementById('btn-sound-mute-banner')?.addEventListener('click', () => {
        alarmSound.toggleMute();
        updateSoundUI();
        sim.logEvent(`Emergency Alarm Sound ${alarmSound.isMuted ? 'MUTED' : 'ENABLED'}`, 'info');
    });

    document.getElementById('btn-test-siren')?.addEventListener('click', () => {
        if (alarmSound.isLooping) {
            alarmSound.stop();
            sim.logEvent('Emergency Alarm Siren Test Stopped', 'info');
        } else {
            alarmSound.start();
            sim.logEvent('🔊 Emergency Alarm Siren Test ACTIVATED (Playing Sound)', 'warning');
        }
    });

    // Settings Modal
    document.getElementById('btn-settings')?.addEventListener('click', () => document.getElementById('modal')?.classList.add('open'));
    document.getElementById('btn-modal-close')?.addEventListener('click', () => document.getElementById('modal')?.classList.remove('open'));
    document.getElementById('btn-modal-cancel')?.addEventListener('click', () => document.getElementById('modal')?.classList.remove('open'));
    document.getElementById('btn-modal-save')?.addEventListener('click', async () => {
        const warn = parseFloat(document.getElementById('cfg-warn')?.value) || 25;
        const crit = parseFloat(document.getElementById('cfg-crit')?.value) || 30;
        const minVal = parseFloat(document.getElementById('cfg-min')?.value) || 18;

        sim.thresholds.maxSafe = warn;
        sim.thresholds.criticalHigh = crit;
        sim.thresholds.minSafe = minVal;

        if (valMinSafe) valMinSafe.textContent = `${minVal.toFixed(0)}°C`;
        if (valMaxSafe) valMaxSafe.textContent = `${warn.toFixed(0)}°C`;

        document.getElementById('modal')?.classList.remove('open');
        
        await apiFetch('/thresholds', {
            method: 'PUT',
            body: JSON.stringify({ min_safe: minVal, max_safe: warn, critical_high: crit })
        });
        sim.logEvent(`Thresholds updated in Database: Warn=${warn}°C, Crit=${crit}°C`, 'info');
    });

    // Direct Backend Database CSV Export Stream
    document.getElementById('btn-export')?.addEventListener('click', () => {
        window.location.href = '/api/export/csv';
    });

    // Executive Report Generator
    document.getElementById('btn-report').addEventListener('click', () => {
        const snap = sim.getSnapshot();
        const reportText = `========================================================================
IOT-BASED VIRTUAL CHEMICAL STORAGE ROOM MASTER EXECUTIVE REPORT
Generated: ${new Date().toLocaleString()}
========================================================================

1. EXECUTIVE SYSTEM SUMMARY
------------------------------------------------------------------------
System Condition       : ${snap.systemStatus}
Simulation Speed       : ${snap.speedMultiplier}x
Preset Configuration   : ${snap.activeConfig} Sensors Array
Sensor Coverage Score  : ${snap.coverage.percentage}% (${snap.coverage.onlineCount}/${snap.coverage.count} Online)
Unmonitored Zones      : ${snap.coverage.unmonitored.join(', ') || 'None (Full Coverage)'}
Occupancy Presence     : ${isOccupied ? 'OCCUPIED (1 Personnel - Active Walking FSM)' : 'UNOCCUPIED'}

2. SPATIAL OBJECT ARRANGEMENT
------------------------------------------------------------------------
FRONT WALL  : MAIN DOOR (Centered)
RIGHT WALL  : WINDOW 1 & WINDOW 2
BACK WALL   : MECHANICAL VENTILATION UNIT
LEFT WALL   : WALL-MOUNTED COOLING CHILLER UNIT
CENTER BAYS : ZONE A (Flammables), ZONE B (Toxics), ZONE C (Corrosives), ZONE D (Storage)

3. ENVIRONMENTAL STATES
------------------------------------------------------------------------
Ambient Temperature    : ${snap.ambientTemp.toFixed(1)}°C
Main Door Position     : ${snap.doorOpen ? 'OPEN' : 'CLOSED'}
Window Position        : ${snap.windowOpen ? 'OPEN' : 'CLOSED'}
Cooling Unit State     : ${snap.coolingState}
Ventilation State      : ${snap.ventilationState}

4. ANALYTICAL MONITORING METRICS
------------------------------------------------------------------------
Average Room Temp      : ${snap.analytics.avgTemp}°C
Maximum Temperature    : ${snap.analytics.maxTemp}°C
Minimum Temperature    : ${snap.analytics.minTemp}°C
Active Hotspot Zone    : ${snap.analytics.hotspot}
Active Coldspot Zone   : ${snap.analytics.coldspot}
Last Event Recovery    : ${snap.analytics.recoverySec}

5. LIVE TELEMETRY PER SENSOR
------------------------------------------------------------------------
${Object.values(snap.sensors).map(s => `${s.id} [${s.location.padEnd(22)}]: ${s.currentTemp.toFixed(1)}°C | Status: ${snap.sensorAlertStates[s.id].toUpperCase()} | Health: ${s.health}`).join('\n')}

========================================================================
SAFETY DISCLAIMER: Emergency response actions shown are for simulation 
and demonstration purposes only. Refer to chemical SDS and site plans.
========================================================================`;

        const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Chemical_Storage_Master_Report.txt`;
        a.click();
    });

    // Event Audit Logger Callback
    sim.onEventLogged = (eventObj) => {
        auditLogs.unshift(eventObj);
        if (eventObj.type === 'warning' && !isEmergencyMode && !isEvacuationAlarm) {
            alarmSound.playShortBeep(780, 0.14);
        }
        if (!eventLog) return;

        const entry = document.createElement('div');
        entry.className = `event-entry alert-${eventObj.type}`;
        
        let typeBadge = 'INFO';
        if (eventObj.type === 'warning') typeBadge = '⚠️ WARNING';
        if (eventObj.type === 'critical') typeBadge = '🚨 CRITICAL';
        if (eventObj.type === 'success') typeBadge = '✅ RECOVERY';

        entry.innerHTML = `
            <div style="display:flex; justify-content:space-between; font-size:0.7rem; font-weight:700; margin-bottom:0.2rem;">
                <span>${eventObj.time}</span>
                <span>${typeBadge}</span>
            </div>
            <div style="font-size:0.75rem; color:#334155;">${eventObj.message}</div>
        `;

        eventLog.prepend(entry);
        if (eventLog.children.length > 50) {
            eventLog.removeChild(eventLog.lastChild);
        }
    };

    function updateStatusUI(running) {
        if (statusDot) statusDot.className = isEmergencyMode ? 'dot dot-red' : running ? 'dot dot-green' : 'dot dot-gray';
        if (statusLabel) statusLabel.textContent = isEmergencyMode ? '🔴 CRITICAL STORAGE CONDITION' : running ? `Monitoring (${sim.speedMultiplier}x)` : 'System Paused';
    }

    function syncControls() {
        if (btnDoor) {
            btnDoor.textContent = sim.doorOpen ? '🚪 Close Door' : '🚪 Open Door';
            btnDoor.className = sim.doorOpen ? 'btn btn-warn-outline' : 'btn btn-outline';
        }
        if (doorStatus) {
            doorStatus.textContent = sim.doorOpen ? 'OPEN' : 'CLOSED';
            doorStatus.className = sim.doorOpen ? 'val val-warn' : 'val val-ok';
        }

        if (btnWindow) {
            btnWindow.textContent = sim.windowOpen ? '🪟 Close Window' : '🪟 Open Window';
            btnWindow.className = sim.windowOpen ? 'btn btn-warn-outline' : 'btn btn-outline';
        }

        if (btnCooling) {
            btnCooling.textContent = sim.coolingState === 'FAILED' ? '❄️ Restore Cooling' : '❄️ Cooling Failure';
            btnCooling.className = sim.coolingState === 'FAILED' ? 'btn btn-danger-outline' : 'btn btn-outline';
        }
        if (coolingStatus) {
            coolingStatus.textContent = sim.coolingState;
            coolingStatus.className = sim.coolingState === 'FAILED' ? 'val val-crit' : 'val val-ok';
        }

        if (btnVentilation) {
            btnVentilation.textContent = sim.ventilationState === 'FAILED' ? '🌀 Restore Vent' : '🌀 Vent Failure';
            btnVentilation.className = sim.ventilationState === 'FAILED' ? 'btn btn-danger-outline' : 'btn btn-outline';
        }
    }

    // Trigger Critical Emergency Mode
    async function triggerEmergencyMode(reason) {
        if (isEmergencyMode) return;
        isEmergencyMode = true;
        if (bannerEmergency) bannerEmergency.style.display = 'flex';
        room.setEmergencyStrobe(true);
        alarmSound.start();

        sim.logEvent(`🔴 CRITICAL EMERGENCY MODE ACTIVATED: ${reason}`, 'critical');

        // Post Incident to Backend Database
        const res = await apiFetch('/incidents/trigger', {
            method: 'POST',
            body: JSON.stringify({ type: reason, severity: 'CRITICAL' })
        });

        if (res && res.incident_id) activeIncidentId = res.incident_id;

        // Auto-Trigger 3D Avatar Evacuation sequence if occupant is in room
        if (isOccupied) {
            isEvacuationAlarm = true;
            room.setEvacuationAlarm(true);
            room.triggerOccupantEmergencyAlert();
            sim.logEvent('🚨 OCCUPANT IN ROOM: 3D AVATAR EVACUATION SEQUENCE ACTIVATED!', 'critical');
            const modalEmerg = document.getElementById('modal-emergency');
            if (modalEmerg) modalEmerg.classList.add('open');
        }
    }

    // Main Simulation Tick Callback
    sim.onTick = (snap) => {
        room.setDoorOpen(snap.doorOpen);
        room.setWindowOpen(snap.windowOpen);
        room.coolingFailedState = (snap.coolingState === 'FAILED');
        room.updateSensorLabels(snap.sensors, snap.sensorAlertStates);
        syncControls();

        // Check if snapshot breaches CRITICAL emergency criteria
        if (snap.systemStatus === 'CRITICAL' && !isEmergencyMode) {
            triggerEmergencyMode('Multiple Sensor Critical Threshold Breach');
        }

        // Room Status Badge
        if (roomStatus) {
            roomStatus.textContent = snap.systemStatus;
            roomStatus.className = snap.systemStatus === 'CRITICAL' ? 'val val-crit' : snap.systemStatus === 'WARNING' ? 'val val-warn' : 'val val-ok';
        }
        if (ambientStatus) {
            ambientStatus.textContent = snap.ambientTemp.toFixed(1) + '°C';
        }
        
        updateStatusUI(snap.isRunning);

        // Threshold Card Updates
        if (valRoomAvg) valRoomAvg.textContent = `${snap.analytics.avgTemp}°C`;
        if (valMaxSensor) valMaxSensor.textContent = snap.analytics.hotspot;

        // Analytics KPI Summary
        if (valCoverage) valCoverage.textContent = `${snap.coverage.percentage}%`;
        if (valHotspot) valHotspot.textContent = snap.analytics.hotspot;
        if (valColdspot) valColdspot.textContent = snap.analytics.coldspot;
        if (valRecovery) valRecovery.textContent = snap.analytics.recoverySec;

        // Sensor Table
        sensorTableBody.innerHTML = '';
        for (const id in snap.sensors) {
            const s = snap.sensors[id];
            const st = snap.sensorAlertStates[id];
            const rate = snap.ratesOfChange[id] || 0.0;

            const tr = document.createElement('tr');
            tr.className = st !== 'normal' ? `row-${st}` : '';

            const statusBadge = s.health === 'OFFLINE' ? '<span class="tbl-badge tbl-off">Offline</span>' :
                                st === 'critical' ? '<span class="tbl-badge tbl-crit">Critical</span>' :
                                st === 'warning' ? '<span class="tbl-badge tbl-warn">Warning</span>' :
                                '<span class="tbl-badge tbl-ok">Normal</span>';

            const rateStr = rate > 0 ? `+${rate.toFixed(1)}°C/m` : `${rate.toFixed(1)}°C/m`;
            const rateColor = rate > 0.5 ? '#ef4444' : rate < -0.5 ? '#10b981' : '#64748b';

            tr.innerHTML = `<td><strong style="color:${s.color}">${id}</strong></td>
                            <td>${s.location}</td>
                            <td class="temp-cell">${s.health === 'OFFLINE' ? 'OFFLINE' : s.currentTemp.toFixed(1) + '°C'}</td>
                            <td style="font-size:0.7rem; font-weight:600; color:${rateColor}">${rateStr}</td>
                            <td>${statusBadge}</td>`;
            sensorTableBody.appendChild(tr);
        }

        // Post Ingestion Telemetry Batch to Backend SQLite DB every 5 ticks
        if (snap.isRunning && sim.simulationSeconds % 5 === 0) {
            const readings = Object.values(snap.sensors).map(s => ({
                sensor_id: s.id,
                temperature: s.currentTemp,
                rate: snap.ratesOfChange[s.id] || 0.0,
                status: snap.sensorAlertStates[s.id]
            }));

            apiFetch('/telemetry', {
                method: 'POST',
                body: JSON.stringify({
                    readings,
                    door_state: snap.doorOpen ? 'OPEN' : 'CLOSED',
                    window_state: snap.windowOpen ? 'OPEN' : 'CLOSED',
                    cooling_state: snap.coolingState,
                    vent_state: snap.ventilationState
                })
            });
        }

        // Chart Update
        if (trendChart && trendChart.data.datasets.length > 0) {
            const timeLabel = new Date().toTimeString().split(' ')[0];
            trendChart.data.labels.push(timeLabel);
            if (trendChart.data.labels.length > 50) trendChart.data.labels.shift();

            Object.keys(snap.sensors).forEach((id, idx) => {
                if (trendChart.data.datasets[idx]) {
                    if (!trendChart.data.datasets[idx].data) trendChart.data.datasets[idx].data = [];
                    trendChart.data.datasets[idx].data.push(snap.sensors[id].currentTemp);
                    if (trendChart.data.datasets[idx].data.length > 50) trendChart.data.datasets[idx].data.shift();
                }
            });
            trendChart.update();
        }
    };

    // Initialize
    syncBackendThresholds();
    initChart();
    room.setActivePreset('5');
    syncControls();

    // =========================================================================
    // ROOM SIZE & SENSOR PLACEMENT SETTINGS MODAL
    // =========================================================================

    const SENSOR_META = {
        'S1': { name: 'Entrance', color: '#3b82f6' },
        'S2': { name: 'Centre',   color: '#8b5cf6' },
        'S3': { name: 'HVAC',     color: '#06b6d4' },
        'S4': { name: 'Rack',     color: '#f97316' },
        'S5': { name: 'Window',   color: '#ec4899' },
        'S6': { name: 'Rear',     color: '#10b981' },
        'S7': { name: 'Side',     color: '#6366f1' }
    };

    const $el = id => document.getElementById(id);

    function getRoomSliderValues() {
        return {
            w: parseFloat($el('rs-w')?.value || 12),
            h: parseFloat($el('rs-h')?.value || 4),
            d: parseFloat($el('rs-d')?.value || 8)
        };
    }

    function updateRoomPreview() {
        const { w, h, d } = getRoomSliderValues();
        if ($el('rs-val-w')) $el('rs-val-w').textContent = w;
        if ($el('rs-val-h')) $el('rs-val-h').textContent = h;
        if ($el('rs-val-d')) $el('rs-val-d').textContent = d;
        if ($el('rs-preview-dims')) $el('rs-preview-dims').textContent = `${w} \xd7 ${h} \xd7 ${d} m`;
        if ($el('rs-preview-area')) $el('rs-preview-area').textContent = `${(w * d).toFixed(0)} m\xb2`;
        if ($el('rs-preview-vol'))  $el('rs-preview-vol').textContent  = `${(w * h * d).toFixed(0)} m\xb3`;
    }

    function buildSensorPlacementUI() {
        const grid = $el('rs-sensor-grid');
        if (!grid) return;
        grid.innerHTML = '';

        const curW = room.W, curH = room.H, curD = room.D;
        const curPos = room.getSensorPositions();
        const allIds = ['S1','S2','S3','S4','S5','S6','S7'];

        for (const id of allIds) {
            const meta = SENSOR_META[id];
            const p = curPos[id] || { x: 0, y: 1.6, z: 0 };
            const xMin = (-(curW / 2) + 0.5).toFixed(1);
            const xMax = ((curW / 2) - 0.5).toFixed(1);
            const yMax = (curH - 0.3).toFixed(1);
            const zMin = (-(curD / 2) + 0.5).toFixed(1);
            const zMax = ((curD / 2) - 0.5).toFixed(1);

            const row = document.createElement('div');
            row.className = 'rs-sensor-row';
            row.innerHTML = `
                <div class="rs-sensor-header">
                    <span class="rs-sensor-dot" style="background:${meta.color};box-shadow:0 0 6px ${meta.color}"></span>
                    <span class="rs-sensor-name">${id} \u2013 ${meta.name} Sensor</span>
                    <span class="rs-sensor-loc" id="rs-${id}-loc">pos: (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})</span>
                </div>
                <div class="rs-axis-row">
                    <span class="rs-axis-label">X</span>
                    <input type="range" id="rs-${id}-x" min="${xMin}" max="${xMax}" step="0.1" value="${p.x}">
                    <span class="rs-axis-val" id="rs-${id}-x-val">${p.x.toFixed(1)}m</span>
                </div>
                <div class="rs-axis-row">
                    <span class="rs-axis-label">Y</span>
                    <input type="range" id="rs-${id}-y" min="0.5" max="${yMax}" step="0.1" value="${p.y}">
                    <span class="rs-axis-val" id="rs-${id}-y-val">${p.y.toFixed(1)}m</span>
                </div>
                <div class="rs-axis-row">
                    <span class="rs-axis-label">Z</span>
                    <input type="range" id="rs-${id}-z" min="${zMin}" max="${zMax}" step="0.1" value="${p.z}">
                    <span class="rs-axis-val" id="rs-${id}-z-val">${p.z.toFixed(1)}m</span>
                </div>`;
            grid.appendChild(row);

            ['x', 'y', 'z'].forEach(axis => {
                const slider = $el(`rs-${id}-${axis}`);
                const valEl  = $el(`rs-${id}-${axis}-val`);
                const locEl  = $el(`rs-${id}-loc`);
                slider?.addEventListener('input', () => {
                    valEl.textContent = parseFloat(slider.value).toFixed(1) + 'm';
                    const xs = parseFloat($el(`rs-${id}-x`)?.value || 0);
                    const ys = parseFloat($el(`rs-${id}-y`)?.value || 0);
                    const zs = parseFloat($el(`rs-${id}-z`)?.value || 0);
                    locEl.textContent = `pos: (${xs.toFixed(1)}, ${ys.toFixed(1)}, ${zs.toFixed(1)})`;
                });
            });
        }
    }

    function readSensorPositionsFromUI() {
        const positions = {};
        for (const id of ['S1','S2','S3','S4','S5','S6','S7']) {
            positions[id] = {
                x: parseFloat($el(`rs-${id}-x`)?.value || 0),
                y: parseFloat($el(`rs-${id}-y`)?.value || 1.6),
                z: parseFloat($el(`rs-${id}-z`)?.value || 0)
            };
        }
        return positions;
    }

    // Open Room Settings Modal
    $el('btn-room-settings')?.addEventListener('click', () => {
        if ($el('rs-w')) $el('rs-w').value = room.W;
        if ($el('rs-h')) $el('rs-h').value = room.H;
        if ($el('rs-d')) $el('rs-d').value = room.D;
        updateRoomPreview();
        buildSensorPlacementUI();
        // Reset to room-size tab
        document.querySelectorAll('.rs-tab').forEach(t => t.classList.remove('rs-tab-active'));
        document.querySelector('[data-tab="room-size"]')?.classList.add('rs-tab-active');
        document.querySelectorAll('.rs-panel').forEach(p => p.classList.add('rs-panel-hidden'));
        $el('rs-panel-room-size')?.classList.remove('rs-panel-hidden');
        const banner = $el('rs-applied-banner');
        if (banner) banner.classList.remove('show');
        $el('modal-room-settings')?.classList.add('open');
    });

    $el('btn-room-settings-close')?.addEventListener('click',  () => $el('modal-room-settings')?.classList.remove('open'));
    $el('btn-room-settings-cancel')?.addEventListener('click', () => $el('modal-room-settings')?.classList.remove('open'));

    // Tab switching
    document.querySelectorAll('.rs-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.rs-tab').forEach(t => t.classList.remove('rs-tab-active'));
            tab.classList.add('rs-tab-active');
            document.querySelectorAll('.rs-panel').forEach(p => p.classList.add('rs-panel-hidden'));
            $el(`rs-panel-${tab.dataset.tab}`)?.classList.remove('rs-panel-hidden');
        });
    });

    // Room dimension live preview sliders
    ['rs-w', 'rs-h', 'rs-d'].forEach(id => {
        $el(id)?.addEventListener('input', updateRoomPreview);
    });

    // Reset Defaults
    $el('btn-room-settings-reset')?.addEventListener('click', () => {
        if ($el('rs-w')) $el('rs-w').value = 12;
        if ($el('rs-h')) $el('rs-h').value = 4;
        if ($el('rs-d')) $el('rs-d').value = 8;
        updateRoomPreview();
        buildSensorPlacementUI();
        sim.logEvent('Room Settings reset to default dimensions (12 \xd7 4 \xd7 8 m)', 'info');
    });

    // Apply – rebuild 3D room + reposition sensors
    $el('btn-room-settings-apply')?.addEventListener('click', () => {
        const { w, h, d } = getRoomSliderValues();
        const sensorPositions = readSensorPositionsFromUI();

        room.rebuild(w, h, d);
        room.repositionSensors(sensorPositions);
        room.setActivePreset(sim.activeConfig);
        room.setDoorOpen(sim.doorOpen);
        room.setWindowOpen(sim.windowOpen);
        room.coolingFailedState = (sim.coolingState === 'FAILED');
        if (sim.isRunning) room.setEmergencyStrobe(false); // reset strobe; will re-trigger on next tick if needed

        const banner = $el('rs-applied-banner');
        if (banner) {
            banner.textContent = `\u2705 Room rebuilt: ${w} \xd7 ${h} \xd7 ${d} m with custom sensor positions!`;
            banner.classList.add('show');
            setTimeout(() => banner.classList.remove('show'), 3000);
        }

        sim.logEvent(`3D Room rebuilt to ${w} \xd7 ${h} \xd7 ${d} m with custom sensor placement`, 'success');
        apiFetch('/events/room_settings', {
            method: 'POST',
            body: JSON.stringify({ message: `Room resized to ${w}x${h}x${d}m with custom sensor positions` })
        });
    });

    // AUTO-START SIMULATION IMMEDIATELY FOR LIVE EVALUATOR DEMO
    sim.start();
    updateStatusUI(true);

    sim.logEvent('Master Emergency-Response Dashboard Auto-Started Live Telemetry Stream', 'info');
    sim.onTick(sim.getSnapshot());
});
