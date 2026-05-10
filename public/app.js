const body = document.body;
const authPanel = document.querySelector("#authPanel");
const dashboardPanel = document.querySelector("#dashboardPanel");
const livePanel = document.querySelector("#livePanel");
const loginForm = document.querySelector("#loginForm");
const createRoomForm = document.querySelector("#createRoomForm");
const usernameInput = document.querySelector("#usernameInput");
const passwordInput = document.querySelector("#passwordInput");
const authMessage = document.querySelector("#authMessage");
const userStatus = document.querySelector("#userStatus");
const logoutButton = document.querySelector("#logoutButton");
const roomStatus = document.querySelector("#roomStatus");
const connectionStatus = document.querySelector("#connectionStatus");
const cameraButton = document.querySelector("#cameraButton");
const muteButton = document.querySelector("#muteButton");
const shareButton = document.querySelector("#shareButton");
const requestScreenButton = document.querySelector("#requestScreenButton");
const recordButton = document.querySelector("#recordButton");
const streamQualityControl = document.querySelector("#streamQualityControl");
const streamQualitySelect = document.querySelector("#streamQualitySelect");
const fullscreenButton = document.querySelector("#fullscreenButton");
const toggleWebcamsButton = document.querySelector("#toggleWebcamsButton");
const stopPresentingButton = document.querySelector("#stopPresentingButton");
const meetPresenterLabel = document.querySelector("#meetPresenterLabel");
const meetTopParticipantCount = document.querySelector("#meetTopParticipantCount");
const leaveButton = document.querySelector("#leaveButton");
const localVideo = document.querySelector("#localVideo");
const localRoleLabel = document.querySelector("#localRoleLabel");
const localNameLabel = document.querySelector("#localNameLabel");
const recordingStatus = document.querySelector("#recordingStatus");
const recordingMessage = document.querySelector("#recordingMessage");
const remoteStrip = document.querySelector("#remoteStrip");
const remoteGrid = document.querySelector("#remoteGrid");
const remoteScrollPrev = document.querySelector("#remoteScrollPrev");
const remoteScrollNext = document.querySelector("#remoteScrollNext");
const videoLayout = document.querySelector(".video-layout");
const mainVideoColumn = document.querySelector(".main-video-column");
const hostTile = document.querySelector(".host-tile");
const participantCount = document.querySelector("#participantCount");
const participantList = document.querySelector("#participantList");
const liveUploadForm = document.querySelector("#liveUploadForm");
const liveUploadMessage = document.querySelector("#liveUploadMessage");
const lessonSelectRecordings = document.querySelector("#lessonSelectRecordings");
const lessonSelectMaterials = document.querySelector("#lessonSelectMaterials");
const recordingsList = document.querySelector("#recordingsList");
const materialsList = document.querySelector("#materialsList");
const liveMaterialsList = document.querySelector("#liveMaterialsList");
const recordingsTitle = document.querySelector("#recordingsTitle");
const liveRoomsList = document.querySelector("#liveRoomsList");
const refreshUsersButton = document.querySelector("#refreshUsersButton");
const userForm = document.querySelector("#userForm");
const userList = document.querySelector("#userList");
const userMessage = document.querySelector("#userMessage");
const newUserNameInput = document.querySelector("#newUserNameInput");
const newUsernameInput = document.querySelector("#newUsernameInput");
const newPasswordInput = document.querySelector("#newPasswordInput");
const newRoleInput = document.querySelector("#newRoleInput");
const newCompanyInput = document.querySelector("#newCompanyInput");
const newRoomNameInput = document.querySelector("#newRoomName");
const roomVisibilityInput = document.querySelector("#roomVisibilityInput");
const roomPasswordGroup = document.querySelector("#roomPasswordGroup");
const roomPasswordInput = document.querySelector("#roomPasswordInput");
const stageRoomName = document.querySelector("#stageRoomName");
const tabButtons = document.querySelectorAll(".tab-button");
const tabLive = document.querySelector("#tab-live");
const tabRecordings = document.querySelector("#tab-recordings");
const tabMaterials = document.querySelector("#tab-materials");
const tabUsers = document.querySelector("#tab-users");

const peers = new Map();
const participants = new Map();
const rtcConfig = {
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
    iceCandidatePoolSize: 4,
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ]
};

let session = null;
let localStream = null;
let screenStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let activeRecordingLessonTitle = "";
let presentationOwnerId = "";
let remoteScreenShareActive = false;
let pollStopped = true;
let liveMaterialsRefreshId = null;
let liveMaterialsSignature = "";
let muted = false;
let auth = JSON.parse(localStorage.getItem("treinalive_auth") || "null");
let appFullscreenFallback = false;
const ALL_MATERIALS_VALUE = "__all_materials__";
const SCREEN_CAPTURE_FRAME_RATE = 60;
const SCREEN_SHARE_MAX_BITRATE = 12000000;
const STREAM_QUALITY_PRESETS = {
    auto: { label: "Auto", targetHeight: 0, maxBitrate: SCREEN_SHARE_MAX_BITRATE, maxFramerate: SCREEN_CAPTURE_FRAME_RATE },
    "480p": { label: "480p", targetHeight: 480, maxBitrate: 1600000, maxFramerate: SCREEN_CAPTURE_FRAME_RATE },
    "720p": { label: "720p", targetHeight: 720, maxBitrate: 4500000, maxFramerate: SCREEN_CAPTURE_FRAME_RATE },
    "1080p": { label: "1080p", targetHeight: 1080, maxBitrate: 9000000, maxFramerate: SCREEN_CAPTURE_FRAME_RATE }
};
const SCREEN_CAPTURE_OPTIONS = {
    video: {
        displaySurface: "monitor",
        logicalSurface: true,
        cursor: "always",
        resizeMode: "none",
        frameRate: { ideal: SCREEN_CAPTURE_FRAME_RATE, max: SCREEN_CAPTURE_FRAME_RATE }
    },
    audio: true,
    monitorTypeSurfaces: "include",
    selfBrowserSurface: "exclude",
    surfaceSwitching: "include",
    systemAudio: "include"
};
const BASIC_SCREEN_CAPTURE_OPTIONS = {
    video: true,
    audio: true
};
const CAMERA_CAPTURE_OPTIONS = {
    video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 }
    },
    audio: false
};
const BASIC_CAMERA_CAPTURE_OPTIONS = {
    video: true,
    audio: false
};
const MICROPHONE_CAPTURE_OPTIONS = {
    audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
    },
    video: false
};

if ("ResizeObserver" in window && hostTile) {
    new ResizeObserver(queueStageVideoHeightSync).observe(hostTile);
}
window.addEventListener("resize", queueStageVideoHeightSync);
window.addEventListener("resize", queueRemoteScrollControlsUpdate);
queueStageVideoHeightSync();
queueRemoteScrollControlsUpdate();

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await login();
});

createRoomForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const roomName = newRoomNameInput.value.trim();
    const privateRoom = roomVisibilityInput.value === "private";
    const password = roomPasswordInput.value.trim();

    if (privateRoom && !password) {
        roomPasswordInput.focus();
        return;
    }

    if (roomName) {
        const joined = await joinRoomByName(roomName, { privateRoom, password });
        if (!joined) {
            return;
        }
        newRoomNameInput.value = "";
        roomPasswordInput.value = "";
        roomVisibilityInput.value = "public";
        updateRoomPrivacyUi();
    }
});

roomVisibilityInput.addEventListener("change", updateRoomPrivacyUi);

logoutButton.addEventListener("click", logout);

// Tabs do dashboard
tabButtons.forEach(button => {
    button.addEventListener("click", () => {
        showDashboardTab(button.dataset.tab);
    });
});

lessonSelectRecordings.addEventListener("change", async (event) => {
    await loadLessonFiles(event.target.value.trim());
});

lessonSelectMaterials.addEventListener("change", async (event) => {
    const title = event.target.value.trim();
    if (!title || title === ALL_MATERIALS_VALUE) {
        await loadAllMaterials();
        return;
    }
    await loadMaterialFiles(title);
});

cameraButton.addEventListener("click", async () => {
    if (hasLocalVideo()) {
        stopLocalCamera();
        return;
    }
    await startCamera();
});

muteButton.addEventListener("click", async () => {
    if (!hasLocalAudio()) {
        await startMicrophone();
        return;
    }

    setLocalMuted(!muted);
});

shareButton.addEventListener("click", async () => {
    if (!isPresentationOwner()) {
        await requestScreenControl();
        return;
    }

    if (screenStream) {
        stopScreenShare();
        return;
    }

    try {
        if (!hasLocalVideo()) {
            await startCamera();
        }
        screenStream = await captureFullScreenStream();
        if (isPresentationOwner()) {
            localVideo.srcObject = screenStream;
        }
        shareButton.textContent = "Parar espelhamento";
        publishActiveStream();
        announceScreenShareState(true);
        screenStream.getVideoTracks()[0].addEventListener("ended", stopScreenShare);
        if (isTrainingFullscreen()) {
            await switchToPresentationFullscreen();
        }
    } catch (error) {
        alert(screenCaptureErrorMessage(error));
    }
});

