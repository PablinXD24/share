const shareButton = document.getElementById('shareScreen');
const screenView = document.getElementById('screenView');

shareButton.addEventListener('click', async () => {
    try {
        // Solicita permissão para capturar a tela
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false // Pode ser true se quiser compartilhar áudio também
        });
        
        // Exibe a tela compartilhada no elemento <video>
        screenView.srcObject = stream;
        
        // Quando o usuário para o compartilhamento
        stream.getVideoTracks()[0].onended = () => {
            alert("Compartilhamento encerrado!");
        };
    } catch (err) {
        console.error("Erro ao compartilhar tela:", err);
        alert("Erro ao compartilhar tela!");
    }
});
