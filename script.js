const API_URL = "http://127.0.0.1:8000";

let currentTab = 'tab-financas';

// 1. Navegação de Abas e Atualização do Botão do Cabeçalho
function switchTab(tabId, element) {
    currentTab = tabId;
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));

    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');
    if (element) element.classList.add('active');

    // Atualiza o texto e a ação do botão do topo
    const btnHeader = document.getElementById('btnActionHeader');
    if (btnHeader) {
        if (tabId === 'tab-investimentos') {
            btnHeader.innerHTML = '<i class="fa-solid fa-chart-line"></i> Fazer Aporte';
        } else if (tabId === 'tab-metas') {
            btnHeader.innerHTML = '<i class="fa-solid fa-bullseye"></i> Nova Meta';
        } else {
            btnHeader.innerHTML = '<i class="fa-solid fa-plus"></i> Novo Lançamento';
        }
    }

    // Recarrega os dados correspondentes à aba
    if (tabId === 'tab-investimentos') carregarInvestimentos();
    if (tabId === 'tab-metas') carregarMetas();
    if (tabId === 'tab-lancamento') carregarTransacoes();
    if (tabId === 'tab-lancamento') carregarTransacoes();
}

// Ação disparada pelo botão do cabeçalho
function executarAcaoHeader() {
    if (currentTab === 'tab-investimentos') {
        document.getElementById('modalAporte').classList.add('active');
    } else if (currentTab === 'tab-metas') {
        document.getElementById('modalMeta').classList.add('active');
    } else {
        // Se estiver em Finanças ou Lançamento, vai para a tela de lançamento
        const navLancamento = document.querySelectorAll('.nav-item')[1];
        switchTab('tab-lancamento', navLancamento);
    }
}

function fecharModais() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
}

// 2. Transações
function setType(type, btn) {
    document.querySelectorAll('.type-btn').forEach(b => b.className = 'type-btn');
    btn.classList.add('active', type);
}

function addValor(valor) {
    const input = document.getElementById('inputValor');
    if (!input) return;
    const valorAtual = parseFloat(input.value) || 0;
    input.value = (valorAtual + valor).toFixed(2);
}

function toggleCartoes(meio) {
    const groupCartoes = document.getElementById('groupCartoes');
    if (groupCartoes) {
        groupCartoes.style.display = (meio === 'CREDITO') ? 'block' : 'none';
    }
}

