const body = document.body;
const authPanel = document.querySelector("#authPanel");
const dashboardPanel = document.querySelector("#dashboardPanel");
const livePanel = document.querySelector("#livePanel");
const managementPanel = document.querySelector("#managementPanel");
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
const recordButton = document.querySelector("#recordButton");
const leaveButton = document.querySelector("#leaveButton");
const localVideo = document.querySelector("#localVideo");
const localRoleLabel = document.querySelector("#localRoleLabel");
const localNameLabel = document.querySelector("#localNameLabel");
const recordingStatus = document.querySelector("#recordingStatus");
const remoteGrid = document.querySelector("#remoteGrid");
const participantCount = document.querySelector("#participantCount");
const uploadForm = document.querySelector("#uploadForm");
const uploadMessage = document.querySelector("#uploadMessage");
const lessonSelectInput = document.querySelector("#lessonSelectInput");
const lessonList = document.querySelector("#lessonList");
const fileList = document.querySelector("#fileList");
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
const stageRoomName = document.querySelector("#stageRoomName");

// Elementos das tabs
const tabButtons = document.querySelectorAll(".tab-button");
const tabLive = document.querySelector("#tab-live");
const tabRecordings = document.querySelector("#tab-recordings");
const tabMaterials = document.querySelector("#tab-materials");

const peers = new Map();
const participants = new Map();
const rtcConfig = {
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
let pollStopped = true;
let muted = false;
let auth = JSON.parse(localStorage.getItem("treinalive_auth") || "null");

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await login();
});

createRoomForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const roomName = newRoomNameInput.value.trim();
    if (roomName) {
        await joinRoomByName(roomName);
        newRoomNameInput.value = "";
    }
});

logoutButton.addEventListener("click", logout);

// Tabs do dashboard
tabButtons.forEach(button => {
    button.addEventListener("click", () => {
        const tab = button.dataset.tab;
        
        // Atualizar botões
        tabButtons.forEach(btn => btn.classList.remove("active"));
        button.classList.add("active");
        
        // Atualizar conteúdo
        tabLive.hidden = tab !== "live";
        tabRecordings.hidden = tab !== "recordings";
        tabMaterials.hidden = tab !== "materials";
    });
});

cameraButton.addEventListener("click", async () => {
    if (localStream) {
        stopStream(localStream);
        localStream = null;
        localVideo.srcObject = null;
        cameraButton.textContent = "Ligar camera";
        publishActiveStream();
        return;
    }
    await startCamera();
});

muteButton.addEventListener("click", () => {
    if (!localStream) {
        return;
    }

    muted = !muted;
    localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
    });
    muteButton.textContent = muted ? "Mudo" : "Mic";
});

shareButton.addEventListener("click", async () => {
    if (screenStream) {
        stopScreenShare();
        return;
    }

    try {
        if (!localStream) {
            await startCamera();
        }
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        localVideo.srcObject = screenStream;
        shareButton.textContent = "Parar espelhamento";
        publishActiveStream();
        screenStream.getVideoTracks()[0].addEventListener("ended", stopScreenShare);
    } catch (error) {
        alert("Compartilhamento de tela cancelado.");
    }
});

recordButton.addEventListener("click", async () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        return;
    }
    await startRecording();
});

leaveButton.addEventListener("click", leaveRoom);
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

uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(uploadForm);
    const file = formData.get("file");

    if (!file || !file.name) {
        showUploadMessage("Selecione um arquivo para enviar.", true);
        return;
    }

    showUploadMessage("Enviando arquivo...", false);

    try {
        const lessonTitle = lessonTitleInput.value.trim() || "Aula gravada";
        const response = await apiFetch(`/api/upload?recording=true&lessonTitle=${encodeURIComponent(lessonTitle)}`, {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Falha ao enviar arquivo");
        }

        uploadForm.reset();
        showUploadMessage("Arquivo enviado com sucesso.", false);
        await loadFiles();
    } catch (error) {
        showUploadMessage(error.message, true);
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
        await loadFiles();
        await loadUsers();
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
    
    // Controlar visibilidade dos painéis
    authPanel.hidden = Boolean(user);
    dashboardPanel.hidden = !user;
    livePanel.hidden = true;
    managementPanel.hidden = !user || user.role === "aluno";
    
    logoutButton.hidden = !user;
    userStatus.textContent = user ? `${user.name} - ${roleLabel(user.role)}` : "Não autenticado";
    connectionStatus.textContent = user ? "autenticado" : "offline";

    const canHost = user && user.role !== "aluno";
    body.dataset.role = canHost ? "host" : "student";
    localRoleLabel.textContent = canHost ? "Host local" : "Aluno";
    if (user) {
        localNameLabel.textContent = user.name;
    }
    [...newRoleInput.options].forEach((option) => {
        option.disabled = user?.role === "administrador" && option.value !== "aluno";
    });
    if (user?.role === "administrador") {
        newRoleInput.value = "aluno";
    }
    
    // Se logado, carregar dados do dashboard
    if (user) {
        loadRooms();
        loadLessons();
        loadFiles();
        loadUsers();
    }
}

function roleLabel(role) {
    return {
        mestre: "Mestre",
        administrador: "Administrador",
        aluno: "Aluno"
    }[role] || role;
}

// Funções do Dashboard
async function loadRooms() {
    if (!auth?.user) {
        liveRoomsList.innerHTML = "<div class='empty-state'>Faça login para ver as salas.</div>";
        return;
    }
    
    liveRoomsList.innerHTML = "<div class='empty-state'>Carregando salas...</div>";
    
    try {
        const response = await apiFetch("/api/rooms");
        if (!response.ok) {
            throw new Error("Não foi possível carregar as salas.");
        }
        const rooms = await response.json();
        renderRooms(rooms);
    } catch (error) {
        liveRoomsList.innerHTML = "<div class='empty-state'>Não foi possível carregar as salas.</div>";
    }
}

function renderRooms(rooms) {
    if (!rooms.length) {
        liveRoomsList.innerHTML = "<div class='empty-state'>Nenhuma aula ao vivo no momento.<br>Crie uma nova sala se for host.</div>";
        return;
    }
    
    liveRoomsList.innerHTML = rooms.map(room => {
        const canJoin = auth?.user && auth.user.role !== "aluno";
        return `
            <article class="room-card">
                <div class="room-info">
                    <h3>${escapeHtml(room.name)}</h3>
                    <span class="room-participants">${room.participants} participante(s) online</span>
                </div>
                <button class="primary-button ${canJoin ? '' : 'disabled'}" 
                        ${canJoin ? '' : 'disabled'} 
                        onclick="joinRoomByName('${escapeHtml(room.name)}')">
                    Entrar
                </button>
            </article>
        `;
    }).join("");
}

async function joinRoomByName(roomName) {
    if (!auth?.user) {
        return;
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
        body: JSON.stringify({ room: roomName })
    });

    if (!response.ok) {
        alert("Não foi possível entrar na sala.");
        connectionStatus.textContent = "offline";
        return;
    }

    const data = await response.json();
    session = { id: data.id, room: roomName };
    roomStatus.textContent = `Sala: ${roomName}`;
    stageRoomName.textContent = roomName;
    connectionStatus.textContent = "online";

    // Mostrar painel ao vivo
    dashboardPanel.hidden = true;
    livePanel.hidden = false;

    // Conectar peers existentes
    for (const peer of data.peers) {
        createPeerConnection(peer.id, peer.name, peer.role, true);
    }

    // Iniciar polling
    startPolling();
    publishActiveStream();
}

async function leaveRoom() {
    if (!session) {
        return;
    }

    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
    }

    pollStopped = true;
    await apiFetch("/api/session/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: session.room, id: session.id })
    }).catch(() => {});

    peers.forEach((entry) => entry.connection.close());
    peers.clear();
    participants.clear();
    remoteGrid.innerHTML = "";
    updateParticipants();
    session = null;
    
    // Voltar ao dashboard
    livePanel.hidden = true;
    dashboardPanel.hidden = false;
    connectionStatus.textContent = "autenticado";
    roomStatus.textContent = "Plataforma de treinamentos";
    
    // Recarregar salas
    loadRooms();
}

async function startCamera() {
    if (localStream) {
        return localStream;
    }

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        muted = false;
        muteButton.textContent = "Mic";
        cameraButton.textContent = "Desligar camera";
        publishActiveStream();
        return localStream;
    } catch (error) {
        alert("Nao foi possivel acessar a webcam. Verifique as permissoes do navegador.");
        return null;
    }
}

