// Configuração do Firebase (substitua com seus dados!)
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
const ytPlayer = document.getElementById('ytPlayer');
const videoPlayer = document.getElementById('videoPlayer');
const statusDiv = document.getElementById('status');

// Variáveis globais
let currentRoomId = null;

// ===== [1] CRIAR/ENTRAR NA SALA =====
createRoomBtn.addEventListener('click', () => {
    currentRoomId = Math.random().toString(36).substring(2, 8);
    db.collection("rooms").doc(currentRoomId).set({
        videoURL: "",
        isPlaying: false,
        currentTime: 0
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

// ===== [2] CARREGAR VÍDEO POR LINK =====
loadVideoBtn.addEventListener('click', () => {
    const videoURL = videoLinkInput.value.trim();
    if (!videoURL) return alert("Digite um link válido!");

    // Verifica se é YouTube
    if (videoURL.includes("youtube.com") || videoURL.includes("youtu.be")) {
        const videoId = extractYoutubeId(videoURL);
        if (!videoId) return alert("Link do YouTube inválido!");

        ytPlayer.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1`;
        ytPlayer.style.display = "block";
        videoPlayer.style.display = "none";
    } 
    // Se for MP4 ou similar
    else {
        ytPlayer.style.display = "none";
        videoPlayer.style.display = "block";
        videoPlayer.src = videoURL;
    }

    // Salva no Firestore
    if (currentRoomId) {
        db.collection("rooms").doc(currentRoomId).update({ videoURL });
    }
});

// Extrai ID do YouTube (ex: "https://youtu.be/dQw4w9WgXcQ" → "dQw4w9WgXcQ")
function extractYoutubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// ===== [3] SINCRONIZAR SALA =====
function syncRoom(roomId) {
    db.collection("rooms").doc(roomId).onSnapshot((doc) => {
        const data = doc.data();
        if (!data) return;

        // Atualiza o vídeo se o link mudar
        if (data.videoURL && data.videoURL !== videoLinkInput.value) {
            videoLinkInput.value = data.videoURL;
            loadVideoBtn.click(); // Dispara o carregamento
        }

        // Sincroniza play/pause (apenas para vídeos MP4)
        if (videoPlayer.style.display === "block") {
            if (data.isPlaying && videoPlayer.paused) {
                videoPlayer.play();
            } else if (!data.isPlaying && !videoPlayer.paused) {
                videoPlayer.pause();
            }
        }
    });
}

// ===== [4] CONTROLES (APENAS PARA VÍDEOS MP4) =====
videoPlayer.addEventListener('play', () => {
    if (currentRoomId) {
        db.collection("rooms").doc(currentRoomId).update({
            isPlaying: true,
            currentTime: videoPlayer.currentTime
        });
    }
});

videoPlayer.addEventListener('pause', () => {
    if (currentRoomId) {
        db.collection("rooms").doc(currentRoomId).update({
            isPlaying: false,
            currentTime: videoPlayer.currentTime
        });
    }
});

// Atualiza o tempo periodicamente
setInterval(() => {
    if (currentRoomId && !videoPlayer.paused && videoPlayer.style.display === "block") {
        db.collection("rooms").doc(currentRoomId).update({
            currentTime: videoPlayer.currentTime
        });
    }
}, 5000);