requestScreenButton.addEventListener("click", requestScreenControl);
participantList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-participant-action]");
    if (!button) {
        return;
    }

    const participantId = button.dataset.participantId;
    if (button.dataset.participantAction === "mute") {
        await muteParticipant(participantId);
    }
    if (button.dataset.participantAction === "kick") {
        await kickParticipant(participantId);
    }
});

liveRoomsList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-room-action='join']");
    if (!button) {
        return;
    }

    const roomName = button.dataset.roomName;
    const privateRoom = button.dataset.privateRoom === "true";
    let password = "";
    if (privateRoom) {
        password = window.prompt("Digite a senha da sala privada:") || "";
        if (!password.trim()) {
            return;
        }
    }

    await joinRoomByName(roomName, { password: password.trim() });
});

recordButton.addEventListener("click", async () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        return;
    }
    await startRecording();
});

streamQualitySelect.addEventListener("change", requestStreamQuality);
fullscreenButton.addEventListener("click", toggleTrainingFullscreen);
stopPresentingButton?.addEventListener("click", stopScreenShare);
["fullscreenchange", "webkitfullscreenchange", "msfullscreenchange"].forEach((eventName) => {
    document.addEventListener(eventName, handleFullscreenChange);
});
leaveButton.addEventListener("click", leaveRoom);
remoteScrollPrev.addEventListener("click", () => scrollRemoteWebcams(-1));
remoteScrollNext.addEventListener("click", () => scrollRemoteWebcams(1));
remoteGrid.addEventListener("scroll", queueRemoteScrollControlsUpdate, { passive: true });
toggleWebcamsButton?.addEventListener("click", () => {
    const hidden = !body.classList.contains("hide-remote-cameras");
    setRemoteWebcamsHidden(hidden);
    if (currentUserCanHost()) {
        sendSignal("", "webcams-visibility", { hidden });
    }
});
refreshUsersButton.addEventListener("click", loadUsers);
window.addEventListener("beforeunload", () => {
    if (session) {
        navigator.sendBeacon(`/api/session/leave?token=${encodeURIComponent(auth?.token || "")}`, JSON.stringify({ room: session.room, id: session.id }));
    }
});

userForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await createUser();
});

liveUploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!session || !currentUserCanHost()) {
        showLiveUploadMessage("Entre em uma aula como apresentador para enviar materiais.", true);
        return;
    }

    const formData = new FormData(liveUploadForm);
    const file = formData.get("file");
    if (!file || !file.name) {
        showLiveUploadMessage("Selecione um arquivo para enviar.", true);
        return;
    }

    if (isVideoFile(file.name, file.type)) {
        showLiveUploadMessage("Use materiais como PDF, imagens ou documentos. Grave videos pelo botao Gravar aula.", true);
        return;
    }

    showLiveUploadMessage("Enviando material...", false);

    try {
        const response = await apiFetch(`/api/upload?material=true&lessonTitle=${encodeURIComponent(session.room)}`, {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Falha ao enviar material");
        }

        liveUploadForm.reset();
        showLiveUploadMessage("Material enviado.", false);
        await refreshUploadedMaterials(session.room);
    } catch (error) {
        showLiveUploadMessage(error.message, true);
    }
});

async function login() {
    authMessage.textContent = "Autenticando...";
    authMessage.classList.remove("error");

    try {
        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: usernameInput.value.trim(),
                password: passwordInput.value
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "Falha no login");
        }

        auth = data;
        localStorage.setItem("treinalive_auth", JSON.stringify(auth));
        authMessage.textContent = "";
        applyAuthUi();
        if (currentUserCanHost()) {
            await loadUsers();
        }
    } catch (error) {
        authMessage.textContent = error.message;
        authMessage.classList.add("error");
    }
}

async function logout() {
    if (session) {
        await leaveRoom();
    }
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    auth = null;
    localStorage.removeItem("treinalive_auth");
    applyAuthUi();
}

async function apiFetch(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (auth?.token) {
        headers.set("Authorization", `Bearer ${auth.token}`);
    }
    return fetch(url, { ...options, headers });
}

function applyAuthUi() {
    const user = auth?.user;
    body.dataset.accountRole = user?.role || "";
    body.classList.toggle("is-authenticated", Boolean(user));
    
    // Controlar visibilidade dos paineis
    authPanel.hidden = Boolean(user);
    setLiveMode(Boolean(session));
    updateWebcamToggleButton();
    
    logoutButton.hidden = !user;
    userStatus.textContent = user ? `${user.name} - ${roleLabel(user.role)}` : "Nao autenticado";
    connectionStatus.textContent = user ? "autenticado" : "offline";

    const canHost = user && user.role !== "aluno";
    body.dataset.role = canHost ? "host" : "student";
    localRoleLabel.textContent = canHost ? "Apresentador local" : "Aluno";
    requestScreenButton.hidden = true;
    if (user) {
        localNameLabel.textContent = user.name;
    }
    [...newRoleInput.options].forEach((option) => {
        option.disabled = user?.role === "administrador" && option.value !== "aluno";
    });
    if (user?.role === "administrador") {
        newRoleInput.value = "aluno";
    }
    if (user) {
        ensureDashboardTabAccess();
    }
    
    // Se logado fora da aula ao vivo, carregar dados do dashboard
    if (user && !session) {
        loadRooms();
        loadLessons();
        if (canHost) {
            loadUsers();
        }
    }
}

function setLiveMode(isLive) {
    body.classList.toggle("is-live", isLive);
    dashboardPanel.hidden = isLive || !auth?.user;
    livePanel.hidden = !isLive;
    updateScreenPresentationClass();
    updateMeetPresentationUi();
    queueStageVideoHeightSync();
}

function queueStageVideoHeightSync() {
    requestAnimationFrame(syncStageVideoHeight);
}

function syncStageVideoHeight() {
    if (!videoLayout || !hostTile || livePanel.hidden) {
        return;
    }

    const height = Math.round(hostTile.getBoundingClientRect().height);
    if (height > 0) {
        videoLayout.style.setProperty("--stage-video-height", `${height}px`);
    }
}

function scrollRemoteWebcams(direction) {
    const amount = Math.max(remoteGrid.clientWidth * 0.8, 180);
    remoteGrid.scrollBy({
        left: direction * amount,
        behavior: "smooth"
    });
}

function queueRemoteScrollControlsUpdate() {
    requestAnimationFrame(updateRemoteScrollControls);
}

function updateRemoteScrollControls() {
    if (!remoteStrip || !remoteGrid || !remoteScrollPrev || !remoteScrollNext) {
        return;
    }

    const visibleTiles = [...remoteGrid.children].filter((child) => !child.hidden);
    const hasWebcams = visibleTiles.length > 0;
    remoteStrip.classList.toggle("has-webcams", hasWebcams);
    body.classList.toggle("has-side-webcams", Boolean(session && hasWebcams));

    if (!hasWebcams) {
        remoteStrip.classList.remove("is-scrollable");
        return;
    }

    const hasOverflow = remoteGrid.scrollWidth > remoteGrid.clientWidth + 2;
    const atStart = remoteGrid.scrollLeft <= 1;
    const atEnd = remoteGrid.scrollLeft + remoteGrid.clientWidth >= remoteGrid.scrollWidth - 1;

    remoteStrip.classList.toggle("is-scrollable", hasOverflow);
    remoteScrollPrev.disabled = !hasOverflow || atStart;
    remoteScrollNext.disabled = !hasOverflow || atEnd;
}

function showDashboardTab(tab) {
    const hostOnlyTabs = new Set(["users"]);
    const selectedTab = hostOnlyTabs.has(tab) && !currentUserCanHost() ? "live" : tab;
    const contentsByTab = {
        live: tabLive,
        recordings: tabRecordings,
        materials: tabMaterials,
        users: tabUsers
    };

    tabButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.tab === selectedTab);
    });

    Object.entries(contentsByTab).forEach(([name, content]) => {
        content.hidden = name !== selectedTab;
    });

    if (selectedTab === "live") {
        loadRooms();
    }
    if (selectedTab === "users") {
        loadUsers();
    }
}

function ensureDashboardTabAccess() {
    const activeButton = document.querySelector(".tab-button.active");
    if (!activeButton || (activeButton.classList.contains("host-control") && !currentUserCanHost())) {
        showDashboardTab("live");
    }
}

function updateRoomPrivacyUi() {
    const privateRoom = roomVisibilityInput.value === "private";
    roomPasswordGroup.hidden = !privateRoom;
    roomPasswordInput.required = privateRoom;
    if (!privateRoom) {
        roomPasswordInput.value = "";
    }
}