async function pollSignals() {
    while (!pollStopped && session) {
        try {
            const response = await apiFetch(`/api/session/poll?room=${encodeURIComponent(session.room)}&id=${encodeURIComponent(session.id)}`);
            if (!response.ok) {
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
        return;
    }

    if (message.type === "peer-left") {
        removePeer(message.from);
        return;
    }

    const payload = decodePayload(message.payload);
    const peer = participants.get(message.from) || { id: message.from, name: "Participante", role: "student" };
    let entry = peers.get(message.from);

    if (!entry) {
        entry = createPeerConnection(peer, false);
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
    const entry = { connection, peer, video: createRemoteTile(peer) };
    peers.set(peer.id, entry);

    if (shouldOffer) {
        connection.createDataChannel("presence");
    }

    const activeStream = getActivePresentationStream();
    if (activeStream) {
        activeStream.getTracks().forEach((track) => connection.addTrack(track, activeStream));
    }

    connection.addEventListener("icecandidate", (event) => {
        if (event.candidate) {
            sendSignal(peer.id, "ice", event.candidate);
        }
    });

    connection.addEventListener("track", (event) => {
        entry.video.srcObject = event.streams[0];
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
        return tile.querySelector("video");
    }

    tile = document.createElement("article");
    tile.className = "video-tile small-tile online";
    tile.dataset.peerId = peer.id;
    tile.dataset.state = "new";
    tile.innerHTML = `
        <video autoplay playsinline></video>
        <div class="remote-label">
            <strong>${escapeHtml(peer.name)}</strong>
            <span>${peer.role === "host" ? "Host" : "Aluno"}</span>
        </div>
    `;
    remoteGrid.appendChild(tile);
    updateParticipants();
    return tile.querySelector("video");
}

function removePeer(peerId) {
    const entry = peers.get(peerId);
    if (entry) {
        entry.connection.close();
        peers.delete(peerId);
    }
    participants.delete(peerId);
    document.querySelector(`[data-peer-id="${peerId}"]`)?.remove();
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
    });
}

function publishActiveStream() {
    replaceTracks(getActivePresentationStream());
    peers.forEach((entry) => {
        if (entry.connection.signalingState === "stable") {
            createOffer(entry.peer.id);
        }
    });
}

function getActivePresentationStream() {
    if (screenStream) {
        return buildPresentationStream(screenStream);
    }
    return localStream;
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
    localVideo.srcObject = localStream;
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
    recordingStatus.hidden = false;
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
    const formData = new FormData();
    formData.append("file", blob, fileName);
    showUploadMessage("Salvando gravacao da aula...", false);

    try {
        const response = await apiFetch("/api/upload", {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            throw new Error("Nao foi possivel salvar a gravacao.");
        }

        showUploadMessage("Gravacao salva na lista de aulas.", false);
        await loadFiles();
    } catch (error) {
        showUploadMessage(error.message, true);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
    } finally {
        recordedChunks = [];
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
    const total = participants.size + (session ? 1 : 0);
    participantCount.textContent = `${total} online`;
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

function showUploadMessage(message, isError) {
    uploadMessage.textContent = message;
    uploadMessage.classList.toggle("error", isError);
}

async function loadLessons() {
    if (!auth?.user) {
        lessonList.innerHTML = "<div class='empty-state'>Faça login para ver as aulas.</div>";
        return;
    }
    lessonList.innerHTML = "<div class='empty-state'>Carregando aulas gravadas...</div>";

    try {
        const response = await apiFetch("/api/lessons");
        if (!response.ok) {
            throw new Error("Não foi possível carregar as aulas.");
        }
        const lessons = await response.json();
        renderLessons(lessons);
        
        // Atualizar select de vinculação
        updateLessonSelect(lessons);
    } catch (error) {
        lessonList.innerHTML = "<div class='empty-state'>Não foi possível carregar as aulas.</div>";
    }
}

function updateLessonSelect(lessons) {
    lessonSelectInput.innerHTML = '<option value="">Nenhuma - apenas material avulso</option>';
    lessons.forEach(lesson => {
        const option = document.createElement("option");
        option.value = lesson.title;
        option.textContent = lesson.title;
        lessonSelectInput.appendChild(option);
    });
}

async function loadFiles() {
    if (!auth?.user) {
        fileList.innerHTML = "<div class='empty-state'>Faça login para ver os materiais.</div>";
        return;
    }
    fileList.innerHTML = "<div class='empty-state'>Carregando materiais...</div>";

    try {
        const response = await apiFetch("/api/files");
        if (!response.ok) {
            throw new Error("Não foi possível carregar os materiais.");
        }
        const files = await response.json();
        renderFiles(files);
    } catch (error) {
        fileList.innerHTML = "<div class='empty-state'>Não foi possível carregar os materiais.</div>";
    }
}

function renderFiles(files) {
    if (!files.length) {
        fileList.innerHTML = "<div class='empty-state'>Nenhum material enviado ainda.</div>";
        return;
    }

    fileList.innerHTML = files.map((file) => {
        const size = formatBytes(file.size);
        const date = new Date(file.modified).toLocaleString("pt-BR");
        const href = `/download?name=${encodeURIComponent(file.name)}&token=${encodeURIComponent(auth?.token || "")}`;

        return `
            <article class="file-card">
                <div>
                    <strong>${escapeHtml(file.name)}</strong>
                    <span>${size} - ${date}</span>
                </div>
                <a class="download-link" href="${href}">Baixar</a>
            </article>
        `;
    }).join("");
}

function renderLessons(lessons) {
    if (!lessons.length) {
        lessonList.innerHTML = "<div class=\"empty-state\">Nenhuma aula gravada ainda.</div>";
        return;
    }

    lessonList.innerHTML = lessons.map((lesson, index) => {
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
    await loadFiles();
    await loadUsers();
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

initAuth();
