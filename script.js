// Configuração do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCP-fUHlTE5CokRx26r6MKUuxqxHuAJXiI",
    authDomain: "salacinemavirtual.firebaseapp.com",
    projectId: "salacinemavirtual",
    storageBucket: "salacinemavirtual.firebasestorage.app",
    messagingSenderId: "452146827346",
    appId: "1:452146827346:web:df92c4008cf9e0f3218f8b"
  };

// Inicialização
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Variáveis globais
let currentRoomId = null;
let isSyncing = false;
let lastSyncTime = 0;
let ytPlayer = null;
let currentVideoType = null; // 'youtube' ou 'mp4'

// Elementos DOM
const elements = {
    roomId: document.getElementById('roomId'),
    createRoom: document.getElementById('createRoom'),
    joinRoom: document.getElementById('joinRoom'),
    videoLink: document.getElementById('videoLink'),
    loadVideo: document.getElementById('loadVideo'),
    videoPlayer: document.getElementById('videoPlayer'),
    ytPlayerContainer: document.getElementById('ytPlayer'),
    status: document.getElementById('status'),
    syncStatus: document.getElementById('syncStatus')
};

// Inicialização do Player do YouTube
function onYouTubeIframeAPIReady() {
    ytPlayer = new YT.Player('ytPlayer', {
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady() {
    console.log("YouTube Player pronto");
    updateStatus("YouTube Player carregado");
}

// Controles de Sala
elements.createRoom.addEventListener('click', createRoom);
elements.joinRoom.addEventListener('click', joinRoom);
elements.loadVideo.addEventListener('click', loadVideoHandler);

// Funções principais
function createRoom() {
    currentRoomId = generateRoomId();
    db.collection("rooms").doc(currentRoomId).set({
        videoURL: "",
        videoType: "",
        isPlaying: false,
        currentTime: 0,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
    elements.roomId.value = currentRoomId;
    updateStatus(`Sala criada: ${currentRoomId}`);
    syncRoom(currentRoomId);
}

function joinRoom() {
    currentRoomId = elements.roomId.value.trim();
    if (!currentRoomId) return alert("Digite um ID de sala!");
    updateStatus(`Conectando à sala: ${currentRoomId}`);
    syncRoom(currentRoomId);
}

function loadVideoHandler() {
    const videoURL = elements.videoLink.value.trim();
    if (!videoURL) return alert("Digite um link válido!");

    if (isYouTubeVideo(videoURL)) {
        loadYouTubeVideo(videoURL);
        currentVideoType = 'youtube';
    } else {
        loadMP4Video(videoURL);
        currentVideoType = 'mp4';
    }

    if (currentRoomId) {
        db.collection("rooms").doc(currentRoomId).update({
            videoURL: videoURL,
            videoType: currentVideoType,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
}

// Sincronização
function syncRoom(roomId) {
    db.collection("rooms").doc(roomId).onSnapshot((doc) => {
        const data = doc.data();
        if (!data) return;

        // Evita loops de sincronização
        if (isSyncing) return;
        
        // Sincroniza o vídeo
        if (data.videoURL && data.videoURL !== elements.videoLink.value) {
            elements.videoLink.value = data.videoURL;
            if (data.videoType === 'youtube') {
                loadYouTubeVideo(data.videoURL);
            } else {
                loadMP4Video(data.videoURL);
            }
        }

        // Sincroniza o estado de reprodução
        const now = Date.now();
        if (now - lastSyncTime > 1000) { // Limite de 1s entre sincronizações
            if (data.isPlaying) {
                if (currentVideoType === 'mp4' && elements.videoPlayer.paused) {
                    playVideo();
                } else if (currentVideoType === 'youtube' && ytPlayer.getPlayerState() !== YT.PlayerState.PLAYING) {
                    ytPlayer.playVideo();
                }
            } else {
                if (currentVideoType === 'mp4' && !elements.videoPlayer.paused) {
                    pauseVideo();
                } else if (currentVideoType === 'youtube' && ytPlayer.getPlayerState() !== YT.PlayerState.PAUSED) {
                    ytPlayer.pauseVideo();
                }
            }
            lastSyncTime = now;
        }
    });
}

// Funções auxiliares
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8);
}

function updateStatus(message) {
    elements.status.textContent = message;
    console.log(message);
}

function isYouTubeVideo(url) {
    return url.includes("youtube.com") || url.includes("youtu.be");
}

function loadYouTubeVideo(url) {
    const videoId = extractYouTubeId(url);
    if (!videoId) return alert("Link do YouTube inválido!");

    elements.ytPlayerContainer.style.display = "block";
    elements.videoPlayer.style.display = "none";
    
    if (ytPlayer) {
        ytPlayer.loadVideoById(videoId);
        updateStatus("Carregando vídeo do YouTube...");
    }
}

function loadMP4Video(url) {
    elements.ytPlayerContainer.style.display = "none";
    elements.videoPlayer.style.display = "block";
    elements.videoPlayer.src = url;
    updateStatus("Carregando vídeo MP4...");
}

function extractYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// Controles de vídeo
function playVideo() {
    elements.videoPlayer.play().catch(e => {
        console.error("Erro ao dar play:", e);
        updateStatus("Erro ao reproduzir vídeo");
    });
}

function pauseVideo() {
    elements.videoPlayer.pause();
}

// Event listeners para vídeo MP4
elements.videoPlayer.addEventListener('play', () => {
    if (!currentRoomId || isSyncing || currentVideoType !== 'mp4') return;
    
    isSyncing = true;
    elements.syncStatus.textContent = "Sincronizando...";
    
    db.collection("rooms").doc(currentRoomId).update({
        isPlaying: true,
        currentTime: elements.videoPlayer.currentTime,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        isSyncing = false;
        elements.syncStatus.textContent = "Sincronizado";
    });
});

elements.videoPlayer.addEventListener('pause', () => {
    if (!currentRoomId || isSyncing || currentVideoType !== 'mp4') return;
    
    isSyncing = true;
    elements.syncStatus.textContent = "Sincronizando...";
    
    db.collection("rooms").doc(currentRoomId).update({
        isPlaying: false,
        currentTime: elements.videoPlayer.currentTime,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        isSyncing = false;
        elements.syncStatus.textContent = "Sincronizado";
    });
});

// Atualização periódica do tempo
setInterval(() => {
    if (!currentRoomId || isSyncing) return;
    
    if (currentVideoType === 'mp4' && !elements.videoPlayer.paused) {
        db.collection("rooms").doc(currentRoomId).update({
            currentTime: elements.videoPlayer.currentTime,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
}, 3000);