async function carregarTransacoes() {
    try {
        const response = await fetch(`${API_URL}/transacoes`);
        if (!response.ok) return;

        const transacoes = await response.json();
        const tbody = document.getElementById('tbodyLancamentos');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (transacoes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-muted);">Nenhum lançamento registrado ainda.</td></tr>';
            return;
        }

        transacoes.forEach(t => {
            const tr = document.createElement('tr');
            const corValor = t.tipo === 'SAIDA' ? 'var(--danger)' : 'var(--forest-light)';
            const sinal = t.tipo === 'SAIDA' ? '-' : '+';

            // Escapar descrição para evitar quebras de sintaxe
            const descEscapada = t.descricao.replace(/'/g, "\\'");

            tr.innerHTML = `
                <td>${t.descricao}</td>
                <td>${t.meio_pagamento}</td>
                <td>Geral</td>
                <td style="color: ${corValor}; font-weight: 600;">${sinal} R$ ${parseFloat(t.valor).toFixed(2)}</td>
                <td>
                    <i class="fa-solid fa-trash-can" style="color: var(--danger); cursor: pointer;" 
                       title="Apagar Lançamento" 
                       onclick="apagarTransacao(${t.id}, '${descEscapada}')"></i>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error("Erro ao carregar transações:", error);
    }
}
// Função para excluir uma transação
async function apagarTransacao(id, descricao) {
    if (!confirm(`Deseja realmente apagar o lançamento "${descricao}"?`)) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/transacoes/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            // Recarrega a tabela e atualiza os cards do dashboard em tempo real
            carregarTransacoes();
            carregarResumoDashboard();
        } else {
            alert("Erro ao apagar o lançamento.");
        }
    } catch (error) {
        console.error("Erro na requisição:", error);
        alert("Erro ao conectar com o servidor.");
    }
}

async function salvarLancamento(event) {
    if (event) event.preventDefault();

    const inputValor = document.getElementById('inputValor');
    const inputDescricao = document.getElementById('inputDescricao');
    const selectMeio = document.getElementById('selectMeio');
    const btnSaida = document.querySelector('.type-btn.saida');

    if (!inputValor || !inputDescricao) return;

    const valor = parseFloat(inputValor.value);
    const descricao = inputDescricao.value;
    const meioPagamento = selectMeio ? selectMeio.value : 'PIX';
    const tipo = btnSaida && btnSaida.classList.contains('active') ? 'SAIDA' : 'ENTRADA';

    if (!valor || !descricao) {
        alert("Preencha o valor e a descrição!");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/transacoes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                descricao: descricao,
                valor: valor,
                tipo: tipo,
                meio_pagamento: meioPagamento,
                data_transacao: new Date().toISOString().split('T')[0]
            })
        });

        if (response.ok) {
            alert("Lançamento salvo com sucesso!");
            inputValor.value = '';
            inputDescricao.value = '';
            carregarTransacoes();
            carregarResumoDashboard();
        }
    } catch (error) {
        alert("Erro ao conectar ao servidor.");
    }
}
// --- VARIÁVEIS GLOBAIS E CÓDIGO DO GRÁFICO (SUBSTITUIR AQUI) ---

let chartEvolucaoInstance = null;
let dadosGraficoCache = null;
let filtroGraficoAtual = 'ambos';

// 1. Função para filtrar o gráfico entre Ambos, Saídas e Entradas
function filtrarGrafico(modo, btnElement) {
    filtroGraficoAtual = modo;

    // Atualiza o estado visual dos botões de filtro
    const container = btnElement.parentElement;
    container.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    btnElement.classList.add('active');

    if (chartEvolucaoInstance && dadosGraficoCache) {
        renderizarDatasetGrafico();
    }
}

// 2. Auxiliar para aplicar as séries de dados no Chart.js
function renderizarDatasetGrafico() {
    if (!chartEvolucaoInstance || !dadosGraficoCache) return;

    const datasetSaidas = {
        label: 'Saídas (R$)',
        data: dadosGraficoCache.saidas,
        backgroundColor: '#e63946', // Vermelho para saídas
        borderRadius: 6
    };

    const datasetEntradas = {
        label: 'Entradas (R$)',
        data: dadosGraficoCache.entradas,
        backgroundColor: '#2d6a4f', // Verde para receitas
        borderRadius: 6
    };

    if (filtroGraficoAtual === 'saidas') {
        chartEvolucaoInstance.data.datasets = [datasetSaidas];
    } else if (filtroGraficoAtual === 'entradas') {
        chartEvolucaoInstance.data.datasets = [datasetEntradas];
    } else {
        // Exibe entradas e saídas lado a lado
        chartEvolucaoInstance.data.datasets = [datasetEntradas, datasetSaidas];
    }

    chartEvolucaoInstance.update();
}

// 3. Buscar e Inicializar o Gráfico com dados do MySQL
async function carregarGraficoEvolucao() {
    try {
        const response = await fetch(`${API_URL}/grafico-gastos-mensais`);
        if (!response.ok) return;

        dadosGraficoCache = await response.json();
        const canvasEvolucao = document.getElementById('chartEvolucao');
        if (!canvasEvolucao) return;

        if (!chartEvolucaoInstance) {
            chartEvolucaoInstance = new Chart(canvasEvolucao.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: dadosGraficoCache.labels,
                    datasets: []
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { 
                            display: true, 
                            labels: { color: '#95a5a6', font: { family: 'Inter' } } 
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return `${context.dataset.label}: R$ ${parseFloat(context.raw).toFixed(2)}`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: { 
                            grid: { color: '#2c3e3a' }, 
                            ticks: { 
                                color: '#95a5a6',
                                callback: function(value) { return 'R$ ' + value; }
                            } 
                        },
                        x: { grid: { display: false }, ticks: { color: '#95a5a6' } }
                    }
                }
            });
        } else {
            chartEvolucaoInstance.data.labels = dadosGraficoCache.labels;
        }

        renderizarDatasetGrafico();
    } catch (error) {
        console.error("Erro ao carregar gráfico de evolução:", error);
    }
}

// 3. Investimentos & Aportes
// 1. Renderizar tabela de investimentos com botões de Ação
async function carregarInvestimentos() {
    try {
        const response = await fetch(`${API_URL}/investimentos`);
        if (!response.ok) return;

        const ativos = await response.json();
        const tbody = document.getElementById('tbodyInvestimentos');
        const cardTotal = document.getElementById('totalInvestido');
        
        if (!tbody) return;
        tbody.innerHTML = '';

        let totalGeral = 0;

        if (ativos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-muted);">Nenhum ativo cadastrado.</td></tr>';
            if (cardTotal) cardTotal.innerText = 'R$ 0,00';
            return;
        }

        ativos.forEach(a => {
            const qtd = parseFloat(a.quantidade);
            const pm = parseFloat(a.preco_medio);
            const total = qtd * pm;
            totalGeral += total;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${a.ticker}</strong></td>
                <td>${a.setor}</td>
                <td>${qtd}</td>
                <td>R$ ${pm.toFixed(2)}</td>
                <td style="color: var(--forest-light); font-weight: 600;">R$ ${total.toFixed(2)}</td>
                <td style="text-align: center;">
                    <i class="fa-solid fa-pen" style="color: var(--forest-light); cursor: pointer; margin-right: 12px;" 
                       title="Editar" onclick="abrirModalEditarAtivo(${a.id}, '${a.ticker}', '${a.setor}', ${qtd}, ${pm})"></i>
                    <i class="fa-solid fa-trash-can" style="color: var(--danger); cursor: pointer;" 
                       title="Excluir" onclick="apagarInvestimento(${a.id}, '${a.ticker}')"></i>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (cardTotal) cardTotal.innerText = `R$ ${totalGeral.toFixed(2)}`;
    } catch (error) {
        console.error("Erro ao carregar investimentos:", error);
    }
}

// 2. Apagar Investimento
async function apagarInvestimento(ativoId, ticker) {
    if (!confirm(`Tem certeza que deseja apagar o ativo ${ticker} da sua carteira?`)) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/investimentos/${ativoId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            alert(`Ativo ${ticker} removido com sucesso!`);
            carregarInvestimentos();
        } else {
            alert("Erro ao remover o ativo.");
        }
    } catch (error) {
        console.error("Erro na requisição:", error);
        alert("Erro ao conectar com o servidor.");
    }
}

// 3. Abrir Modal de Edição com os dados atuais
function abrirModalEditarAtivo(id, ticker, setor, qtd, pm) {
    document.getElementById('editAtivoId').value = id;
    document.getElementById('editTicker').value = ticker;
    document.getElementById('editSetor').value = setor;
    document.getElementById('editQtd').value = qtd;
    document.getElementById('editPrecoMedio').value = pm;

    document.getElementById('modalEditarAtivo').classList.add('active');
}

// 4. Salvar Edição do Ativo no Backend
async function salvarEdicaoAtivo() {
    const id = document.getElementById('editAtivoId').value;
    const setor = document.getElementById('editSetor').value.trim();
    const qtd = parseFloat(document.getElementById('editQtd').value);
    const pm = parseFloat(document.getElementById('editPrecoMedio').value);

    if (!setor || isNaN(qtd) || isNaN(pm) || qtd < 0 || pm < 0) {
        alert("Preencha todos os campos corretamente!");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/investimentos/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                setor: setor,
                quantidade: qtd,
                preco_medio: pm
            })
        });

        if (response.ok) {
            alert("Ativo atualizado com sucesso!");
            fecharModais();
            carregarInvestimentos();
        } else {
            alert("Erro ao atualizar ativo.");
        }
    } catch (error) {
        console.error("Erro na requisição:", error);
        alert("Erro ao conectar com o servidor.");
    }
}

async function salvarAporte() {
    const ticker = document.getElementById('inputTicker').value;
    const setor = document.getElementById('inputSetor').value;
    const qtd = parseFloat(document.getElementById('inputQtd').value);
    const preco = parseFloat(document.getElementById('inputPreco').value);

    if (!ticker || !setor || !qtd || !preco) {
        alert("Preencha todos os campos do aporte!");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/investimentos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker: ticker, setor: setor, quantidade: qtd, preco: preco })
        });

        if (response.ok) {
            alert("Aporte realizado com sucesso!");
            fecharModais();
            document.getElementById('inputTicker').value = '';
            document.getElementById('inputSetor').value = '';
            document.getElementById('inputQtd').value = '';
            document.getElementById('inputPreco').value = '';
            carregarInvestimentos();
        }
    } catch (error) {
        alert("Erro ao salvar aporte.");
    }
}

// 4. Metas
// 1. Carregar Metas com Botões de Editar e Apagar no Card
async function carregarMetas() {
    try {
        const response = await fetch(`${API_URL}/metas`);
        if (!response.ok) return;

        const metas = await response.json();
        const grid = document.getElementById('gridMetas');
        if (!grid) return;

        grid.innerHTML = '';

        if (metas.length === 0) {
            grid.innerHTML = '<p style="color: var(--text-muted);">Nenhuma meta cadastrada ainda.</p>';
            return;
        }

        metas.forEach(m => {
            const objetivo = parseFloat(m.valor_objetivo);
            const atual = parseFloat(m.valor_atual);
            const falta = Math.max(0, objetivo - atual);
            const percentual = Math.min(100, ((atual / objetivo) * 100)).toFixed(1);

            const textoPrazo = m.data_limite ? `Até ${m.data_limite}` : 'Sem prazo limite';

            const card = document.createElement('div');
            card.className = 'card';
            card.style.position = 'relative';

            // Escapar o título para evitar quebras em nomes com aspas/caracteres especiais
            const tituloEscapado = m.titulo.replace(/'/g, "\\'");

            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div class="card-title" style="margin: 0;">${m.titulo} <i class="fa-solid fa-bullseye"></i></div>
                    <div>
                        <i class="fa-solid fa-pen" style="color: var(--forest-light); cursor: pointer; margin-right: 10px;" 
                           title="Editar Meta" onclick="abrirModalEditarMeta(${m.id}, '${tituloEscapado}', ${objetivo}, ${atual}, '${m.data_limite || ''}')"></i>
                        <i class="fa-solid fa-trash-can" style="color: var(--danger); cursor: pointer;" 
                           title="Apagar Meta" onclick="apagarMeta(${m.id}, '${tituloEscapado}')"></i>
                    </div>
                </div>

                <div class="card-value" style="margin: 10px 0; font-size: 1.2rem;">
                    R$ ${atual.toFixed(2)} / R$ ${objetivo.toFixed(2)}
                </div>
                
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill" style="width: ${percentual}%;"></div>
                </div>
                
                <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-muted); margin-top: 8px;">
                    <span>${percentual}% concluído (Falta R$ ${falta.toFixed(2)})</span>
                    <span>${textoPrazo}</span>
                </div>

                <button class="btn-quick-amount" style="margin-top: 12px; width: 100%;" 
                        onclick="abrirModalProgressoMeta(${m.id}, '${tituloEscapado}')">
                    <i class="fa-solid fa-plus"></i> Adicionar Progresso
                </button>
            `;
            grid.appendChild(card);
        });
    } catch (error) {
        console.error("Erro ao carregar metas:", error);
    }
}

