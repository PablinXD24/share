// Configuração do PeerJS (cada usuário tem um ID único)
const peer = new Peer();

peer.on('open', (id) => {
    console.log("Seu ID PeerJS:", id);
});

// Captura e compartilha a tela
document.getElementById('shareScreen').addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        document.getElementById('localScreen').srcObject = stream;

        // Quando alguém quiser assistir, chamamos esta função
        peer.on('call', (call) => {
            call.answer(stream); // Envia a tela para quem pediu
        });
    } catch (err) {
        console.error("Erro ao compartilhar tela:", err);
    }
});

// Função para assistir a tela de alguém
function watchScreen(peerId) {
    const call = peer.call(peerId, stream); // "stream" deve vir do compartilhador
    call.on('stream', (remoteStream) => {
        document.getElementById('remoteScreen').srcObject = remoteStream;
    });
}
