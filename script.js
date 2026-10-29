const API_URL = "http://127.0.0.1:8000";

let currentTab = 'tab-financas';

// ==========================================
// 0. CONTROLE DE TEMA (CLARO / ESCURO)
// ==========================================

function aplicarTema(tema) {
    document.documentElement.setAttribute('data-theme', tema);
    localStorage.setItem('theme', tema);

    const isDark = tema === 'dark';
    const btnSidebar = document.getElementById('btnThemeToggle');
    const btnHeader = document.getElementById('btnThemeToggleHeader');

    if (btnSidebar) {
        btnSidebar.innerHTML = isDark 
            ? '<i class="fa-solid fa-sun"></i> <span>Modo Claro</span>' 
            : '<i class="fa-solid fa-moon"></i> <span>Modo Escuro</span>';
    }

    if (btnHeader) {
        btnHeader.innerHTML = isDark 
            ? '<i class="fa-solid fa-sun"></i>' 
            : '<i class="fa-solid fa-moon"></i>';
    }

    atualizarCoresGraficosParaTema(isDark);
}

function alternarTema() {
    const temaAtual = document.documentElement.getAttribute('data-theme') || 'light';
    const novoTema = temaAtual === 'dark' ? 'light' : 'dark';
    aplicarTema(novoTema);
}

function atualizarCoresGraficosParaTema(isDark) {
    const gridColor = isDark ? '#22372c' : '#dbe7e0';
    const textColor = isDark ? '#8ea79a' : '#567064';
    const sliceBorder = isDark ? '#14221b' : '#ffffff';

    if (chartEvolucaoInstance) {
        chartEvolucaoInstance.options.scales.y.grid.color = gridColor;
        chartEvolucaoInstance.options.scales.y.ticks.color = textColor;
        chartEvolucaoInstance.options.scales.x.ticks.color = textColor;
        if (chartEvolucaoInstance.options.plugins.legend) {
            chartEvolucaoInstance.options.plugins.legend.labels.color = textColor;
        }
        chartEvolucaoInstance.update();
    }

    if (chartSetoresInstance) {
        chartSetoresInstance.data.datasets.forEach(ds => ds.borderColor = sliceBorder);
        chartSetoresInstance.update();
    }

    if (chartInvestDashInstance) {
        chartInvestDashInstance.data.datasets.forEach(ds => ds.borderColor = sliceBorder);
        chartInvestDashInstance.update();
    }
}

(function() {
    const temaSalvo = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', temaSalvo);
})();

// 1. Navegação de Abas
function switchTab(tabId, element) {
    currentTab = tabId;
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));

    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');
    if (element) element.classList.add('active');

    const btnHeader = document.getElementById('btnActionHeader');
    if (btnHeader) {
        if (tabId === 'tab-investimentos') {
            btnHeader.innerHTML = '<i class="fa-solid fa-chart-line"></i> Fazer Aporte';
        } else if (tabId === 'tab-metas') {
            btnHeader.innerHTML = '<i class="fa-solid fa-bullseye"></i> Nova Meta';
        } else if (tabId === 'tab-cartoes') {
            btnHeader.innerHTML = '<i class="fa-solid fa-credit-card"></i> Novo Cartão';
        } else {
            btnHeader.innerHTML = '<i class="fa-solid fa-plus"></i> Novo Lançamento';
        }
    }

    if (tabId === 'tab-financas') {
        carregarResumoDashboard();
        carregarGraficoEvolucao();
        carregarGraficoSetores();
    }
    if (tabId === 'tab-cartoes') carregarCartoes();
    if (tabId === 'tab-investimentos') carregarInvestimentos();
    if (tabId === 'tab-metas') carregarMetas();
    if (tabId === 'tab-lancamento') { 
    carregarTransacoes(); 
    carregarCartoes(); 
    // Garante que verifica se o select está em "CREDITO" ao abrir a aba
    const selectMeio = document.getElementById('selectMeio');
    if (selectMeio) toggleCartoes(selectMeio.value);
}
}

function executarAcaoHeader() {
    if (currentTab === 'tab-investimentos') {
        document.getElementById('modalAporte').classList.add('active');
    } else if (currentTab === 'tab-metas') {
        document.getElementById('modalMeta').classList.add('active');
    } else if (currentTab === 'tab-cartoes') {
        abrirModalCartao();
    } else {
        const navLancamento = document.querySelectorAll('.nav-item')[1];
        switchTab('tab-lancamento', navLancamento);
    }
}

function fecharModais() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
}