// 2. Apagar Meta
async function apagarMeta(metaId, titulo) {
    if (!confirm(`Tem certeza que deseja apagar a meta "${titulo}"?`)) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/metas/${metaId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            carregarMetas();
        } else {
            alert("Erro ao apagar a meta.");
        }
    } catch (error) {
        console.error("Erro na requisição:", error);
        alert("Erro ao conectar com o servidor.");
    }
}

// 3. Abrir Modal de Edição de Meta
function abrirModalEditarMeta(id, titulo, objetivo, atual, dataLimite) {
    document.getElementById('editMetaId').value = id;
    document.getElementById('editMetaTitulo').value = titulo;
    document.getElementById('editMetaObjetivo').value = objetivo;
    document.getElementById('editMetaAtual').value = atual;
    document.getElementById('editMetaData').value = dataLimite ? dataLimite.split('T')[0] : '';

    document.getElementById('modalEditarMeta').classList.add('active');
}

// 4. Salvar Alterações da Meta no Backend
async function salvarEdicaoMeta() {
    const id = document.getElementById('editMetaId').value;
    const titulo = document.getElementById('editMetaTitulo').value.trim();
    const objetivo = parseFloat(document.getElementById('editMetaObjetivo').value);
    const atual = parseFloat(document.getElementById('editMetaAtual').value);
    const dataLimite = document.getElementById('editMetaData').value;

    if (!titulo || isNaN(objetivo) || isNaN(atual) || objetivo <= 0 || atual < 0) {
        alert("Preencha todos os campos obrigatórios corretamente!");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/metas/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                titulo: titulo,
                valor_objetivo: objetivo,
                valor_atual: atual,
                data_limite: dataLimite || null
            })
        });

        if (response.ok) {
            fecharModais();
            carregarMetas();
        } else {
            alert("Erro ao atualizar a meta.");
        }
    } catch (error) {
        console.error("Erro na requisição:", error);
        alert("Erro ao conectar com o servidor.");
    }
}