async function captureFullScreenStream() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error("Este navegador nao suporta espelhamento de tela.");
    }

    let stream;
    try {
        stream = await navigator.mediaDevices.getDisplayMedia(SCREEN_CAPTURE_OPTIONS);
    } catch (error) {
        if (!shouldRetryScreenCaptureWithoutHints(error)) {
            throw error;
        }
        stream = await navigator.mediaDevices.getDisplayMedia(BASIC_SCREEN_CAPTURE_OPTIONS);
    }

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
        stopStream(stream);
        throw new Error("Nenhuma tela foi selecionada.");
    }

    await prepareScreenCaptureTrack(videoTrack);
    ensureEntireScreenCapture(videoTrack, stream);
    return stream;
}

function shouldRetryScreenCaptureWithoutHints(error) {
    return ["TypeError", "OverconstrainedError", "ConstraintNotSatisfiedError"].includes(error?.name);
}

async function prepareScreenCaptureTrack(track) {
    if ("contentHint" in track) {
        track.contentHint = "motion";
    }

    if (typeof track.applyConstraints !== "function") {
        return;
    }

    await track.applyConstraints({
        cursor: "always",
        resizeMode: "none",
        frameRate: { ideal: SCREEN_CAPTURE_FRAME_RATE, max: SCREEN_CAPTURE_FRAME_RATE }
    }).catch(() => {});
}

function ensureEntireScreenCapture(track, stream) {
    const settings = typeof track.getSettings === "function" ? track.getSettings() : {};
    if (settings.displaySurface && settings.displaySurface !== "monitor") {
        stopStream(stream);
        throw new Error("Voce selecionou uma janela ou aba. Clique em Espelhar tela de novo e escolha a aba Tela inteira na janela de compartilhamento do navegador.");
    }

    const width = Number(settings.width) || 0;
    const height = Number(settings.height) || 0;
    if (!width || !height || window.screen?.isExtended) {
        return;
    }

    const scale = Math.max(1, window.devicePixelRatio || 1);
    const expectedWidth = Math.max(window.screen.width || 0, window.screen.availWidth || 0) * scale;
    const expectedHeight = Math.max(window.screen.height || 0, window.screen.availHeight || 0) * scale;
    const captureLooksSmallerThanScreen = expectedWidth && expectedHeight
        && (width < expectedWidth * 0.92 || height < expectedHeight * 0.9);

    if (captureLooksSmallerThanScreen) {
        stopStream(stream);
        throw new Error("A captura veio menor que o monitor. Clique em Espelhar tela de novo e selecione Tela inteira, nao Janela ou Guia.");
    }
}

function screenCaptureErrorMessage(error) {
    if (["AbortError", "NotAllowedError"].includes(error?.name)) {
        return "Compartilhamento de tela cancelado.";
    }

    return error?.message || "Nao foi possivel iniciar o espelhamento de tela.";
}

async function toggleTrainingFullscreen() {
    if (isTrainingFullscreen()) {
        await exitTrainingFullscreen();
        return;
    }

    const target = trainingFullscreenTarget();
    const requestFullscreen = fullscreenRequestFor(target);

    if (!requestFullscreen) {
        enterFallbackFullscreen();
        return;
    }

    setTrainingFullscreenClass(true);
    try {
        await asPromise(requestFullscreen.call(target));
        if (!fullscreenElement()) {
            enterFallbackFullscreen();
            return;
        }
    } catch (error) {
        enterFallbackFullscreen();
        return;
    }
    updateFullscreenButton();
    queueStageVideoHeightSync();
}

async function switchToPresentationFullscreen() {
    const target = trainingFullscreenTarget();
    if (!target || fullscreenElement() === target) {
        return;
    }

    const requestFullscreen = fullscreenRequestFor(target);
    if (!requestFullscreen) {
        return;
    }

    await asPromise(requestFullscreen.call(target)).catch(() => {});
}

function trainingFullscreenTarget() {
    return livePanel || localVideo;
}

async function exitTrainingFullscreen() {
    appFullscreenFallback = false;
    const exitFullscreen = fullscreenExitFor();

    if (fullscreenElement() && exitFullscreen) {
        await asPromise(exitFullscreen.call(document)).catch(() => {});
    }

    setTrainingFullscreenClass(false);
    updateFullscreenButton();
    queueStageVideoHeightSync();
}

function enterFallbackFullscreen() {
    appFullscreenFallback = true;
    setTrainingFullscreenClass(true);
    window.scrollTo(0, 0);
    updateFullscreenButton();
    queueStageVideoHeightSync();
}

function handleFullscreenChange() {
    if (!fullscreenElement()) {
        appFullscreenFallback = false;
        setTrainingFullscreenClass(false);
    } else {
        setTrainingFullscreenClass(true);
    }
    updateFullscreenButton();
    queueStageVideoHeightSync();
}

function isTrainingFullscreen() {
    return appFullscreenFallback || Boolean(fullscreenElement());
}

function setTrainingFullscreenClass(enabled) {
    document.documentElement.classList.toggle("is-training-fullscreen", enabled);
    body.classList.toggle("is-training-fullscreen", enabled);
    body.classList.toggle("is-fallback-fullscreen", enabled && appFullscreenFallback);
}

function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
}

function fullscreenRequestFor(element) {
    return element?.requestFullscreen || element?.webkitRequestFullscreen || element?.msRequestFullscreen || null;
}

function fullscreenExitFor() {
    return document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen || null;
}

function asPromise(value) {
    return value && typeof value.then === "function" ? value : Promise.resolve(value);
}

function updateFullscreenButton() {
    const isFullscreen = isTrainingFullscreen();
    fullscreenButton.textContent = isFullscreen ? "Sair da tela cheia" : "Tela cheia";
    fullscreenButton.setAttribute("aria-pressed", String(isFullscreen));
}

function roleLabel(role) {
    return {
        mestre: "Mestre",
        administrador: "Administrador",
        aluno: "Aluno",
        host: "Administrador",
        student: "Aluno"
    }[role] || role;
}

function currentUserCanHost() {
    return auth?.user && auth.user.role !== "aluno";
}

function isPresentationOwner() {
    return session && presentationOwnerId === session.id;
}

// Funcoes do Dashboard
async function loadRooms() {
    if (!auth?.user) {
        liveRoomsList.innerHTML = "<div class='empty-state'>Faca login para ver as salas.</div>";
        return;
    }
    
    liveRoomsList.innerHTML = "<div class='empty-state'>Carregando salas...</div>";
    
    try {
        const response = await apiFetch("/api/rooms");
        if (!response.ok) {
            throw new Error("Nao foi possivel carregar as salas.");
        }
        const rooms = await response.json();
        renderRooms(rooms);
    } catch (error) {
        liveRoomsList.innerHTML = "<div class='empty-state'>Nao foi possivel carregar as salas.</div>";
    }
}

function renderRooms(rooms) {
    if (!rooms.length) {
        const hint = currentUserCanHost() ? "<br>Use Nova reuniao para iniciar uma transmissao." : "";
        liveRoomsList.innerHTML = `<div class='empty-state'>Nenhuma aula ao vivo no momento.${hint}</div>`;
        return;
    }
    
    liveRoomsList.innerHTML = rooms.map(room => {
        const canJoin = Boolean(auth?.user);
        const privateRoom = Boolean(room.privateRoom);
        return `
            <article class="room-card">
                <div class="room-info">
                    <h3>${escapeHtml(room.name)}</h3>
                    <span class="room-participants">${room.participants} participante(s) online - ${privateRoom ? "Privada" : "Publica"}</span>
                </div>
                <button class="primary-button ${canJoin ? '' : 'disabled'}" 
                        ${canJoin ? '' : 'disabled'} 
                        data-room-action="join"
                        data-room-name="${escapeHtml(room.name)}"
                        data-private-room="${privateRoom}">
                    Entrar
                </button>
            </article>
        `;
    }).join("");
}

async function joinRoomByName(roomName, options = {}) {
    if (!auth?.user) {
        return false;
    }
    if (session) {
        await leaveRoom();
    }

    const role = auth.user.role === "aluno" ? "student" : "host";
    body.dataset.role = role;
    connectionStatus.textContent = "entrando";

    const response = await apiFetch("/api/session/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            room: roomName,
            privateRoom: options.privateRoom ? "true" : "false",
            password: options.password || ""
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        alert(error.error || "Nao foi possivel entrar na sala.");
        connectionStatus.textContent = response.status === 409 ? "autenticado" : "offline";
        return false;
    }

    const data = await response.json();
    session = { id: data.id, room: data.room || roomName };
    participants.clear();
    const currentParticipant = {
        id: data.id,
        name: auth.user.name,
        role,
        accountRole: auth.user.role
    };
    participants.set(currentParticipant.id, currentParticipant);
    for (const peer of data.peers) {
        participants.set(peer.id, peer);
    }
    const currentOwner = firstPresentationCandidate(data.peers);
    presentationOwnerId = currentOwner?.id || (currentUserCanHost() ? session.id : "");
    roomStatus.textContent = `Sala: ${session.room}`;
    stageRoomName.textContent = session.room;
    connectionStatus.textContent = "online";

    // Mostrar painel ao vivo
    setLiveMode(true);
    await loadLiveMaterials({ force: true });
    startLiveMaterialsRefresh();

    // Conectar peers existentes
    for (const peer of data.peers) {
        createPeerConnection(peer, isPresentationOwner());
    }

    // Iniciar polling
    updateParticipants();
    updatePresentationUi();
    startPolling();
    if (!isPresentationOwner()) {
        await requestStreamQuality();
    }
    if (isPresentationOwner()) {
        announcePresentationOwner();
        publishActiveStream();
    } else if (getOutboundStream()) {
        publishActiveStream();
    }
    return true;
}