// 2. Transações
// Alteração na função setType para esconder Meio de Pagamento e Cartões em Entradas
function setType(type, btn) {
    document.querySelectorAll('.type-btn').forEach(b => b.className = 'type-btn');
    btn.classList.add('active', type);

    const groupMeio = document.getElementById('groupMeioPagamento');
    const groupCartoes = document.getElementById('groupCartoes');
    const groupParcelas = document.getElementById('groupParcelas');
    const groupCatSaida = document.getElementById('groupCategoriaSaida');
    const groupCatEntrada = document.getElementById('groupCategoriaEntrada');
    const linhaForm = document.getElementById('linhaFormularioDuplo');

    if (type === 'entrada') {
        // Esconde campos de Saída
        if (groupMeio) groupMeio.style.display = 'none';
        if (groupCartoes) groupCartoes.style.display = 'none';
        if (groupParcelas) groupParcelas.style.display = 'none';
        if (groupCatSaida) groupCatSaida.style.display = 'none';

        // Mostra Categoria de Entrada
        if (groupCatEntrada) groupCatEntrada.style.display = 'block';

        // Ocupa 100% da largura da linha
        if (linhaForm) linhaForm.style.gridTemplateColumns = '1fr';
    } else {
        // Mostra campos de Saída
        if (groupMeio) groupMeio.style.display = 'block';
        if (groupCatSaida) groupCatSaida.style.display = 'block';

        // Esconde Categoria de Entrada
        if (groupCatEntrada) groupCatEntrada.style.display = 'none';

        // Volta a linha para 2 colunas
        if (linhaForm) linhaForm.style.gridTemplateColumns = '1fr 1fr';

        // Restaura cartões caso o meio seja CREDITO
        const selectMeio = document.getElementById('selectMeio');
        if (selectMeio) toggleCartoes(selectMeio.value);
    }
}

async function salvarLancamento(event) {
    if (event) event.preventDefault();

    const inputValor = document.getElementById('inputValor');
    const inputDescricao = document.getElementById('inputDescricao');
    const selectMeio = document.getElementById('selectMeio');
    const selectCartao = document.getElementById('selectCartao');
    const selectParcelas = document.getElementById('selectParcelas');
    
    const selectCatSaida = document.getElementById('selectCategoriaSaida');
    const selectCatEntrada = document.getElementById('selectCategoriaEntrada');
    
    const btnSaida = document.querySelector('.type-btn.saida');

    if (!inputValor || !inputDescricao) {
        alert("Erro no formulário: campos não encontrados.");
        return;
    }

    const valor = parseFloat(inputValor.value);
    const descricao = inputDescricao.value.trim();
    const tipo = btnSaida && btnSaida.classList.contains('active') ? 'SAIDA' : 'ENTRADA';

    // Pega a categoria correta dependendo do tipo selecionado
    const categoria = tipo === 'SAIDA' 
        ? (selectCatSaida ? selectCatSaida.value : 'Geral')
        : (selectCatEntrada ? selectCatEntrada.value : 'Receita');

    if (isNaN(valor) || valor <= 0 || !descricao) {
        alert("Preencha um valor válido e a descrição!");
        return;
    }

    let meioPagamentoFinal = tipo === 'ENTRADA' 
        ? `Receita (${categoria})` 
        : (selectMeio ? selectMeio.value : 'PIX');

    if (tipo === 'SAIDA' && meioPagamentoFinal === 'CREDITO') {
        const cartaoEscolhido = selectCartao ? selectCartao.value.trim() : '';
        if (cartaoEscolhido) {
            meioPagamentoFinal = `Crédito (${cartaoEscolhido})`;
        } else {
            alert("Por favor, selecione qual cartão de crédito foi utilizado!");
            return;
        }
    }

    const parcelas = (tipo === 'SAIDA' && selectParcelas && selectMeio.value === 'CREDITO') 
        ? parseInt(selectParcelas.value) 
        : 1;

    try {
        const response = await fetch(`${API_URL}/transacoes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                descricao: descricao,
                valor: valor,
                tipo: tipo,
                meio_pagamento: meioPagamentoFinal,
                parcelas: parcelas
            })
        });

        if (response.ok) {
            alert("Lançamento salvo com sucesso!");
            inputValor.value = '';
            inputDescricao.value = '';
            if (selectCartao) selectCartao.value = '';
            
            carregarTransacoes();
            carregarResumoDashboard();
            carregarGraficoEvolucao();
        } else {
            const erroData = await response.json();
            alert(`Erro ao salvar: ${erroData.detail || 'Falha no servidor'}`);
        }
    } catch (error) {
        console.error("Erro na requisição:", error);
        alert("Erro ao conectar com o servidor.");
    }
}

function addValor(valor) {
    const input = document.getElementById('inputValor');
    if (!input) return;
    const valorAtual = parseFloat(input.value) || 0;
    input.value = (valorAtual + valor).toFixed(2);
}

function toggleCartoes(meio) {
    const groupCartoes = document.getElementById('groupCartoes');
    const groupParcelas = document.getElementById('groupParcelas');
    if (meio === 'CREDITO') {
        if (groupCartoes) groupCartoes.style.display = 'block';
        if (groupParcelas) groupParcelas.style.display = 'block';
    } else {
        if (groupCartoes) groupCartoes.style.display = 'none';
        if (groupParcelas) groupParcelas.style.display = 'none';
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

async function apagarTransacao(id, descricao) {
    if (!confirm(`Deseja realmente apagar o lançamento "${descricao}"?`)) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/transacoes/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            carregarTransacoes();
            carregarResumoDashboard();
            carregarGraficoEvolucao();
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
    const selectCartao = document.getElementById('selectCartao');
    const selectParcelas = document.getElementById('selectParcelas');
    const btnSaida = document.querySelector('.type-btn.saida');

    if (!inputValor || !inputDescricao) {
        alert("Erro no formulário: campos não encontrados.");
        return;
    }

    const valor = parseFloat(inputValor.value);
    const descricao = inputDescricao.value.trim();
    const meioSelecionado = selectMeio ? selectMeio.value : 'PIX';
    const tipo = btnSaida && btnSaida.classList.contains('active') ? 'SAIDA' : 'ENTRADA';

    if (isNaN(valor) || valor <= 0 || !descricao) {
        alert("Preencha um valor válido e a descrição!");
        return;
    }

    let meioPagamentoFinal = meioSelecionado;
    if (meioSelecionado === 'CREDITO') {
        const cartaoEscolhido = selectCartao ? selectCartao.value.trim() : '';
        if (cartaoEscolhido) {
            meioPagamentoFinal = `Crédito (${cartaoEscolhido})`;
        } else {
            alert("Por favor, selecione qual cartão de crédito foi utilizado!");
            return;
        }
    }

    const parcelas = selectParcelas && meioSelecionado === 'CREDITO' ? parseInt(selectParcelas.value) : 1;

    try {
        const response = await fetch(`${API_URL}/transacoes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                descricao: descricao,
                valor: valor,
                tipo: tipo,
                meio_pagamento: meioPagamentoFinal,
                parcelas: parcelas
            })
        });

        if (response.ok) {
            alert("Lançamento salvo com sucesso!");
            inputValor.value = '';
            inputDescricao.value = '';
            if (selectCartao) selectCartao.value = '';
            
            carregarTransacoes();
            carregarResumoDashboard();
            carregarGraficoEvolucao();
        } else {
            const erroData = await response.json();
            alert(`Erro ao salvar: ${erroData.detail || 'Falha no servidor'}`);
        }
    } catch (error) {
        console.error("Erro na requisição:", error);
        alert("Erro ao conectar com o servidor.");
    }
}