async function salvarMeta() {
    const titulo = document.getElementById('inputMetaTitulo').value;
    const objetivo = parseFloat(document.getElementById('inputMetaObjetivo').value);
    const atual = parseFloat(document.getElementById('inputMetaAtual').value) || 0;
    const dataLimite = document.getElementById('inputMetaData').value;

    if (!titulo || !objetivo) {
        alert("Informe o título e o valor necessário!");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/metas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                titulo: titulo,
                valor_objetivo: objetivo,
                valor_atual: atual,
                data_limite: dataLimite || null
            })
        });

        if (response.ok) {
            alert("Meta cadastrada com sucesso!");
            fecharModais();
            document.getElementById('inputMetaTitulo').value = '';
            document.getElementById('inputMetaObjetivo').value = '';
            document.getElementById('inputMetaAtual').value = '';
            document.getElementById('inputMetaData').value = '';
            carregarMetas();
        }
    } catch (error) {
        alert("Erro ao criar meta.");
    }
}

// Função para adicionar valor rápido no modal de progresso
function addValorProgresso(valor) {
    const input = document.getElementById('inputValorProgresso');
    if (!input) return;
    const valorAtual = parseFloat(input.value) || 0;
    input.value = (valorAtual + valor).toFixed(2);
}

// 1. Abre o modal estilizado em vez do prompt do navegador
function abrirModalProgressoMeta(metaId, tituloMeta) {
    document.getElementById('progressoMetaId').value = metaId;
    document.getElementById('tituloProgressoMeta').innerText = `Aporte: ${tituloMeta}`;
    document.getElementById('inputValorProgresso').value = '';

    document.getElementById('modalProgressoMeta').classList.add('active');
}