async function leaveRoom() {
    await closeLocalSession({ notifyServer: true });
}

async function closeLocalSession(options = {}) {
    if (!session) {
        return;
    }

    const leavingSession = session;
    const notifyServer = Boolean(options.notifyServer);
    const statusText = options.statusText || "autenticado";

    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
    }

    pollStopped = true;
    stopLiveMaterialsRefresh();
    if (isTrainingFullscreen()) {
        await exitTrainingFullscreen();
    }
    if (notifyServer) {
        await apiFetch("/api/session/leave", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ room: leavingSession.room, id: leavingSession.id })
        }).catch(() => {});
    }

    peers.forEach((entry) => entry.connection.close());
    peers.clear();
    participants.clear();
    presentationOwnerId = "";
    remoteScreenShareActive = false;
    liveMaterialsSignature = "";
    liveMaterialsList.innerHTML = "";
    remoteGrid.innerHTML = "";
    queueRemoteScrollControlsUpdate();
    updateParticipants();
    updatePresentationUi();
    session = null;
    
    // Voltar ao dashboard
    setLiveMode(false);
    connectionStatus.textContent = statusText;
    roomStatus.textContent = "Plataforma de treinamentos";
    
    // Recarregar salas
    loadRooms();
}

async function startCamera() {
    if (hasLocalVideo()) {
        return localStream;
    }

    try {
        const includeAudio = isPresentationOwner() && !hasLocalAudio();
        const cameraStream = await getCameraStream();
        if (!localStream) {
            localStream = new MediaStream();
        }
        cameraStream.getTracks().forEach((track) => {
            localStream.addTrack(track);
            if (track.kind === "video") {
                track.addEventListener("ended", handleLocalCameraEnded, { once: true });
            }
        });
        if (isPresentationOwner()) {
            localVideo.srcObject = getActivePresentationStream();
        } else {
            updateLocalCameraPreview();
        }
        if (includeAudio) {
            await startMicrophone({ silent: true });
        }
        updateCameraButton();
        updateLocalCameraPreview();
        publishActiveStream();
        return localStream;
    } catch (error) {
        alert(mediaAccessErrorMessage("camera", error));
        return null;
    }
}

async function getCameraStream() {
    ensureMediaDevicesAvailable("camera");

    try {
        return await navigator.mediaDevices.getUserMedia(CAMERA_CAPTURE_OPTIONS);
    } catch (error) {
        if (!shouldRetryCameraWithoutHints(error)) {
            throw error;
        }
        return navigator.mediaDevices.getUserMedia(BASIC_CAMERA_CAPTURE_OPTIONS);
    }
}

function shouldRetryCameraWithoutHints(error) {
    return ["OverconstrainedError", "ConstraintNotSatisfiedError", "TypeError"].includes(error?.name);
}

function stopLocalCamera() {
    localStream?.getVideoTracks().forEach((track) => {
        track.stop();
        localStream.removeTrack(track);
    });

    if (localStream && !localStream.getTracks().length) {
        localStream = null;
    }

    updateCameraButton();
    updateLocalCameraPreview();
    publishActiveStream();
    renderMainPresentation();
}

function handleLocalCameraEnded() {
    (localStream?.getVideoTracks() || [])
        .filter((track) => track.readyState === "ended")
        .forEach((track) => localStream.removeTrack(track));

    if (localStream && !localStream.getTracks().length) {
        localStream = null;
    }

    updateCameraButton();
    updateLocalCameraPreview();
    publishActiveStream();
    renderMainPresentation();
}

async function startMicrophone(options = {}) {
    try {
        ensureMediaDevicesAvailable("microfone");
        const audioStream = await navigator.mediaDevices.getUserMedia(MICROPHONE_CAPTURE_OPTIONS);
        const audioTrack = audioStream.getAudioTracks()[0];
        if (!audioTrack) {
            throw new Error("Microfone indisponivel");
        }

        if (!localStream) {
            localStream = new MediaStream([audioTrack]);
        } else if (!hasLocalAudio()) {
            localStream.addTrack(audioTrack);
        }

        setLocalMuted(false);
        publishActiveStream();
    } catch (error) {
        if (!options.silent) {
            alert(mediaAccessErrorMessage("microfone", error));
        }
    }
}

function ensureMediaDevicesAvailable(kind) {
    if (navigator.mediaDevices?.getUserMedia) {
        return;
    }

    throw new Error(`${kind}:mediaDevicesUnavailable`);
}

function mediaAccessErrorMessage(kind, error) {
    if (!window.isSecureContext) {
        return `No iPhone/iPad, ${kind} so funciona em HTTPS. Abra o TreinaLive por um endereco https:// ou use um tunel HTTPS. Acesso por http://IP:8080 bloqueia a permissao.`;
    }

    if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
        return `Nao foi possivel acessar ${kind}. No iOS, verifique Ajustes > Safari > Camera/Microfone e permita o acesso para este site.`;
    }

    if (error?.message?.includes("mediaDevicesUnavailable")) {
        return `Este navegador nao liberou ${kind}. No iPhone/iPad, use Safari atualizado e abra o site em HTTPS.`;
    }

    if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") {
        return `Nenhuma ${kind === "camera" ? "camera" : "entrada de audio"} foi encontrada neste dispositivo.`;
    }

    return `Nao foi possivel acessar ${kind}. Verifique as permissoes do navegador.`;
}

function hasLocalAudio() {
    return Boolean(localStream?.getAudioTracks().length);
}

function hasLocalVideo() {
    return Boolean(localStream?.getVideoTracks().some((track) => track.readyState !== "ended"));
}

function updateCameraButton() {
    cameraButton.textContent = hasLocalVideo() ? "Desligar camera" : "Ligar camera";
}

function updateLocalCameraPreview() {
    let tile = document.querySelector("[data-local-camera='true']");
    const shouldShowPreview = Boolean(session && hasLocalVideo() && (!isPresentationOwner() || screenStream));
    updateScreenPresentationClass();

    if (!shouldShowPreview) {
        tile?.remove();
        queueRemoteScrollControlsUpdate();
        return;
    }

    if (!tile) {
        tile = document.createElement("article");
        tile.className = "video-tile small-tile online local-preview";
        tile.dataset.localCamera = "true";
        tile.dataset.state = "connected";
        tile.innerHTML = `
            <video autoplay muted playsinline></video>
            <div class="remote-label">
                <strong>Voce</strong>
                <span>Sua webcam</span>
            </div>
        `;
    }

    if (tile.parentElement !== remoteGrid) {
        remoteGrid.appendChild(tile);
    }

    const video = tile.querySelector("video");
    if (video.srcObject !== localStream) {
        video.srcObject = localStream;
    }
    sortWebcamTiles();
    queueRemoteScrollControlsUpdate();
}

function updateWebcamToggleButton() {
    if (!toggleWebcamsButton) {
        return;
    }
    const hidden = body.classList.contains("hide-remote-cameras");
    toggleWebcamsButton.textContent = hidden ? "Mostrar webcams" : "Ocultar webcams";
}

function setRemoteWebcamsHidden(hidden) {
    body.classList.toggle("hide-remote-cameras", hidden);
    updateWebcamToggleButton();
    queueStageVideoHeightSync();
}

function setLocalMuted(shouldMute) {
    muted = shouldMute;
    localStream?.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
    });
    muteButton.textContent = muted ? "Desmutar" : "Mutar";
    const self = session ? participants.get(session.id) : null;
    if (self) {
        self.muted = muted;
        updateParticipants();
    }
}

function startPolling() {
    pollStopped = false;
    pollSignals();
}

async function pollSignals() {
    while (!pollStopped && session) {
        try {
            const response = await apiFetch(`/api/session/poll?room=${encodeURIComponent(session.room)}&id=${encodeURIComponent(session.id)}`);
            if (!response.ok) {
                if (response.status === 403 || response.status === 404) {
                    await closeLocalSession({ statusText: "autenticado" });
                    return;
                }
                throw new Error("Polling interrompido");
            }
            const messages = await response.json();
            for (const message of messages) {
                await handleSignal(message);
            }
        } catch (error) {
            if (!pollStopped) {
                connectionStatus.textContent = "reconectando";
                await delay(1200);
            }
        }
    }
}

