// Configuração do Firebase (substitua com suas credenciais)
const firebaseConfig = {
    apiKey: "AIzaSyCP-fUHlTE5CokRx26r6MKUuxqxHuAJXiI",
    authDomain: "salacinemavirtual.firebaseapp.com",
    projectId: "salacinemavirtual",
    storageBucket: "salacinemavirtual.firebasestorage.app",
    messagingSenderId: "452146827346",
    appId: "1:452146827346:web:df92c4008cf9e0f3218f8b"
  };

// Inicialização do Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Variáveis globais
let currentRoomId = null;
let isSyncing = false;
let lastSyncTime = 0;
let ytPlayer = null;
let currentVideoType = null;
let currentUsers = [];
let roomUnsubscribe = null;
let usersUnsubscribe = null;
let currentUserId = null;

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
    syncStatus: document.getElementById('syncStatus'),
    userList: document.getElementById('userList')
};

// Inicialização do Player do YouTube
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

function onPlayerReady() {
    updateStatus("YouTube Player pronto");
}

function onPlayerStateChange(event) {
    if (!currentRoomId || isSyncing) return;
    
    isSyncing = true;
    elements.syncStatus.textContent = "Sincronizando...";
    
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
        elements.syncStatus.textContent = "Sincronizado";
    }, 1000);
}

// Controles de Sala
elements.createRoom.addEventListener('click', createRoom);
elements.joinRoom.addEventListener('click', joinRoom);
elements.loadVideo.addEventListener('click', loadVideoHandler);

// Funções principais
function createRoom() {
    currentRoomId = generateRoomId();
    currentUserId = generateUserId();
    elements.roomId.value = currentRoomId;
    
    db.collection("rooms").doc(currentRoomId).set({
        videoURL: "",
        videoType: "",
        isPlaying: false,
        currentTime: 0,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        addUserToRoom();
        updateStatus(`Sala criada: ${currentRoomId}`);
        syncRoom(currentRoomId);
    });
}

function joinRoom() {
    currentRoomId = elements.roomId.value.trim();
    currentUserId = generateUserId();
    
    if (!currentRoomId) return alert("Digite um ID de sala!");
    
    db.collection("rooms").doc(currentRoomId).get().then((doc) => {
        if (!doc.exists) return alert("Sala não encontrada!");
        
        addUserToRoom();
        updateStatus(`Conectado à sala: ${currentRoomId}`);
        syncRoom(currentRoomId);
    });
}

function addUserToRoom() {
    const userName = `Usuário ${Math.floor(Math.random() * 1000)}`;
    
    db.collection("rooms").doc(currentRoomId).collection("users").doc(currentUserId).set({
        id: currentUserId,
        name: userName,
        joinedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

function loadVideoHandler() {
    const videoURL = elements.videoLink.value.trim();
    if (!videoURL) return alert("Digite um link válido!");

    if (!isValidVideoUrl(videoURL)) {
        return alert("Link de vídeo inválido! Use YouTube ou links MP4 diretos.");
    }

    if (isYouTubeVideo(videoURL)) {
        currentVideoType = 'youtube';
        loadYouTubeVideo(videoURL);
    } else {
        currentVideoType = 'mp4';
        loadMP4Video(videoURL);
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
    // Cancela listeners anteriores
    if (roomUnsubscribe) roomUnsubscribe();
    if (usersUnsubscribe) usersUnsubscribe();

    // Listener para dados da sala
    roomUnsubscribe = db.collection("rooms").doc(roomId).onSnapshot((doc) => {
        const data = doc.data();
        if (!data) return;

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

        // Sincroniza play/pause
        const now = Date.now();
        if (now - lastSyncTime > 1000) {
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

    // Listener para usuários
    usersUnsubscribe = db.collection("rooms").doc(roomId).collection("users")
        .onSnapshot((snapshot) => {
            const updatedUsers = [];
            snapshot.forEach((doc) => {
                updatedUsers.push(doc.data());
            });
            
            // Verifica novos usuários
            updatedUsers.forEach(user => {
                if (!currentUsers.some(u => u.id === user.id)) {
                    showNotification(`${user.name} entrou na sala`);
                }
            });
            
            currentUsers = updatedUsers;
            updateUserList(updatedUsers);
        });
}

// Funções auxiliares
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8);
}

function generateUserId() {
    return 'user_' + Math.random().toString(36).substring(2, 9);
}

function updateStatus(message) {
    elements.status.textContent = message;
    console.log(message);
}

function isYouTubeVideo(url) {
    return url.includes("youtube.com") || url.includes("youtu.be");
}

function isValidVideoUrl(url) {
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
        return extractYouTubeId(url) !== null;
    }
    return /\.(mp4|webm|ogg)$/i.test(url);
}

function extractYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
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

function playVideo() {
    elements.videoPlayer.play().catch(e => {
        console.error("Erro ao dar play:", e);
        updateStatus("Erro ao reproduzir vídeo");
    });
}

function pauseVideo() {
    elements.videoPlayer.pause();
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function updateUserList(users) {
    elements.userList.innerHTML = users.map(user => 
        `<div class="user">${user.name}</div>`
    ).join('');
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
    if (!currentRoomId || isSyncing || currentVideoType !== 'mp4' || elements.videoPlayer.paused) return;
    
    db.collection("rooms").doc(currentRoomId).update({
        currentTime: elements.videoPlayer.currentTime,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
}, 3000);

// Remove usuário ao sair da página
window.addEventListener('beforeunload', () => {
    if (currentRoomId && currentUserId) {
        db.collection("rooms").doc(currentRoomId).collection("users").doc(currentUserId).delete();
    }
});