// 2. Envia o valor do modal para o backend
async function confirmarProgressoMeta() {
    const metaId = document.getElementById('progressoMetaId').value;
    const inputValor = document.getElementById('inputValorProgresso');
    const valor = parseFloat(inputValor.value);

    if (isNaN(valor) || valor <= 0) {
        alert("Por favor, digite um valor válido maior que zero!");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/metas/${metaId}/aporte`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ valor_adicional: valor })
        });

        if (response.ok) {
            fecharModais();
            carregarMetas();
        } else {
            alert("Erro ao adicionar valor à meta.");
        }
    } catch (error) {
        console.error("Erro ao registrar progresso:", error);
        alert("Erro ao conectar com o servidor.");
    }
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    carregarTransacoes();
    carregarResumoDashboard();

    const btnSubmit = document.querySelector('.btn-submit');
    if (btnSubmit) {
        btnSubmit.addEventListener('click', salvarLancamento);
    }

    const canvasEvolucao = document.getElementById('chartEvolucao');
    if (canvasEvolucao) {
        new Chart(canvasEvolucao.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
                datasets: [{
                    label: 'Gastos Totais (R$)',
                    data: [0, 0, 0, 0, 0, 0],
                    backgroundColor: '#2d6a4f',
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { grid: { color: '#2c3e3a' }, ticks: { color: '#95a5a6' } },
                    x: { grid: { display: false }, ticks: { color: '#95a5a6' } }
                }
            }
        });
    }
});
// Função para buscar o resumo financeiro do MySQL e preencher os cards do Dashboard
async function carregarResumoDashboard() {
    try {
        const response = await fetch(`${API_URL}/resumo-financas`);
        if (!response.ok) return;

        const resumo = await response.json();

        const cardReceitas = document.getElementById('cardReceitas');
        const cardDebito = document.getElementById('cardDebito');
        const cardFatura = document.getElementById('cardFatura');
        const cardSaldo = document.getElementById('cardSaldo');

        if (cardReceitas) cardReceitas.innerText = `R$ ${resumo.receitas.toFixed(2)}`;
        if (cardDebito) cardDebito.innerText = `R$ ${resumo.gastos_debito.toFixed(2)}`;
        if (cardFatura) cardFatura.innerText = `R$ ${resumo.fatura_cartao.toFixed(2)}`;
        if (cardSaldo) {
            cardSaldo.innerText = `R$ ${resumo.saldo_geral.toFixed(2)}`;
            // Muda a cor do saldo se estiver negativo
            cardSaldo.style.color = resumo.saldo_geral < 0 ? 'var(--danger)' : 'var(--text-main)';
        }
    } catch (error) {
        console.error("Erro ao carregar resumo do dashboard:", error);
    }
}