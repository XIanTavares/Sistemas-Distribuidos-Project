const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

// Criar servidor HTTP
const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
        fs.readFile(path.join(__dirname, 'web', 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Erro ao carregar pagina');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data);
        });
    } else {
        res.writeHead(404);
        res.end('Nao encontrado');
    }
});

// Criar servidor WebSocket
const wss = new WebSocket.Server({ server });

// Estrutura de salas: { codigoSala: { jogadores: [], tabuleiros: [], turnos: [], estado: 'aguardando' } }
const salas = new Map();

// Gerar código de sala aleatório
function gerarCodigoSala() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Encontrar sala por código
function encontrarSala(codigo) {
    return salas.get(codigo);
}

// Criar nova sala
function criarSala() {
    let codigo;
    do {
        codigo = gerarCodigoSala();
    } while (salas.has(codigo));
    
    salas.set(codigo, {
        codigo: codigo,
        jogadores: [],
        tabuleiros: [],
        nomes: [],
        turnoAtual: 0,
        estado: 'aguardando', // aguardando, configurando, jogando, finalizado
        vencedor: null
    });
    
    return codigo;
}

// Broadcast para todos jogadores da sala
function broadcastSala(sala, mensagem, exceto = null) {
    sala.jogadores.forEach(jogador => {
        if (jogador !== exceto && jogador.readyState === WebSocket.OPEN) {
            jogador.send(JSON.stringify(mensagem));
        }
    });
}

// Enviar para jogador específico
function enviarParaJogador(jogador, mensagem) {
    if (jogador.readyState === WebSocket.OPEN) {
        jogador.send(JSON.stringify(mensagem));
    }
}