async function handleSignal(message) {
    if (message.type === "peer-joined") {
        const peer = JSON.parse(message.payload || "{}");
        participants.set(peer.id, peer);
        updateParticipants();
        if (!presentationOwnerId && canParticipantPresent(peer)) {
            presentationOwnerId = peer.id;
            updatePresentationUi();
        }
        if (isPresentationOwner()) {
            createPeerConnection(peer, true);
            announcePresentationOwner(peer.id);
            announceScreenShareState(Boolean(screenStream), peer.id);
            if (body.classList.contains("hide-remote-cameras")) {
                sendSignal(peer.id, "webcams-visibility", { hidden: true });
            }
        } else if (getOutboundStream()) {
            createPeerConnection(peer, true);
        }
        return;
    }

    if (message.type === "peer-left") {
        if (message.from === presentationOwnerId) {
            presentationOwnerId = nextPresentationOwnerId(message.from);
            updatePresentationUi();
            if (isPresentationOwner()) {
                announcePresentationOwner();
                publishActiveStream();
            }
        }
        removePeer(message.from);
        return;
    }

    const payload = decodePayload(message.payload);
    const peer = participants.get(message.from) || { id: message.from, name: "Participante", role: "student" };
    let entry = peers.get(message.from);

    if (!entry) {
        entry = createPeerConnection(peer, false);
    }

    if (message.type === "presentation-owner") {
        presentationOwnerId = payload?.ownerId || "";
        remoteScreenShareActive = false;
        updatePresentationUi();
        if (isPresentationOwner()) {
            publishActiveStream();
        } else {
            renderMainPresentation();
            await requestStreamQuality();
        }
        return;
    }

    if (message.type === "screen-share-state") {
        if (message.from === presentationOwnerId || canParticipantPresent(peer)) {
            remoteScreenShareActive = Boolean(payload?.active);
            updateScreenPresentationClass();
            updateMeetPresentationUi();
        }
        return;
    }

    if (message.type === "presentation-request") {
        await handlePresentationRequest(message.from, payload);
        return;
    }

    if (message.type === "quality-request") {
        if (isPresentationOwner()) {
            await applyPeerQuality(message.from, payload?.quality);
        }
        return;
    }

    if (message.type === "materials-updated") {
        if (!payload?.lessonTitle || payload.lessonTitle === session?.room) {
            await loadLiveMaterials({ force: true });
        }
        return;
    }

    if (message.type === "webcams-visibility") {
        if (canParticipantPresent(peer)) {
            setRemoteWebcamsHidden(Boolean(payload?.hidden));
        }
        return;
    }

    if (message.type === "force-mute") {
        setLocalMuted(true);
        return;
    }

    if (message.type === "kick") {
        alert("Voce foi removido da sala pelo moderador.");
        await leaveRoom();
        return;
    }

    if (message.type === "offer") {
        await entry.connection.setRemoteDescription(payload);
        const answer = await entry.connection.createAnswer();
        await entry.connection.setLocalDescription(answer);
        await sendSignal(message.from, "answer", entry.connection.localDescription);
    }

    if (message.type === "answer") {
        await entry.connection.setRemoteDescription(payload);
    }

    if (message.type === "ice" && payload) {
        await entry.connection.addIceCandidate(payload).catch(() => {});
    }
}

function createPeerConnection(peer, shouldOffer) {
    const connection = new RTCPeerConnection(rtcConfig);
    const entry = { connection, peer, video: createRemoteTile(peer), stream: null, quality: "auto" };
    peers.set(peer.id, entry);

    if (shouldOffer && isPresentationOwner()) {
        connection.createDataChannel("presence");
    }

    const outboundStream = getOutboundStream();
    if (outboundStream) {
        outboundStream.getTracks().forEach((track) => connection.addTrack(track, outboundStream));
        applyPeerQuality(peer.id).catch(() => {});
    }

    connection.addEventListener("icecandidate", (event) => {
        if (event.candidate) {
            sendSignal(peer.id, "ice", event.candidate);
        }
    });

    connection.addEventListener("track", (event) => {
        entry.stream = event.streams[0];
        configureLowLatencyReceiver(event.receiver);
        configureLowLatencyVideo(entry.video);
        entry.video.srcObject = entry.stream;
        if (peer.id === presentationOwnerId && !isPresentationOwner()) {
            configureLowLatencyVideo(localVideo);
            localVideo.srcObject = entry.stream;
        }
    });

    connection.addEventListener("connectionstatechange", () => {
        const tile = document.querySelector(`[data-peer-id="${peer.id}"]`);
        if (tile) {
            tile.dataset.state = connection.connectionState;
        }
    });

    if (shouldOffer) {
        queueMicrotask(() => createOffer(peer.id));
    }

    return entry;
}

async function createOffer(peerId) {
    const entry = peers.get(peerId);
    if (!entry) {
        return;
    }

    const offer = await entry.connection.createOffer();
    await entry.connection.setLocalDescription(offer);
    await sendSignal(peerId, "offer", entry.connection.localDescription);
}

function createRemoteTile(peer) {
    let tile = document.querySelector(`[data-peer-id="${peer.id}"]`);
    if (tile) {
        const video = tile.querySelector("video");
        configureLowLatencyVideo(video);
        return video;
    }

    tile = document.createElement("article");
    tile.className = "video-tile small-tile online";
    tile.dataset.peerId = peer.id;
    tile.dataset.state = "new";
    tile.innerHTML = `
        <video autoplay playsinline></video>
        <div class="remote-label">
            <strong>${escapeHtml(peer.name)}</strong>
            <span>${roleLabel(peer.accountRole || peer.role)}</span>
        </div>
    `;
    remoteGrid.appendChild(tile);
    configureLowLatencyVideo(tile.querySelector("video"));
    sortWebcamTiles();
    syncPresentationTileVisibility();
    queueRemoteScrollControlsUpdate();
    updateParticipants();
    return tile.querySelector("video");
}

function configureLowLatencyReceiver(receiver) {
    if (receiver && "playoutDelayHint" in receiver) {
        receiver.playoutDelayHint = 0;
    }
}

function configureLowLatencyVideo(video) {
    if (!video) {
        return;
    }
    video.autoplay = true;
    video.playsInline = true;
    video.preload = "auto";
    if ("disablePictureInPicture" in video) {
        video.disablePictureInPicture = true;
    }
    if ("latencyHint" in video) {
        video.latencyHint = "interactive";
    }
    video.play?.().catch(() => {});
}

function removePeer(peerId) {
    const entry = peers.get(peerId);
    if (entry) {
        entry.connection.close();
        peers.delete(peerId);
    }
    participants.delete(peerId);
    document.querySelector(`[data-peer-id="${peerId}"]`)?.remove();
    syncPresentationTileVisibility();
    queueRemoteScrollControlsUpdate();
    updateParticipants();
}

async function sendSignal(target, type, data) {
    if (!session) {
        return;
    }

    await apiFetch("/api/session/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            room: session.room,
            from: session.id,
            target,
            type,
            payload: encodePayload(data)
        })
    }).catch(() => {});
}

function replaceTracks(stream) {
    peers.forEach((entry) => {
        entry.connection.getSenders().forEach((sender) => {
            entry.connection.removeTrack(sender);
        });
        if (stream) {
            stream.getTracks().forEach((track) => entry.connection.addTrack(track, stream));
        }
        applyPeerQuality(entry.peer.id).catch(() => {});
    });
}

function publishActiveStream() {
    const outboundStream = getOutboundStream();
    if (isPresentationOwner()) {
        localVideo.srcObject = getActivePresentationStream();
    }
    updateLocalCameraPreview();
    updateScreenPresentationClass();
    updateMeetPresentationUi();
    replaceTracks(outboundStream);
    peers.forEach((entry) => {
        if (entry.connection.signalingState === "stable") {
            createOffer(entry.peer.id);
        }
    });
}

function getOutboundStream() {
    const tracks = [];
    if (isPresentationOwner()) {
        const presentationStream = getActivePresentationStream();
        if (presentationStream) {
            tracks.push(...presentationStream.getTracks());
        }
    } else if (localStream) {
        tracks.push(...localStream.getTracks());
    }
    return tracks.length ? new MediaStream(tracks) : null;
}

function getActivePresentationStream() {
    if (screenStream) {
        return buildPresentationStream(screenStream);
    }
    return localStream;
}

function normalizeStreamQuality(quality) {
    return STREAM_QUALITY_PRESETS[quality] ? quality : "auto";
}

async function requestStreamQuality() {
    if (!session || isPresentationOwner() || !presentationOwnerId) {
        return;
    }

    await sendSignal(presentationOwnerId, "quality-request", {
        quality: normalizeStreamQuality(streamQualitySelect.value)
    });
}