// 3. Gráfico de Evolução Mensal (Barras)

let chartEvolucaoInstance = null;
let dadosGraficoCache = null;
let filtroGraficoAtual = 'ambos';

function filtrarGrafico(modo, btnElement) {
    filtroGraficoAtual = modo;

    const container = btnElement.parentElement;
    container.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    btnElement.classList.add('active');

    if (chartEvolucaoInstance && dadosGraficoCache) {
        renderizarDatasetGrafico();
    }
}

function renderizarDatasetGrafico() {
    if (!chartEvolucaoInstance || !dadosGraficoCache) return;

    const datasetSaidas = {
        label: 'Saídas (R$)',
        data: dadosGraficoCache.saidas,
        backgroundColor: '#b91c1c',
        borderRadius: 6
    };

    const datasetEntradas = {
        label: 'Entradas (R$)',
        data: dadosGraficoCache.entradas,
        backgroundColor: '#1b4332',
        borderRadius: 6
    };

    if (filtroGraficoAtual === 'saidas') {
        chartEvolucaoInstance.data.datasets = [datasetSaidas];
    } else if (filtroGraficoAtual === 'entradas') {
        chartEvolucaoInstance.data.datasets = [datasetEntradas];
    } else {
        chartEvolucaoInstance.data.datasets = [datasetEntradas, datasetSaidas];
    }

    chartEvolucaoInstance.update();
}