wss.on('connection', (ws) => {
    console.log('Nova conexao WebSocket');
    
    ws.on('message', (data) => {
        try {
            const mensagem = JSON.parse(data);
            console.log('Mensagem recebida:', mensagem);
            
            switch (mensagem.tipo) {
                case 'criar_sala':
                    const codigoNovo = criarSala();
                    enviarParaJogador(ws, {
                        tipo: 'sala_criada',
                        codigo: codigoNovo
                    });
                    console.log(`Sala criada: ${codigoNovo}`);
                    break;
                
                case 'entrar_sala':
                    const sala = encontrarSala(mensagem.codigo);
                    
                    if (!sala) {
                        enviarParaJogador(ws, {
                            tipo: 'erro',
                            mensagem: 'Sala nao encontrada'
                        });
                        break;
                    }
                    
                    if (sala.jogadores.length >= 2) {
                        enviarParaJogador(ws, {
                            tipo: 'erro',
                            mensagem: 'Sala cheia (maximo 2 jogadores)'
                        });
                        break;
                    }
                    
                    // Adicionar jogador à sala
                    ws.salaAtual = mensagem.codigo;
                    ws.indiceJogador = sala.jogadores.length;
                    ws.nome = mensagem.nome || `Jogador ${ws.indiceJogador + 1}`;
                    
                    sala.jogadores.push(ws);
                    sala.nomes.push(ws.nome);
                    
                    enviarParaJogador(ws, {
                        tipo: 'entrou_sala',
                        codigo: mensagem.codigo,
                        indiceJogador: ws.indiceJogador,
                        nome: ws.nome
                    });
                    
                    // Notificar outros jogadores
                    broadcastSala(sala, {
                        tipo: 'jogador_entrou',
                        nome: ws.nome,
                        totalJogadores: sala.jogadores.length
                    }, ws);
                    
                    console.log(`${ws.nome} entrou na sala ${mensagem.codigo}`);
                    
                    // Se 2 jogadores, iniciar configuração
                    if (sala.jogadores.length === 2) {
                        sala.estado = 'configurando';
                        broadcastSala(sala, {
                            tipo: 'iniciar_configuracao',
                            oponente: sala.nomes[0] === ws.nome ? sala.nomes[1] : sala.nomes[0]
                        });
                    }
                    break;
                
                case 'configurar_tabuleiro':
                    const salaConfig = encontrarSala(ws.salaAtual);
                    if (!salaConfig) break;
                    
                    // Salvar tabuleiro do jogador
                    salaConfig.tabuleiros[ws.indiceJogador] = mensagem.tabuleiro;
                    
                    console.log(`${ws.nome} configurou tabuleiro`);
                    
                    // Verificar se ambos configuraram
                    if (salaConfig.tabuleiros.length === 2 && 
                        salaConfig.tabuleiros[0] && salaConfig.tabuleiros[1]) {
                        salaConfig.estado = 'jogando';
                        salaConfig.turnoAtual = 0;
                        
                        broadcastSala(salaConfig, {
                            tipo: 'jogo_iniciado',
                            turnoInicial: salaConfig.nomes[0]
                        });
                        
                        enviarParaJogador(salaConfig.jogadores[0], {
                            tipo: 'seu_turno'
                        });
                    }
                    break;
                
                case 'atacar':
                    const salaAtaque = encontrarSala(ws.salaAtual);
                    if (!salaAtaque || salaAtaque.estado !== 'jogando') break;
                    
                    // Verificar se é o turno do jogador
                    if (salaAtaque.turnoAtual !== ws.indiceJogador) {
                        enviarParaJogador(ws, {
                            tipo: 'erro',
                            mensagem: 'Nao e seu turno'
                        });
                        break;
                    }
                    
                    const oponenteIdx = 1 - ws.indiceJogador;
                    const tabuleiroOponente = salaAtaque.tabuleiros[oponenteIdx];
                    const linha = mensagem.linha;
                    const coluna = mensagem.coluna;
                    
                    // Verificar resultado do ataque
                    const celula = tabuleiroOponente[linha][coluna];
                    let resultado;
                    
                    if (celula === 'N') {
                        resultado = 'acerto';
                        tabuleiroOponente[linha][coluna] = 'X';
                    } else {
                        resultado = 'agua';
                        tabuleiroOponente[linha][coluna] = 'O';
                    }
                    
                    console.log(`${ws.nome} atacou ${linha},${coluna}: ${resultado}`);
                    
                    // Enviar resultado para atacante
                    enviarParaJogador(ws, {
                        tipo: 'resultado_ataque',
                        linha: linha,
                        coluna: coluna,
                        resultado: resultado
                    });
                    
                    // Enviar para oponente que foi atacado
                    enviarParaJogador(salaAtaque.jogadores[oponenteIdx], {
                        tipo: 'recebeu_ataque',
                        linha: linha,
                        coluna: coluna,
                        resultado: resultado
                    });
                    
                    // Verificar vitória
                    const naviosRestantes = tabuleiroOponente.flat().filter(c => c === 'N').length;
                    
                    if (naviosRestantes === 0) {
                        salaAtaque.estado = 'finalizado';
                        salaAtaque.vencedor = ws.nome;
                        
                        broadcastSala(salaAtaque, {
                            tipo: 'fim_jogo',
                            vencedor: ws.nome
                        });
                        
                        console.log(`${ws.nome} venceu!`);
                    } else if (resultado === 'agua') {
                        // Trocar turno
                        salaAtaque.turnoAtual = oponenteIdx;
                        
                        enviarParaJogador(salaAtaque.jogadores[oponenteIdx], {
                            tipo: 'seu_turno'
                        });
                    } else {
                        // Acertou, continua jogando
                        enviarParaJogador(ws, {
                            tipo: 'seu_turno'
                        });
                    }
                    break;
            }
        } catch (error) {
            console.error('Erro ao processar mensagem:', error);
            enviarParaJogador(ws, {
                tipo: 'erro',
                mensagem: 'Erro no servidor'
            });
        }
    });
    
    ws.on('close', () => {
        console.log('Conexao fechada');
        
        // Remover jogador da sala
        if (ws.salaAtual) {
            const sala = encontrarSala(ws.salaAtual);
            if (sala) {
                const index = sala.jogadores.indexOf(ws);
                if (index > -1) {
                    sala.jogadores.splice(index, 1);
                    sala.nomes.splice(index, 1);
                    
                    // Notificar outros jogadores
                    broadcastSala(sala, {
                        tipo: 'jogador_saiu',
                        nome: ws.nome
                    });
                    
                    // Se sala vazia, remover
                    if (sala.jogadores.length === 0) {
                        salas.delete(ws.salaAtual);
                        console.log(`Sala ${ws.salaAtual} removida`);
                    }
                }
            }
        }
    });
});

server.listen(PORT, () => {
    console.log('');
    console.log('================================================');
    console.log('   BATALHA NAVAL - SERVIDOR WEB');
    console.log('================================================');
    console.log('');
    console.log(`Servidor rodando em: http://localhost:${PORT}`);
    console.log('');
    console.log('Abra o navegador e acesse o endereco acima');
    console.log('');
    console.log('Pressione Ctrl+C para parar o servidor');
    console.log('');
    console.log('================================================');
    console.log('');
});