async function applyPeerQuality(peerId, quality) {
    const entry = peers.get(peerId);
    if (!entry) {
        return;
    }

    if (quality) {
        entry.quality = normalizeStreamQuality(quality);
    }

    const preset = STREAM_QUALITY_PRESETS[entry.quality || "auto"];
    const videoSender = entry.connection.getSenders().find((sender) => sender.track?.kind === "video");
    if (!videoSender) {
        return;
    }

    const parameters = videoSender.getParameters();
    parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}];
    parameters.degradationPreference = screenStream ? "maintain-framerate" : "balanced";
    const encoding = parameters.encodings[0];
    encoding.maxBitrate = preset.maxBitrate || SCREEN_SHARE_MAX_BITRATE;
    encoding.maxFramerate = preset.maxFramerate || SCREEN_CAPTURE_FRAME_RATE;
    encoding.priority = "high";
    encoding.networkPriority = "high";

    if (preset.targetHeight) {
        const sourceHeight = videoSender.track.getSettings().height || preset.targetHeight;
        encoding.scaleResolutionDownBy = Math.max(1, sourceHeight / preset.targetHeight);
    } else {
        delete encoding.scaleResolutionDownBy;
    }

    try {
        await videoSender.setParameters(parameters);
    } catch (error) {
        delete encoding.priority;
        delete encoding.networkPriority;
        delete parameters.degradationPreference;
        await videoSender.setParameters(parameters).catch(() => {});
    }
}

function buildPresentationStream(videoSource) {
    const tracks = [];
    tracks.push(...videoSource.getVideoTracks());
    tracks.push(...videoSource.getAudioTracks());

    if (localStream) {
        tracks.push(...localStream.getAudioTracks());
    }

    return new MediaStream(tracks);
}

function replaceVideoTrack(track) {
    peers.forEach((entry) => {
        const sender = entry.connection.getSenders().find((item) => item.track && item.track.kind === "video");
        if (sender) {
            sender.replaceTrack(track);
        }
    });
}

function stopScreenShare() {
    if (!screenStream) {
        return;
    }
    stopStream(screenStream);
    screenStream = null;
    shareButton.textContent = "Espelhar tela";
    announceScreenShareState(false);
    if (isPresentationOwner()) {
        localVideo.srcObject = localStream;
    }
    publishActiveStream();
}

async function startRecording() {
    if (!window.MediaRecorder) {
        alert("Este navegador nao suporta gravacao da aula.");
        return;
    }

    if (!screenStream && !localStream) {
        await startCamera();
    }

    const streamToRecord = getActivePresentationStream();
    if (!streamToRecord) {
        alert("Ligue a camera ou espelhe a tela antes de gravar.");
        return;
    }

    recordedChunks = [];
    activeRecordingLessonTitle = session?.room || stageRoomName.textContent.trim() || "Aula gravada";
    const recordingFormat = getSupportedRecordingFormat();
    mediaRecorder = new MediaRecorder(
        streamToRecord,
        recordingFormat.mimeType ? { mimeType: recordingFormat.mimeType } : undefined
    );

    mediaRecorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
            recordedChunks.push(event.data);
        }
    });

    mediaRecorder.addEventListener("stop", saveRecording);
    mediaRecorder.start(1000);
    recordButton.textContent = "Parar gravacao";
    recordButton.classList.add("recording");
    recordingStatus.textContent = "Gravando";
    recordingStatus.classList.remove("error");
    recordingStatus.hidden = false;
    showRecordingMessage("", false);
}

async function saveRecording() {
    recordButton.textContent = "Gravar aula";
    recordButton.classList.remove("recording");
    recordingStatus.hidden = true;

    if (!recordedChunks.length) {
        return;
    }

    const recordingFormat = getRecordingFormatFromMime(recordedChunks[0].type || mediaRecorder?.mimeType || "");
    const blob = new Blob(recordedChunks, { type: recordingFormat.mimeType });
    const fileName = `aula-${new Date().toISOString().replaceAll(":", "-").slice(0, 19)}.${recordingFormat.extension}`;
    const lessonTitle = activeRecordingLessonTitle || session?.room || "Aula gravada";
    const formData = new FormData();
    formData.append("file", blob, fileName);
    showRecordingMessage("Salvando gravacao da aula...", false);

    try {
        const response = await apiFetch(`/api/upload?recording=true&lessonTitle=${encodeURIComponent(lessonTitle)}`, {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            throw new Error("Nao foi possivel salvar a gravacao.");
        }

        showRecordingMessage("Gravacao salva na lista de aulas.", false);
        await loadLessons();
    } catch (error) {
        showRecordingMessage(error.message, true);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
    } finally {
        recordedChunks = [];
        activeRecordingLessonTitle = "";
        mediaRecorder = null;
    }
}

function getSupportedRecordingFormat() {
    const formats = [
        { mimeType: "video/mp4;codecs=avc1,mp4a.40.2", extension: "mp4" },
        { mimeType: "video/mp4;codecs=h264,aac", extension: "mp4" },
        { mimeType: "video/mp4", extension: "mp4" },
        { mimeType: "video/webm;codecs=vp9,opus", extension: "webm" },
        { mimeType: "video/webm;codecs=vp8,opus", extension: "webm" },
        { mimeType: "video/webm", extension: "webm" }
    ];
    return formats.find((format) => MediaRecorder.isTypeSupported(format.mimeType)) || formats.at(-1);
}

function getRecordingFormatFromMime(mimeType) {
    if (mimeType.includes("mp4")) {
        return { mimeType, extension: "mp4" };
    }

    return {
        mimeType: mimeType || "video/webm",
        extension: "webm"
    };
}

function stopStream(stream) {
    stream.getTracks().forEach((track) => track.stop());
}

function updateParticipants() {
    const sorted = [...participants.values()].sort(compareParticipants);
    participantCount.textContent = `${sorted.length} online`;
    if (meetTopParticipantCount) {
        meetTopParticipantCount.textContent = sorted.length;
    }
    participantList.innerHTML = sorted.map((participant) => {
        const isOwner = participant.id === presentationOwnerId;
        const canModerate = canModerateParticipant(participant);
        return `
            <div class="participant-row ${isOwner ? "presenting" : ""}">
                <span>
                    <strong>${escapeHtml(participant.name)}</strong>
                    <small>${roleLabel(participant.accountRole || participant.role)}${participant.muted ? " - mutado" : ""}</small>
                </span>
                <div class="participant-actions">
                    ${isOwner ? "<em>Tela principal</em>" : ""}
                    ${canModerate ? `
                        <button type="button" class="secondary-button" data-participant-action="mute" data-participant-id="${escapeHtml(participant.id)}">Mutar</button>
                        <button type="button" class="secondary-button danger-button" data-participant-action="kick" data-participant-id="${escapeHtml(participant.id)}">Expulsar</button>
                    ` : ""}
                </div>
            </div>
        `;
    }).join("");
}

function canModerateParticipant(participant) {
    return session
        && currentUserCanHost()
        && participant.id !== session.id
        && rolePriority(auth.user.role) <= rolePriority(participant.accountRole || participant.role);
}

async function muteParticipant(participantId) {
    if (!canModerateParticipant(participants.get(participantId))) {
        return;
    }
    await sendSignal(participantId, "force-mute", {});
}

async function kickParticipant(participantId) {
    const participant = participants.get(participantId);
    if (!canModerateParticipant(participant)) {
        return;
    }
    const confirmed = window.confirm(`Expulsar ${participant.name} da sala?`);
    if (!confirmed) {
        return;
    }
    await sendSignal(participantId, "kick", {});
}

function compareParticipants(a, b) {
    const roleDiff = rolePriority(a.accountRole || a.role) - rolePriority(b.accountRole || b.role);
    if (roleDiff !== 0) {
        return roleDiff;
    }
    return a.name.localeCompare(b.name, "pt-BR");
}

function rolePriority(role) {
    return {
        host: 0,
        mestre: 0,
        administrador: 1,
        aluno: 2,
        student: 2
    }[role] ?? 3;
}

function canParticipantPresent(participant) {
    const role = participant?.accountRole || participant?.role;
    return role === "mestre" || role === "administrador" || role === "host";
}

function firstPresentationCandidate(peers) {
    return [...peers].sort(compareParticipants).find(canParticipantPresent);
}

function nextPresentationOwnerId(leavingId = "") {
    const candidate = [...participants.values()]
        .filter((participant) => participant.id !== leavingId)
        .sort(compareParticipants)
        .find(canParticipantPresent);
    return candidate?.id || "";
}

function updatePresentationUi() {
    const owner = participants.get(presentationOwnerId);
    updateScreenPresentationClass();
    updateMeetPresentationUi(owner);
    localRoleLabel.textContent = owner ? "Tela principal" : "Tela principal";
    localNameLabel.textContent = owner ? owner.name : "Aguardando apresentador";
    requestScreenButton.hidden = !session || !currentUserCanHost() || isPresentationOwner();
    shareButton.disabled = Boolean(session && currentUserCanHost() && !isPresentationOwner());
    cameraButton.disabled = Boolean(session && currentUserCanHost() && !isPresentationOwner());
    streamQualityControl.hidden = !session || isPresentationOwner();
    streamQualitySelect.disabled = !presentationOwnerId;
    updateCameraButton();
    updateLocalCameraPreview();
    syncPresentationTileVisibility();
    updateParticipants();
    renderMainPresentation();
}

function syncPresentationTileVisibility() {
    remoteGrid.querySelectorAll("[data-peer-id]").forEach((tile) => {
        const isMainPresentation = Boolean(presentationOwnerId && tile.dataset.peerId === presentationOwnerId && !isPresentationOwner());
        tile.hidden = isMainPresentation;
    });
    sortWebcamTiles();
    queueRemoteScrollControlsUpdate();
}

function sortWebcamTiles() {
    const tiles = [...remoteGrid.children];
    tiles
        .sort((a, b) => compareParticipants(tileParticipant(a), tileParticipant(b)))
        .forEach((tile) => remoteGrid.appendChild(tile));
}

function tileParticipant(tile) {
    if (tile.dataset.localCamera === "true") {
        return {
            id: session?.id || "",
            name: auth?.user?.name || "Voce",
            accountRole: auth?.user?.role || "aluno"
        };
    }
    return participants.get(tile.dataset.peerId) || {
        id: tile.dataset.peerId || "",
        name: "",
        accountRole: "aluno"
    };
}

function updateScreenPresentationClass() {
    const isSharingScreen = isPresentationOwner()
        ? Boolean(screenStream)
        : Boolean(remoteScreenShareActive || presentationOwnerId);
    body.classList.toggle("is-screen-presenting", Boolean(session && presentationOwnerId && isSharingScreen));
}

function updateMeetPresentationUi(owner = participants.get(presentationOwnerId)) {
    const presenting = Boolean(session && isPresentationOwner() && screenStream);
    if (meetPresenterLabel) {
        const name = owner?.name || auth?.user?.name || "Voce";
        meetPresenterLabel.textContent = presenting
            ? `${name} (Voce, apresentando)`
            : (owner ? `${owner.name} esta apresentando` : "Aguardando apresentador");
    }
    if (stopPresentingButton) {
        stopPresentingButton.hidden = !presenting;
    }
}

function renderMainPresentation() {
    if (!session) {
        localVideo.srcObject = null;
        return;
    }
    configureLowLatencyVideo(localVideo);
    if (isPresentationOwner()) {
        localVideo.srcObject = getActivePresentationStream();
        return;
    }
    const ownerEntry = peers.get(presentationOwnerId);
    localVideo.srcObject = ownerEntry?.stream || null;
}

async function requestScreenControl() {
    if (!session || !currentUserCanHost()) {
        return;
    }
    if (!presentationOwnerId || presentationOwnerId === session.id) {
        presentationOwnerId = session.id;
        announcePresentationOwner();
        updatePresentationUi();
        publishActiveStream();
        return;
    }
    const owner = participants.get(presentationOwnerId);
    await sendSignal(presentationOwnerId, "presentation-request", {
        requesterId: session.id,
        requesterName: auth.user.name,
        requesterRole: auth.user.role
    });
    connectionStatus.textContent = owner ? `pedido enviado para ${owner.name}` : "pedido enviado";
}

async function handlePresentationRequest(from, payload) {
    if (!isPresentationOwner()) {
        return;
    }
    const requester = participants.get(payload?.requesterId || from) || participants.get(from);
    if (!requester || !canParticipantPresent(requester)) {
        return;
    }
    const accepted = window.confirm(`${requester.name} pediu para assumir a tela principal. Permitir troca?`);
    if (!accepted) {
        return;
    }
    presentationOwnerId = requester.id;
    announcePresentationOwner();
    updatePresentationUi();
    publishActiveStream();
}

function announcePresentationOwner(target = "") {
    if (!session || !presentationOwnerId) {
        return;
    }
    sendSignal(target, "presentation-owner", { ownerId: presentationOwnerId });
}

function announceScreenShareState(active, target = "") {
    if (!session || !isPresentationOwner()) {
        return;
    }
    sendSignal(target, "screen-share-state", { active });
}

function encodePayload(data) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(data || {}))));
}