async function carregarGraficoEvolucao() {
    try {
        const response = await fetch(`${API_URL}/grafico-gastos-mensais`);
        if (!response.ok) return;

        dadosGraficoCache = await response.json();
        const canvasEvolucao = document.getElementById('chartEvolucao');
        if (!canvasEvolucao) return;

        if (!chartEvolucaoInstance) {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const gridColor = isDark ? '#22372c' : '#dbe7e0';
            const textColor = isDark ? '#8ea79a' : '#567064';

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
                            labels: { color: textColor, font: { family: "'EB Garamond', Garamond, Georgia, serif", size: 14 } } 
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
                            grid: { color: gridColor }, 
                            ticks: { 
                                color: textColor,
                                font: { family: "'EB Garamond', Garamond, Georgia, serif", size: 13 },
                                callback: function(value) { return 'R$ ' + value; }
                            } 
                        },
                        x: { 
                            grid: { display: false }, 
                            ticks: { 
                                color: textColor,
                                font: { family: "'EB Garamond', Garamond, Georgia, serif", size: 13 }
                            } 
                        }
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


// 4. Gráfico de Pizza - Alocação por Setor no Dashboard Principal

let chartSetoresInstance = null;

const coresSetores = [
    '#2d6a4f', '#40916c', '#52b788', '#74c69d', '#95d5b2',
    '#e63946', '#f4a261', '#2a9d8f', '#e76f51', '#457b9d'
];

async function carregarGraficoSetores() {
    try {
        const response = await fetch(`${API_URL}/investimentos/setores`);
        if (!response.ok) return;

        const dados = await response.json();
        const canvasSetores = document.getElementById('chartSetores');
        const containerLista = document.getElementById('listaSetoresResumo');

        if (!canvasSetores) return;

        if (!dados.valores || dados.valores.length === 0) {
            if (containerLista) {
                containerLista.innerHTML = '<p style="color: var(--text-muted); text-align: center; margin-top: 1rem;">Nenhum ativo cadastrado na carteira.</p>';
            }
            if (chartSetoresInstance) {
                chartSetoresInstance.destroy();
                chartSetoresInstance = null;
            }
            return;
        }

        const valorTotalGeral = dados.valores.reduce((acc, curr) => acc + curr, 0);

        if (containerLista) {
            containerLista.innerHTML = '';
            dados.labels.forEach((setor, index) => {
                const valor = dados.valores[index];
                const pct = valorTotalGeral > 0 ? ((valor / valorTotalGeral) * 100).toFixed(1) : '0.0';
                const cor = coresSetores[index % coresSetores.length];

                const item = document.createElement('div');
                item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; padding: 4px 0; border-bottom: 1px solid var(--border-color);';
                item.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="width: 10px; height: 10px; border-radius: 50%; background-color: ${cor}; display: inline-block;"></span>
                        <span style="color: var(--text-main); font-weight: 500;">${setor}</span>
                    </div>
                    <div>
                        <strong style="color: var(--forest-primary);">R$ ${valor.toFixed(2)}</strong>
                        <span style="color: var(--text-muted); font-size: 0.8rem; margin-left: 6px;">(${pct}%)</span>
                    </div>
                `;
                containerLista.appendChild(item);
            });
        }

        if (chartSetoresInstance) {
            chartSetoresInstance.data.labels = dados.labels;
            chartSetoresInstance.data.datasets[0].data = dados.valores;
            chartSetoresInstance.data.datasets[0].backgroundColor = coresSetores.slice(0, dados.labels.length);
            chartSetoresInstance.update();
        } else {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            chartSetoresInstance = new Chart(canvasSetores.getContext('2d'), {
                type: 'pie', // PIZZA CHEIO
                data: {
                    labels: dados.labels,
                    datasets: [{
                        data: dados.valores,
                        backgroundColor: coresSetores.slice(0, dados.labels.length),
                        borderWidth: 2,
                        borderColor: isDark ? '#14221b' : '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const val = parseFloat(context.raw);
                                    const pct = valorTotalGeral > 0 ? ((val / valorTotalGeral) * 100).toFixed(1) : 0;
                                    return ` ${context.label}: R$ ${val.toFixed(2)} (${pct}%)`;
                                }
                            }
                        }
                    }
                }
            });
        }
    } catch (error) {
        console.error("Erro ao carregar gráfico de setores:", error);
    }
}


// 5. Investimentos & Dashboard de Ações (com cores personalizadas)

let chartInvestDashInstance = null;
let modoDashboardInvest = 'setor';
let listaAtivosCache = [];

function alternarDashboardInvestimentos(modo, btn) {
    modoDashboardInvest = modo;
    const container = btn.parentElement;
    container.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    renderizarDashboardInvestimentos();
}

function renderizarDashboardInvestimentos() {
    const canvas = document.getElementById('chartInvestimentosDash');
    const containerLista = document.getElementById('listaInvestimentosDashboard');
    if (!canvas) return;

    if (!listaAtivosCache || listaAtivosCache.length === 0) {
        if (containerLista) {
            containerLista.innerHTML = '<p style="color: var(--text-muted); text-align: center; margin-top: 1rem;">Nenhum ativo cadastrado na carteira.</p>';
        }
        if (chartInvestDashInstance) {
            chartInvestDashInstance.destroy();
            chartInvestDashInstance = null;
        }
        return;
    }

    let agrupado = {};
    let coresAtivos = {};
    let totalGeral = 0;

    if (modoDashboardInvest === 'setor') {
        listaAtivosCache.forEach(a => {
            const setor = a.setor ? a.setor.trim() : 'Outros';
            const total = parseFloat(a.quantidade) * parseFloat(a.preco_medio);
            agrupado[setor] = (agrupado[setor] || 0) + total;
            totalGeral += total;
        });
    } else {
        listaAtivosCache.forEach(a => {
            const ticker = a.ticker ? a.ticker.trim().toUpperCase() : 'Ativo';
            const total = parseFloat(a.quantidade) * parseFloat(a.preco_medio);
            agrupado[ticker] = (agrupado[ticker] || 0) + total;
            coresAtivos[ticker] = a.cor_hex || '#2d6a4f';
            totalGeral += total;
        });
    }

    const itensOrdenados = Object.entries(agrupado).sort((a, b) => b[1] - a[1]);
    const labels = itensOrdenados.map(item => item[0]);
    const valores = itensOrdenados.map(item => item[1]);

    const coresPadrao = [
        '#2d6a4f', '#40916c', '#52b788', '#74c69d', '#95d5b2',
        '#f4a261', '#e76f51', '#2a9d8f', '#457b9d', '#1d3557'
    ];

    const coresFinais = labels.map((label, idx) => {
        if (modoDashboardInvest === 'acao' && coresAtivos[label]) {
            return coresAtivos[label];
        }
        return coresPadrao[idx % coresPadrao.length];
    });

    if (containerLista) {
        containerLista.innerHTML = '';
        labels.forEach((label, idx) => {
            const val = valores[idx];
            const pct = totalGeral > 0 ? ((val / totalGeral) * 100).toFixed(1) : '0.0';
            const cor = coresFinais[idx];

            const item = document.createElement('div');
            item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding: 6px 0; border-bottom: 1px solid var(--border-color);';
            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="width: 10px; height: 10px; border-radius: 50%; background-color: ${cor}; display: inline-block;"></span>
                    <span style="font-weight: 500; color: var(--text-main);">${label}</span>
                </div>
                <div>
                    <strong style="color: var(--forest-primary);">R$ ${val.toFixed(2)}</strong>
                    <span style="color: var(--text-muted); font-size: 0.8rem; margin-left: 6px;">(${pct}%)</span>
                </div>
            `;
            containerLista.appendChild(item);
        });
    }

    if (chartInvestDashInstance) {
        chartInvestDashInstance.data.labels = labels;
        chartInvestDashInstance.data.datasets[0].data = valores;
        chartInvestDashInstance.data.datasets[0].backgroundColor = coresFinais;
        chartInvestDashInstance.update();
    } else {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        chartInvestDashInstance = new Chart(canvas.getContext('2d'), {
            type: 'pie', // PIZZA CHEIO
            data: {
                labels: labels,
                datasets: [{
                    data: valores,
                    backgroundColor: coresFinais,
                    borderWidth: 2,
                    borderColor: isDark ? '#14221b' : '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const val = parseFloat(context.raw);
                                const pct = totalGeral > 0 ? ((val / totalGeral) * 100).toFixed(1) : 0;
                                return ` ${context.label}: R$ ${val.toFixed(2)} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }
}

// --- CONTROLE DE ORDENAÇÃO DA TABELA DE INVESTIMENTOS ---
let colunaOrdenacao = null; // 'quantidade', 'preco_medio' ou 'total'
let ordemAscendente = true; // true = menor -> maior (▲), false = maior -> menor (▼)

function ordenarInvestimentos(coluna) {
    if (colunaOrdenacao === coluna) {
        // Se já está ordenando por essa coluna, inverte o sentido (Asc / Desc)
        ordemAscendente = !ordemAscendente;
    } else {
        // Nova coluna selecionada, inicia em ordem crescente
        colunaOrdenacao = coluna;
        ordemAscendente = true;
    }

    // Recarrega e renderiza a tabela com a nova ordem aplicada
    carregarInvestimentos();
}

function atualizarIconesOrdenacao() {
    const colunas = ['quantidade', 'preco_medio', 'total'];
    
    colunas.forEach(col => {
        const icon = document.getElementById(`sort-icon-${col}`);
        if (!icon) return;

        if (colunaOrdenacao === col) {
            icon.innerText = ordemAscendente ? '▲' : '▼';
            icon.style.opacity = '1';
            icon.style.color = 'var(--forest-primary)';
        } else {
            icon.innerText = '↕';
            icon.style.opacity = '0.3';
            icon.style.color = 'inherit';
        }
    });
}

async function carregarInvestimentos() {
    try {
        const response = await fetch(`${API_URL}/investimentos`);
        if (!response.ok) return;

        let ativos = await response.json();

        // 1. Aplica a ordenação se alguma coluna foi selecionada
        if (colunaOrdenacao) {
            ativos.sort((a, b) => {
                let valA, valB;

                if (colunaOrdenacao === 'total') {
                    valA = parseFloat(a.quantidade) * parseFloat(a.preco_medio);
                    valB = parseFloat(b.quantidade) * parseFloat(b.preco_medio);
                } else if (colunaOrdenacao === 'quantidade') {
                    valA = parseFloat(a.quantidade);
                    valB = parseFloat(b.quantidade);
                } else if (colunaOrdenacao === 'preco_medio') {
                    valA = parseFloat(a.preco_medio);
                    valB = parseFloat(b.preco_medio);
                }

                return ordemAscendente ? valA - valB : valB - valA;
            });
        }

        listaAtivosCache = ativos;

        // 2. Atualiza os ícones de setinhas do cabeçalho
        atualizarIconesOrdenacao();

        const tbody = document.getElementById('tbodyInvestimentos');
        const cardTotal = document.getElementById('totalInvestido');
        const badgeAtivos = document.getElementById('badgeTotalAtivos');
        
        if (badgeAtivos) {
            badgeAtivos.innerText = `${ativos.length} ${ativos.length === 1 ? 'ativo' : 'ativos'}`;
        }

        if (!tbody) return;
        tbody.innerHTML = '';

        let totalGeral = 0;

        if (ativos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-muted);">Nenhum ativo cadastrado.</td></tr>';
            if (cardTotal) cardTotal.innerText = 'R$ 0,00';
            renderizarDashboardInvestimentos();
            return;
        }

        ativos.forEach(a => {
            const qtd = parseFloat(a.quantidade);
            const pm = parseFloat(a.preco_medio);
            const total = qtd * pm;
            const cor = a.cor_hex || '#2d6a4f';
            totalGeral += total;

            const tickerEscapado = (a.ticker || '').replace(/'/g, "\\'");
            const setorEscapado = (a.setor || '').replace(/'/g, "\\'");

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="width: 12px; height: 12px; border-radius: 50%; background-color: ${cor}; display: inline-block; border: 1px solid rgba(0,0,0,0.15);" title="Cor atribuída: ${cor}"></span>
                        <strong>${a.ticker}</strong>
                    </div>
                </td>
                <td>${a.setor}</td>
                <td>${qtd}</td>
                <td>R$ ${pm.toFixed(2)}</td>
                <td style="color: var(--forest-light); font-weight: 600;">R$ ${total.toFixed(2)}</td>
                <td style="text-align: center;">
                    <i class="fa-solid fa-pen" style="color: var(--forest-light); cursor: pointer; margin-right: 12px;" 
                       title="Editar Ativo" 
                       onclick="abrirModalEditarAtivo(${a.id}, '${tickerEscapado}', '${setorEscapado}', ${qtd}, ${pm}, '${cor}')"></i>
                    <i class="fa-solid fa-trash-can" style="color: var(--danger); cursor: pointer;" 
                       title="Excluir Ativo" 
                       onclick="apagarInvestimento(${a.id}, '${tickerEscapado}')"></i>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (cardTotal) cardTotal.innerText = `R$ ${totalGeral.toFixed(2)}`;

        renderizarDashboardInvestimentos();
    } catch (error) {
        console.error("Erro ao carregar investimentos:", error);
    }
}

async function apagarInvestimento(ativoId, ticker) {
    if (!confirm(`Tem certeza que deseja apagar o ativo ${ticker} da sua carteira?`)) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/investimentos/${ativoId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            carregarInvestimentos();
            carregarGraficoSetores();
        } else {
            alert("Erro ao remover o ativo.");
        }
    } catch (error) {
        console.error("Erro na requisição:", error);
        alert("Erro ao conectar com o servidor.");
    }
}

function abrirModalEditarAtivo(id, ticker, setor, qtd, pm, corHex) {
    const inputId = document.getElementById('editAtivoId');
    const inputTicker = document.getElementById('editTicker');
    const inputSetor = document.getElementById('editSetor');
    const inputCor = document.getElementById('editCorAtivo');
    const inputQtd = document.getElementById('editQtd');
    const inputPm = document.getElementById('editPrecoMedio');

    if (inputId) inputId.value = id;
    if (inputTicker) inputTicker.value = ticker;
    if (inputSetor) inputSetor.value = setor;
    if (inputCor) inputCor.value = (corHex && corHex !== 'null' && corHex !== 'undefined') ? corHex : '#2d6a4f';
    if (inputQtd) inputQtd.value = qtd;
    if (inputPm) inputPm.value = pm;

    const modal = document.getElementById('modalEditarAtivo');
    if (modal) modal.classList.add('active');
}

async function salvarEdicaoAtivo() {
    const id = document.getElementById('editAtivoId').value;
    const setor = document.getElementById('editSetor').value.trim();
    const cor = document.getElementById('editCorAtivo').value;
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
                preco_medio: pm,
                cor_hex: cor
            })
        });

        if (response.ok) {
            fecharModais();
            carregarInvestimentos();
            carregarGraficoSetores();
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
    const cor = document.getElementById('inputCorAtivo').value;
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
            body: JSON.stringify({ 
                ticker: ticker, 
                setor: setor, 
                quantidade: qtd, 
                preco: preco,
                cor_hex: cor
            })
        });

        if (response.ok) {
            fecharModais();
            document.getElementById('inputTicker').value = '';
            document.getElementById('inputSetor').value = '';
            document.getElementById('inputQtd').value = '';
            document.getElementById('inputPreco').value = '';
            carregarInvestimentos();
            carregarGraficoSetores();
        }
    } catch (error) {
        alert("Erro ao salvar aporte.");
    }
}


// 6. Metas

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

function abrirModalEditarMeta(id, titulo, objetivo, atual, dataLimite) {
    document.getElementById('editMetaId').value = id;
    document.getElementById('editMetaTitulo').value = titulo;
    document.getElementById('editMetaObjetivo').value = objetivo;
    document.getElementById('editMetaAtual').value = atual;
    document.getElementById('editMetaData').value = dataLimite ? dataLimite.split('T')[0] : '';

    document.getElementById('modalEditarMeta').classList.add('active');
}

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

function addValorProgresso(valor) {
    const input = document.getElementById('inputValorProgresso');
    if (!input) return;
    const valorAtual = parseFloat(input.value) || 0;
    input.value = (valorAtual + valor).toFixed(2);
}

function abrirModalProgressoMeta(metaId, tituloMeta) {
    document.getElementById('progressoMetaId').value = metaId;
    document.getElementById('tituloProgressoMeta').innerText = `Aporte: ${tituloMeta}`;
    document.getElementById('inputValorProgresso').value = '';

    document.getElementById('modalProgressoMeta').classList.add('active');
}

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


// 7. Dashboard Resumo Financas

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
            cardSaldo.style.color = resumo.saldo_geral < 0 ? 'var(--danger)' : 'var(--text-main)';
        }
    } catch (error) {
        console.error("Erro ao carregar resumo do dashboard:", error);
    }
}


// 8. Cartões de Crédito

function abrirModalCartao() {
    document.getElementById('inputNomeCartao').value = '';
    document.getElementById('inputLimiteCartao').value = '';
    document.getElementById('inputFechamentoCartao').value = '';
    document.getElementById('inputVencimentoCartao').value = '';
    document.getElementById('modalCartao').classList.add('active');
}

async function salvarCartao() {
    const nome = document.getElementById('inputNomeCartao').value.trim();
    const limite = parseFloat(document.getElementById('inputLimiteCartao').value) || 0.0;
    const fechamento = parseInt(document.getElementById('inputFechamentoCartao').value) || 3;
    const vencimento = parseInt(document.getElementById('inputVencimentoCartao').value) || 10;

    if (!nome) {
        alert("Por favor, informe o nome do cartão ou banco!");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/cartoes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nome: nome,
                limite: limite,
                dia_fechamento: fechamento,
                dia_vencimento: vencimento
            })
        });

        if (response.ok) {
            fecharModais();
            carregarCartoes();
        } else {
            alert("Erro ao cadastrar cartão.");
        }
    } catch (error) {
        console.error("Erro ao salvar cartão:", error);
        alert("Erro ao conectar com o servidor.");
    }
}

async function apagarCartao(id, nome) {
    if (!confirm(`Deseja realmente apagar o cartão "${nome}"?`)) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/cartoes/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            carregarCartoes();
        } else {
            alert("Erro ao excluir o cartão.");
        }
    } catch (error) {
        console.error("Erro ao apagar cartão:", error);
        alert("Erro ao conectar com o servidor.");
    }
}

async function carregarCartoes() {
    try {
        const response = await fetch(`${API_URL}/cartoes`);
        if (!response.ok) return;

        const cartoes = await response.json();
        const grid = document.getElementById('gridCartoes');
        const cardTotalLimite = document.getElementById('cardTotalLimiteCartoes');
        const cardQtd = document.getElementById('cardQtdCartoes');
        const selectLancamento = document.getElementById('selectCartao');

        let totalLimite = 0;

        if (selectLancamento) {
            selectLancamento.innerHTML = '<option value="">Selecione o cartão...</option>';
            cartoes.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.nome;
            opt.textContent = `${c.nome} (Vence dia ${c.dia_vencimento})`;
            selectLancamento.appendChild(opt);
});
        }

        if (cardQtd) cardQtd.innerText = cartoes.length;

        if (!grid) return;
        grid.innerHTML = '';

        if (cartoes.length === 0) {
            grid.innerHTML = '<p style="color: var(--text-muted); text-align: center; grid-column: 1 / -1; padding: 2.5rem 0;">Nenhum cartão cadastrado ainda. Clique em "Novo Cartão" para adicionar!</p>';
            if (cardTotalLimite) cardTotalLimite.innerText = 'R$ 0,00';
            return;
        }

        cartoes.forEach(c => {
            const limite = parseFloat(c.limite) || 0.0;
            const faturaAtual = parseFloat(c.fatura_atual) || 0.0;
            const parcelasFuturas = parseFloat(c.parcelas_futuras) || 0.0;
            const faturaTotal = faturaAtual + parcelasFuturas;
            const limiteDisponivel = Math.max(0, limite - faturaTotal);
            
            const pctUso = limite > 0 ? Math.min(100, (faturaTotal / limite) * 100) : 0;
            
            totalLimite += limite;

            const card = document.createElement('div');
            card.className = 'cartao-item-card';
            const nomeEscapado = c.nome.replace(/'/g, "\\'");

            card.innerHTML = `
                <div class="cartao-top">
                    <span class="cartao-bank-name">${c.nome}</span>
                    <i class="fa-solid fa-microchip cartao-chip" title="Chip"></i>
                </div>
                
                <div class="cartao-middle">
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 8px;">
                        <div>
                            <div class="cartao-limite-label">Fatura Atual</div>
                            <div class="cartao-limite-val" style="font-size: 1.35rem;">R$ ${faturaAtual.toFixed(2)}</div>
                        </div>
                        <div style="text-align: right;">
                            <div class="cartao-limite-label">Limite Livre</div>
                            <div class="cartao-limite-val" style="font-size: 1.05rem; color: #a3cfb6;">R$ ${limiteDisponivel.toFixed(2)}</div>
                        </div>
                    </div>
                    
                    <div style="width: 100%; background: rgba(255,255,255,0.2); height: 6px; border-radius: 3px; overflow: hidden; margin-bottom: 4px;">
                        <div style="width: ${pctUso}%; background: ${pctUso > 85 ? '#ef4444' : '#ffffff'}; height: 100%; border-radius: 3px; transition: width 0.4s ease;"></div>
                    </div>

                    <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: rgba(255,255,255,0.8);">
                        <span>Total Gasto: R$ ${faturaTotal.toFixed(2)}</span>
                        <span>Futuras: R$ ${parcelasFuturas.toFixed(2)}</span>
                    </div>
                </div>

                <div class="cartao-bottom" style="margin-top: 10px;">
                    <div>
                        <span>Fech: Dia ${c.dia_fechamento}</span> | 
                        <strong>Venc: Dia ${c.dia_vencimento}</strong>
                    </div>
                    <button class="btn-apagar-cartao" title="Apagar Cartão" onclick="apagarCartao(${c.id}, '${nomeEscapado}')">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            `;
            grid.appendChild(card);
        });

        if (cardTotalLimite) cardTotalLimite.innerText = `R$ ${totalLimite.toFixed(2)}`;
    } catch (error) {
        console.error("Erro ao carregar cartões:", error);
    }
}


// --- INICIALIZAÇÃO ---

// --- INICIALIZAÇÃO ---

document.addEventListener('DOMContentLoaded', () => {
    const temaAtual = localStorage.getItem('theme') || 'light';
    aplicarTema(temaAtual);

    carregarTransacoes();
    carregarResumoDashboard();
    carregarGraficoEvolucao();
    carregarGraficoSetores();
    carregarCartoes();

    // Garante o estado correto do campo de cartão ao iniciar
    const selectMeio = document.getElementById('selectMeio');
    if (selectMeio) toggleCartoes(selectMeio.value);

    const btnSubmit = document.querySelector('#tab-lancamento .btn-submit');
    if (btnSubmit) {
        btnSubmit.onclick = salvarLancamento;
    }
});