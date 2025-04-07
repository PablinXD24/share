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
let lastVideoUrl = '';

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
    userList: document.getElementById('userList'),
    userCount: document.getElementById('userCount')
};

// Inicialização do Player do YouTube
function onYouTubeIframeAPIReady() {
    ytPlayer = new YT.Player('ytPlayer', {
        height: '100%',
        width: '100%',
        playerVars: {
            'autoplay': 0,
            'controls': 1,
            'rel': 0,
            'showinfo': 0,
            'modestbranding': 1
        },
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
    setSyncStatus("Sincronizando...");
    
    const currentTime = ytPlayer.getCurrentTime();
    
    if (event.data == YT.PlayerState.PLAYING) {
        db.collection("rooms").doc(currentRoomId).update({
            isPlaying: true,
            currentTime: currentTime,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
    } else if (event.data == YT.PlayerState.PAUSED) {
        db.collection("rooms").doc(currentRoomId).update({
            isPlaying: false,
            currentTime: currentTime,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
    
    setTimeout(() => {
        isSyncing = false;
        setSyncStatus("Sincronizado");
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
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        addUserToRoom();
        updateStatus(`Sala criada: ${currentRoomId}`);
        showNotification(`Sala ${currentRoomId} criada com sucesso!`);
        syncRoom(currentRoomId);
    }).catch(error => {
        console.error("Erro ao criar sala:", error);
        updateStatus("Erro ao criar sala");
    });
}

function joinRoom() {
    currentRoomId = elements.roomId.value.trim();
    currentUserId = generateUserId();
    
    if (!currentRoomId) {
        showNotification("Digite um ID de sala!", true);
        return;
    }
    
    db.collection("rooms").doc(currentRoomId).get().then((doc) => {
        if (!doc.exists) {
            showNotification("Sala não encontrada!", true);
            return;
        }
        
        addUserToRoom();
        updateStatus(`Conectado à sala: ${currentRoomId}`);
        showNotification(`Você entrou na sala ${currentRoomId}`);
        syncRoom(currentRoomId);
    }).catch(error => {
        console.error("Erro ao entrar na sala:", error);
        updateStatus("Erro ao entrar na sala");
    });
}

function addUserToRoom() {
    const userName = `Usuário${Math.floor(Math.random() * 1000)}`;
    
    db.collection("rooms").doc(currentRoomId).collection("users").doc(currentUserId).set({
        id: currentUserId,
        name: userName,
        joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastActive: firebase.firestore.FieldValue.serverTimestamp()
    });
}

function loadVideoHandler() {
    const videoURL = elements.videoLink.value.trim();
    if (!videoURL) {
        showNotification("Digite um link válido!", true);
        return;
    }

    if (!isValidVideoUrl(videoURL)) {
        showNotification("Link de vídeo inválido! Use YouTube ou links MP4 diretos.", true);
        return;
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
        }).then(() => {
            showNotification("Vídeo carregado com sucesso!");
        }).catch(error => {
            console.error("Erro ao atualizar vídeo:", error);
            showNotification("Erro ao carregar vídeo", true);
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
        if (data.videoURL && data.videoURL !== lastVideoUrl) {
            lastVideoUrl = data.videoURL;
            elements.videoLink.value = data.videoURL;
            
            if (data.videoType === 'youtube') {
                loadYouTubeVideo(data.videoURL);
            } else if (data.videoType === 'mp4') {
                loadMP4Video(data.videoURL);
            }
        }

        // Sincroniza o tempo do vídeo
        if (data.currentTime !== undefined) {
            if (currentVideoType === 'mp4' && Math.abs(elements.videoPlayer.currentTime - data.currentTime) > 1) {
                isSyncing = true;
                elements.videoPlayer.currentTime = data.currentTime;
                setTimeout(() => { isSyncing = false; }, 500);
            } else if (currentVideoType === 'youtube' && ytPlayer.getCurrentTime) {
                const ytTime = ytPlayer.getCurrentTime();
                if (Math.abs(ytTime - data.currentTime) > 1) {
                    isSyncing = true;
                    ytPlayer.seekTo(data.currentTime, true);
                    setTimeout(() => { isSyncing = false; }, 500);
                }
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
    }, (error) => {
        console.error("Erro no listener da sala:", error);
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
        }, (error) => {
            console.error("Erro no listener de usuários:", error);
        });
}

// Funções auxiliares
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function generateUserId() {
    return 'user_' + Math.random().toString(36).substring(2, 9);
}

function updateStatus(message) {
    elements.status.textContent = message;
    console.log(message);
}

function setSyncStatus(status) {
    elements.syncStatus.textContent = status;
    elements.syncStatus.querySelector('span').textContent = status;
    
    if (status === "Sincronizando...") {
        elements.syncStatus.classList.add('syncing');
    } else {
        elements.syncStatus.classList.remove('syncing');
    }
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
    if (!videoId) {
        showNotification("Link do YouTube inválido!", true);
        return;
    }

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

function showNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    
    if (isError) {
        notification.style.backgroundColor = '#ff6b81';
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideIn 0.3s reverse forwards';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

function updateUserList(users) {
    if (users.length === 0) {
        elements.userList.innerHTML = '<div class="empty-state">Nenhum usuário na sala</div>';
        elements.userCount.textContent = '0';
        return;
    }
    
    elements.userList.innerHTML = users.map(user => 
        `<div class="user">${user.name}</div>`
    ).join('');
    
    elements.userCount.textContent = users.length;
}

// Event listeners para vídeo MP4
elements.videoPlayer.addEventListener('play', () => {
    if (!currentRoomId || isSyncing || currentVideoType !== 'mp4') return;
    
    isSyncing = true;
    setSyncStatus("Sincronizando...");
    
    db.collection("rooms").doc(currentRoomId).update({
        isPlaying: true,
        currentTime: elements.videoPlayer.currentTime,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        isSyncing = false;
        setSyncStatus("Sincronizado");
    }).catch(error => {
        console.error("Erro ao sincronizar play:", error);
        isSyncing = false;
    });
});

elements.videoPlayer.addEventListener('pause', () => {
    if (!currentRoomId || isSyncing || currentVideoType !== 'mp4') return;
    
    isSyncing = true;
    setSyncStatus("Sincronizando...");
    
    db.collection("rooms").doc(currentRoomId).update({
        isPlaying: false,
        currentTime: elements.videoPlayer.currentTime,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        isSyncing = false;
        setSyncStatus("Sincronizado");
    }).catch(error => {
        console.error("Erro ao sincronizar pause:", error);
        isSyncing = false;
    });
});

// Atualização periódica do tempo
setInterval(() => {
    if (!currentRoomId || isSyncing) return;
    
    let currentTime;
    if (currentVideoType === 'mp4' && !elements.videoPlayer.paused) {
        currentTime = elements.videoPlayer.currentTime;
    } else if (currentVideoType === 'youtube' && ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) {
        currentTime = ytPlayer.getCurrentTime();
    } else {
        return;
    }
    
    db.collection("rooms").doc(currentRoomId).update({
        currentTime: currentTime,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
}, 3000);

// Remove usuário ao sair da página
window.addEventListener('beforeunload', () => {
    if (currentRoomId && currentUserId) {
        db.collection("rooms").doc(currentRoomId).collection("users").doc(currentUserId).delete();
    }
});

// Atualiza última atividade do usuário periodicamente
setInterval(() => {
    if (currentRoomId && currentUserId) {
        db.collection("rooms").doc(currentRoomId).collection("users").doc(currentUserId).update({
            lastActive: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
}, 60000);

// Limpa usuários inativos após 2 minutos
function cleanInactiveUsers() {
    if (!currentRoomId) return;
    
    const cutoff = new Date(Date.now() - 120000);
    
    db.collection("rooms").doc(currentRoomId).collection("users")
        .where("lastActive", "<", cutoff)
        .get()
        .then((snapshot) => {
            snapshot.forEach((doc) => {
                doc.ref.delete();
            });
        });
}

setInterval(cleanInactiveUsers, 30000);
