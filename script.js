// Configuração do Firebase (substitua com suas credenciais)
const firebaseConfig = {
    apiKey: "AIzaSyCP-fUHlTE5CokRx26r6MKUuxqxHuAJXiI",
    authDomain: "salacinemavirtual.firebaseapp.com",
    projectId: "salacinemavirtual",
    storageBucket: "salacinemavirtual.firebasestorage.app",
    messagingSenderId: "452146827346",
    appId: "1:452146827346:web:df92c4008cf9e0f3218f8b"
  };

// Inicializa Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Elementos do DOM
const roomIdInput = document.getElementById('roomId');
const createRoomBtn = document.getElementById('createRoom');
const joinRoomBtn = document.getElementById('joinRoom');
const videoLinkInput = document.getElementById('videoLink');
const loadVideoBtn = document.getElementById('loadVideo');
const videoPlayer = document.getElementById('videoPlayer');
const statusDiv = document.getElementById('status');
const syncStatusDiv = document.getElementById('syncStatus');

// Variáveis globais
let currentRoomId = null;
let isSyncing = false;
let lastUpdateTime = 0;
let ytPlayer = null;

// ===== [1] INICIALIZAÇÃO =====
// YouTube Player API
function onYouTubeIframeAPIReady() {
    ytPlayer = new YT.Player('ytPlayer', {
        height: '100%',
        width: '100%',
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady(event) {
    console.log("YouTube Player pronto");
}

function onPlayerStateChange(event) {
    if (!currentRoomId || isSyncing) return;
    
    isSyncing = true;
    syncStatusDiv.textContent = "Sincronizando...";
    
    if (event.data == YT.PlayerState.PLAYING) {
        db.collection("rooms").doc(currentRoomId).update({
            isPlaying: true,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
    } else if (event.data == YT.PlayerState.PAUSED) {
        db.collection("rooms").doc(currentRoomId).update({
            isPlaying: false,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
    
    setTimeout(() => {
        isSyncing = false;
        syncStatusDiv.textContent = "Sincronizado";
    }, 1000);
}

// ===== [2] CONTROLE DE SALAS =====
createRoomBtn.addEventListener('click', () => {
    currentRoomId = Math.random().toString(36).substring(2, 8);
    db.collection("rooms").doc(currentRoomId).set({
        videoURL: "",
        isPlaying: false,
        currentTime: 0,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
    roomIdInput.value = currentRoomId;
    statusDiv.textContent = `Sala criada: ${currentRoomId}`;
    syncRoom(currentRoomId);
});

joinRoomBtn.addEventListener('click', () => {
    currentRoomId = roomIdInput.value.trim();
    if (!currentRoomId) return alert("Digite um ID de sala!");
    syncRoom(currentRoomId);
    statusDiv.textContent = `Conectado à sala: ${currentRoomId}`;
});

// ===== [3] CARREGAR VÍDEO =====
loadVideoBtn.addEventListener('click', () => {
    const videoURL = videoLinkInput.value.trim();
    if (!videoURL) return alert("Digite um link válido!");

    if (isYouTubeVideo(videoURL)) {
        loadYouTubeVideo(videoURL);
    } else {
        loadMP4Video(videoURL);
    }

    if (currentRoomId) {
        db.collection("rooms").doc(currentRoomId).update({
            videoURL: videoURL,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
});

function isYouTubeVideo(url) {
    return url.includes("youtube.com") || url.includes("youtu.be");
}

function loadYouTubeVideo(url) {
    const videoId = extractYouTubeId(url);
    if (!videoId) return alert("Link do YouTube inválido!");

    document.getElementById('ytPlayer').style.display = "block";
    videoPlayer.style.display = "none";
    
    if (ytPlayer) {
        ytPlayer.loadVideoById(videoId);
    }
}

function loadMP4Video(url) {
    document.getElementById('ytPlayer').style.display = "none";
    videoPlayer.style.display = "block";
    videoPlayer.src = url;
}

function extractYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// ===== [4] SINCRONIZAÇÃO =====
function syncRoom(roomId) {
    db.collection("rooms").doc(roomId).onSnapshot((doc) => {
        const data = doc.data();
        if (!data) return;

        // Evita loop de sincronização
        if (isSyncing) return;
        
        // Sincroniza o vídeo
        if (data.videoURL && data.videoURL !== videoLinkInput.value) {
            videoLinkInput.value = data.videoURL;
            loadVideoBtn.click();
        }

        // Sincroniza play/pause
        const now = Date.now();
        if (now - lastUpdateTime > 1000) { // Limite de 1s entre atualizações
            if (data.isPlaying) {
                if (videoPlayer.style.display === "block" && videoPlayer.paused) {
                    videoPlayer.play().catch(e => console.log("Erro ao dar play:", e));
                }
            } else {
                if (videoPlayer.style.display === "block" && !videoPlayer.paused) {
                    videoPlayer.pause();
                }
            }
            lastUpdateTime = now;
        }
    });
}

// Eventos para vídeos MP4
videoPlayer.addEventListener('play', () => {
    if (!currentRoomId || isSyncing) return;
    
    isSyncing = true;
    syncStatusDiv.textContent = "Sincronizando...";
    
    db.collection("rooms").doc(currentRoomId).update({
        isPlaying: true,
        currentTime: videoPlayer.currentTime,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        isSyncing = false;
        syncStatusDiv.textContent = "Sincronizado";
    });
});

videoPlayer.addEventListener('pause', () => {
    if (!currentRoomId || isSyncing) return;
    
    isSyncing = true;
    syncStatusDiv.textContent = "Sincronizando...";
    
    db.collection("rooms").doc(currentRoomId).update({
        isPlaying: false,
        currentTime: videoPlayer.currentTime,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        isSyncing = false;
        syncStatusDiv.textContent = "Sincronizado";
    });
});

// Atualiza o tempo periodicamente
setInterval(() => {
    if (currentRoomId && !isSyncing && videoPlayer.style.display === "block" && !videoPlayer.paused) {
        db.collection("rooms").doc(currentRoomId).update({
            currentTime: videoPlayer.currentTime,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
}, 3000);