function decodePayload(payload) {
    if (!payload) {
        return null;
    }
    return JSON.parse(decodeURIComponent(escape(atob(payload))));
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function showRecordingMessage(message, isError) {
    recordingMessage.textContent = message;
    recordingMessage.hidden = !message;
    recordingMessage.classList.toggle("error", isError);
}

function showLiveUploadMessage(message, isError) {
    liveUploadMessage.textContent = message;
    liveUploadMessage.classList.toggle("error", isError);
}

function isVideoFile(name, type) {
    return (type || "").startsWith("video/") || /\.(mp4|webm|mov|mkv|avi)$/i.test(name || "");
}

async function loadLessons() {
    if (!auth?.user) {
        recordingsList.innerHTML = "<div class='empty-state'>Faça login para ver as aulas.</div>";
        materialsList.innerHTML = "<div class='empty-state'>Faça login para ver os materiais.</div>";
        return;
    }
    recordingsList.innerHTML = "<div class='empty-state'>Carregando aulas gravadas...</div>";

    try {
        const response = await apiFetch("/api/lessons");
        if (!response.ok) {
            throw new Error("Não foi possível carregar as aulas.");
        }
        const lessons = await response.json();
        const rooms = await loadRoomLessonOptions();
        const lessonOptions = mergeLessonOptions(lessons, rooms);
        updateLessonSelects(lessonOptions);

        if (lessonOptions.length) {
            const selectedTitle = lessonSelectRecordings.value || lessonOptions[0].title;
            lessonSelectRecordings.value = selectedTitle;
            await loadLessonFiles(selectedTitle);
        } else {
            renderLessons([]);
        }
        lessonSelectMaterials.value = ALL_MATERIALS_VALUE;
        await loadAllMaterials();
    } catch (error) {
        recordingsList.innerHTML = "<div class='empty-state'>Não foi possível carregar as aulas.</div>";
        materialsList.innerHTML = "<div class='empty-state'>Nao foi possivel carregar os materiais.</div>";
    }
}

async function loadRoomLessonOptions() {
    try {
        const response = await apiFetch("/api/rooms");
        if (!response.ok) {
            return [];
        }
        const rooms = await response.json();
        return rooms.map((room) => ({ title: room.name, live: true }));
    } catch (error) {
        return [];
    }
}

function mergeLessonOptions(lessons, rooms) {
    const options = [];
    const seen = new Set();

    [...rooms, ...lessons].forEach((item) => {
        const title = (item.title || "").trim();
        if (!title || seen.has(title)) {
            return;
        }
        seen.add(title);
        options.push(item);
    });

    return options;
}

function updateLessonSelects(lessons) {
    const selects = [lessonSelectRecordings, lessonSelectMaterials];
    selects.forEach((select) => {
        const isMaterialsSelect = select === lessonSelectMaterials;
        const firstLabel = isMaterialsSelect
            ? "Todos os materiais"
            : "-- selecione uma aula --";
        const firstValue = isMaterialsSelect ? ALL_MATERIALS_VALUE : "";
        select.innerHTML = `<option value="${firstValue}">${firstLabel}</option>`;
        lessons.forEach((lesson) => {
            const option = document.createElement("option");
            option.value = lesson.title;
            option.textContent = lesson.live ? `${lesson.title} (ao vivo)` : lesson.title;
            select.appendChild(option);
        });
    });
}

function renderLessons(lessons) {
    if (!lessons.length) {
        recordingsList.innerHTML = "<div class=\"empty-state\">Nenhuma gravação encontrada para esta aula.</div>";
        return;
    }

    recordingsList.innerHTML = lessons.map((lesson, index) => {
        const size = formatBytes(lesson.size);
        const date = new Date(lesson.modified).toLocaleString("pt-BR");
        const href = `/download?name=${encodeURIComponent(lesson.name)}&token=${encodeURIComponent(auth?.token || "")}`;
        const videoId = `lesson-video-${index}`;

        return `
            <article class="lesson-card">
                <div class="lesson-actions">
                    <div>
                        <strong>${escapeHtml(lesson.title)}</strong>
                        <span>${escapeHtml(lesson.name)} - ${size} - ${date}</span>
                    </div>
                    <a class="download-link" href="${href}">Baixar</a>
                </div>
                <video id="${videoId}" controls preload="metadata" src="${href}"></video>
            </article>
        `;
    }).join("");
}

async function loadLessonFiles(title) {
    if (!title) {
        recordingsTitle.textContent = "Gravações";
        recordingsList.innerHTML = "<div class='empty-state'>Selecione uma aula.</div>";
        return;
    }

    recordingsTitle.textContent = title;
    recordingsList.innerHTML = "<div class='empty-state'>Carregando gravações...</div>";

    try {
        const response = await apiFetch(`/api/lessons?title=${encodeURIComponent(title)}`);
        if (!response.ok) {
            throw new Error("Não foi possível carregar a aula.");
        }
        const lesson = await response.json();
        const split = splitLessonFiles(lesson);
        renderLessons(split.recordings);
    } catch (error) {
        recordingsList.innerHTML = "<div class='empty-state'>Não foi possível carregar a aula.</div>";
    }
}

async function loadAllMaterials() {
    if (!auth?.user) {
        materialsList.innerHTML = "<div class='empty-state'>Faca login para ver os materiais.</div>";
        return;
    }

    materialsList.innerHTML = "<div class='empty-state'>Carregando materiais...</div>";

    try {
        const response = await apiFetch("/api/materials");
        if (!response.ok) {
            throw new Error("Nao foi possivel carregar os materiais.");
        }
        const groupedMaterials = await response.json();
        renderMaterials(flattenMaterialGroups(groupedMaterials), {
            emptyMessage: "Nenhum material enviado ainda.",
            showLessonTitle: true
        });
    } catch (error) {
        materialsList.innerHTML = "<div class='empty-state'>Nao foi possivel carregar os materiais.</div>";
    }
}

async function loadMaterialFiles(title) {
    if (title === ALL_MATERIALS_VALUE) {
        await loadAllMaterials();
        return;
    }

    if (!title) {
        materialsList.innerHTML = "<div class='empty-state'>Selecione uma aula.</div>";
        return;
    }

    materialsList.innerHTML = "<div class='empty-state'>Carregando materiais...</div>";

    try {
        const response = await apiFetch(`/api/lessons?title=${encodeURIComponent(title)}`);
        if (!response.ok) {
            throw new Error("Não foi possível carregar os materiais.");
        }
        const lesson = await response.json();
        renderMaterials(splitLessonFiles(lesson).materials);
    } catch (error) {
        materialsList.innerHTML = "<div class='empty-state'>Não foi possível carregar os materiais.</div>";
    }
}

function startLiveMaterialsRefresh() {
    stopLiveMaterialsRefresh();
    liveMaterialsRefreshId = window.setInterval(() => {
        loadLiveMaterials().catch(() => {});
    }, 4000);
}

function stopLiveMaterialsRefresh() {
    if (liveMaterialsRefreshId) {
        window.clearInterval(liveMaterialsRefreshId);
        liveMaterialsRefreshId = null;
    }
}

async function loadLiveMaterials(options = {}) {
    if (!session || !auth?.user) {
        liveMaterialsList.innerHTML = "<div class='empty-state'>Entre na aula para ver os materiais.</div>";
        return;
    }

    try {
        const response = await apiFetch(`/api/lessons?title=${encodeURIComponent(session.room)}`);
        if (!response.ok) {
            throw new Error("Nao foi possivel carregar os materiais.");
        }
        const lesson = await response.json();
        const materials = splitLessonFiles(lesson).materials;
        renderLiveMaterials(materials, options);
    } catch (error) {
        if (options.force || !liveMaterialsList.innerHTML) {
            liveMaterialsList.innerHTML = "<div class='empty-state'>Nao foi possivel carregar os materiais.</div>";
        }
    }
}

function renderLiveMaterials(materials, options = {}) {
    const signature = materials
        .map((material) => `${material.name}|${material.size}|${material.uploadedAt || material.modified}`)
        .join(";");

    if (!options.force && signature === liveMaterialsSignature) {
        return;
    }

    liveMaterialsSignature = signature;
    renderMaterialCards(liveMaterialsList, materials, {
        emptyMessage: "Nenhum material enviado para esta aula ainda."
    });
}

async function refreshUploadedMaterials(lessonTitle) {
    if (session) {
        if (lessonTitle === session.room) {
            await loadLiveMaterials({ force: true });
            await sendSignal("", "materials-updated", { lessonTitle });
        }
        return;
    }

    await loadLessons();
}

function flattenMaterialGroups(groups) {
    return Object.entries(groups || {}).flatMap(([lessonTitle, materials]) => {
        if (!Array.isArray(materials)) {
            return [];
        }
        return materials.map((material) => ({
            ...material,
            lessonTitle: material.lessonTitle || lessonTitle
        }));
    });
}

function renderMaterials(materials, options = {}) {
    renderMaterialCards(materialsList, materials, options);
}

function renderMaterialCards(container, materials, options = {}) {
    if (!materials.length) {
        const message = options.emptyMessage || "Nenhum material encontrado para esta aula.";
        container.innerHTML = `<div class='empty-state'>${escapeHtml(message)}</div>`;
        return;
    }

    container.innerHTML = materials.map((material) => {
        const size = formatBytes(material.size);
        const date = new Date(material.uploadedAt || material.modified).toLocaleString("pt-BR");
        const href = `/download?name=${encodeURIComponent(material.name)}&token=${encodeURIComponent(auth?.token || "")}`;
        const lesson = options.showLessonTitle && material.lessonTitle ? `${escapeHtml(material.lessonTitle)} - ` : "";

        return `
            <article class="file-card">
                <div>
                    <strong>${escapeHtml(material.name)}</strong>
                    <span>${lesson}${size} - ${date}</span>
                </div>
                <a class="download-link" href="${href}">Baixar</a>
            </article>
        `;
    }).join("");
}

function splitLessonFiles(lesson) {
    const recordings = lesson.recordings || [];
    const materials = lesson.materials || [];
    const videoRecordings = recordings.filter((recording) => isVideoFile(recording.name, recording.type));
    const materialRecordings = recordings
        .filter((recording) => !isVideoFile(recording.name, recording.type))
        .map((recording) => ({
            lessonTitle: lesson.title,
            name: recording.name,
            size: recording.size,
            uploadedAt: recording.modified,
            type: recording.type
        }));

    return {
        recordings: videoRecordings,
        materials: [...materials, ...materialRecordings]
    };
}

async function loadUsers() {
    if (!auth?.user || !["mestre", "administrador"].includes(auth.user.role)) {
        userList.innerHTML = "";
        return;
    }

    userList.innerHTML = "<div class=\"empty-state\">Carregando usuarios...</div>";
    try {
        const response = await apiFetch("/api/users");
        if (!response.ok) {
            throw new Error("Nao foi possivel carregar usuarios.");
        }
        const users = await response.json();
        userList.innerHTML = users.map((user) => {
            const canDelete = auth.user.role === "mestre" && user.username !== auth.user.username;
            return `
                <article class="file-card">
                    <div>
                        <strong>${escapeHtml(user.name)}</strong>
                        <span>${escapeHtml(user.username)} - ${roleLabel(user.role)} - ${escapeHtml(user.company)}</span>
                    </div>
                    ${canDelete ? `<button class="secondary-button" data-delete-user="${escapeHtml(user.username)}">Remover</button>` : ""}
                </article>
            `;
        }).join("");

        userList.querySelectorAll("[data-delete-user]").forEach((button) => {
            button.addEventListener("click", () => deleteUser(button.dataset.deleteUser));
        });
    } catch (error) {
        userList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
}

async function createUser() {
    userMessage.textContent = "Criando usuario...";
    userMessage.classList.remove("error");

    try {
        const response = await apiFetch("/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: newUserNameInput.value.trim(),
                username: newUsernameInput.value.trim(),
                password: newPasswordInput.value,
                role: newRoleInput.value,
                company: newCompanyInput.value.trim()
            })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "Nao foi possivel criar usuario.");
        }
        userForm.reset();
        userMessage.textContent = "Usuario criado.";
        await loadUsers();
    } catch (error) {
        userMessage.textContent = error.message;
        userMessage.classList.add("error");
    }
}

async function deleteUser(username) {
    const response = await apiFetch(`/api/users?username=${encodeURIComponent(username)}`, {
        method: "DELETE"
    });
    if (response.ok) {
        await loadUsers();
    }
}

async function initAuth() {
    if (auth?.token) {
        try {
            const response = await apiFetch("/api/auth/me");
            if (!response.ok) {
                throw new Error("Sessao expirada");
            }
            const data = await response.json();
            auth.user = data.user;
            localStorage.setItem("treinalive_auth", JSON.stringify(auth));
        } catch (error) {
            auth = null;
            localStorage.removeItem("treinalive_auth");
        }
    }
    applyAuthUi();
    if (currentUserCanHost()) {
        await loadUsers();
    }
}

function formatBytes(bytes) {
    if (bytes === 0) {
        return "0 B";
    }

    const units = ["B", "KB", "MB", "GB"];
    const index = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, index);
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}

function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#039;");
}

function ensureSideWebcamStyles() {
    document.querySelector("#sideWebcamStyles")?.remove();
}

ensureSideWebcamStyles();
updateRoomPrivacyUi();
initAuth();
