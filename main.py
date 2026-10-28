import datetime
from dateutil.relativedelta import relativedelta

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pymysql
from typing import Optional
from datetime import date

app = FastAPI(title="API Finanças Pessoais")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db_connection():
    return pymysql.connect(
        host='localhost',
        user='root',
        password='maosinho',  # Insira sua senha do MySQL aqui se houver
        database='financas_davi',
        cursorclass=pymysql.cursors.DictCursor
    )

# --- SCHEMAS (MODELOS DE DADOS) ---

class TransacaoSchema(BaseModel):
    descricao: str
    valor: float
    tipo: str
    meio_pagamento: str
    data_transacao: Optional[str] = None

class AtivoSchema(BaseModel):
    ticker: str
    setor: str
    quantidade: float
    preco: float

class MetaSchema(BaseModel):
    titulo: str
    valor_objetivo: float
    valor_atual: Optional[float] = 0.0
    data_limite: Optional[str] = None

class ProgressoMetaSchema(BaseModel):
    valor_adicional: float


# --- ROTAS DE TRANSAÇÕES ---

@app.get("/transacoes")
def listar_transacoes():
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            sql = "SELECT * FROM transacoes ORDER BY id DESC LIMIT 10"
            cursor.execute(sql)
            resultados = cursor.fetchall()
        connection.close()
        return resultados
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/transacoes")
def criar_transacao(transacao: TransacaoSchema):
    try:
        data_final = transacao.data_transacao if transacao.data_transacao else date.today().strftime('%Y-%m-%d')
        connection = get_db_connection()
        with connection.cursor() as cursor:
            sql = """
                INSERT INTO transacoes (descricao, valor, tipo, meio_pagamento, data_transacao)
                VALUES (%s, %s, %s, %s, %s)
            """
            cursor.execute(sql, (
                transacao.descricao,
                transacao.valor,
                transacao.tipo,
                transacao.meio_pagamento,
                data_final
            ))
            connection.commit()
        connection.close()
        return {"mensagem": "Transação salva com sucesso!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- ROTAS DE INVESTIMENTOS (APORTES E PREÇO MÉDIO) ---

@app.get("/investimentos")
def listar_investimentos():
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            sql = "SELECT * FROM ativos ORDER BY ticker ASC"
            cursor.execute(sql)
            ativos = cursor.fetchall()
        connection.close()
        return ativos
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/investimentos")
def realizar_aporte(ativo: AtivoSchema):
    try:
        ticker_upper = ativo.ticker.strip().upper()
        connection = get_db_connection()
        
        with connection.cursor() as cursor:
            # Verifica se o ativo já existe na carteira
            sql_check = "SELECT * FROM ativos WHERE ticker = %s"
            cursor.execute(sql_check, (ticker_upper,))
            existente = cursor.fetchone()

            if existente:
                # Recalcula a quantidade total e o Preço Médio Ponderado
                qtd_antiga = float(existente['quantidade'])
                pm_antigo = float(existente['preco_medio'])
                
                qtd_nova_compra = ativo.quantidade
                preco_novo_compra = ativo.preco

                qtd_total = qtd_antiga + qtd_nova_compra
                
                # Fórmula do Preço Médio Ponderado
                novo_pm = ((qtd_antiga * pm_antigo) + (qtd_nova_compra * preco_novo_compra)) / qtd_total

                sql_update = """
                    UPDATE ativos 
                    SET quantidade = %s, preco_medio = %s, setor = %s 
                    WHERE ticker = %s
                """
                cursor.execute(sql_update, (qtd_total, novo_pm, ativo.setor, ticker_upper))
            else:
                # Insere um novo ativo
                sql_insert = """
                    INSERT INTO ativos (ticker, setor, quantidade, preco_medio)
                    VALUES (%s, %s, %s, %s)
                """
                cursor.execute(sql_insert, (ticker_upper, ativo.setor, ativo.quantidade, ativo.preco))

            connection.commit()
        connection.close()
        return {"mensagem": "Aporte registrado com sucesso!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- ROTAS DE METAS ---

@app.get("/metas")
def listar_metas():
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            sql = "SELECT * FROM metas ORDER BY id DESC"
            cursor.execute(sql)
            metas = cursor.fetchall()
        connection.close()
        return metas
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/metas")
def criar_meta(meta: MetaSchema):
    try:
        data_limite_val = meta.data_limite if meta.data_limite else None
        connection = get_db_connection()
        with connection.cursor() as cursor:
            sql = """
                INSERT INTO metas (titulo, valor_objetivo, valor_atual, data_limite)
                VALUES (%s, %s, %s, %s)
            """
            cursor.execute(sql, (meta.titulo, meta.valor_objetivo, meta.valor_atual, data_limite_val))
            connection.commit()
        connection.close()
        return {"mensagem": "Meta criada com sucesso!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/metas/{meta_id}/aporte")
def aportar_meta(meta_id: int, progresso: ProgressoMetaSchema):
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            sql_update = """
                UPDATE metas 
                SET valor_atual = valor_atual + %s 
                WHERE id = %s
            """
            cursor.execute(sql_update, (progresso.valor_adicional, meta_id))
            connection.commit()
        connection.close()
        return {"mensagem": "Aporte na meta realizado!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    # --- ROTA DE RESUMO PARA A PÁGINA INICIAL (DASHBOARD) ---

@app.get("/resumo-financas")
def obter_resumo_financas():
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            # 1. Somatório de Receitas (ENTRADA)
            sql_receitas = "SELECT COALESCE(SUM(valor), 0) AS total FROM transacoes WHERE tipo = 'ENTRADA'"
            cursor.execute(sql_receitas)
            receitas = cursor.fetchone()['total']

            # 2. Somatório de Gastos em Débito/PIX/Dinheiro (SAIDA)
            sql_debito = """
                SELECT COALESCE(SUM(valor), 0) AS total 
                FROM transacoes 
                WHERE tipo = 'SAIDA' AND meio_pagamento != 'CREDITO'
            """
            cursor.execute(sql_debito)
            gastos_debito = cursor.fetchone()['total']

            # 3. Somatório de Gastos no Cartão de Crédito (SAIDA)
            sql_fatura = """
                SELECT COALESCE(SUM(valor), 0) AS total 
                FROM transacoes 
                WHERE tipo = 'SAIDA' AND meio_pagamento = 'CREDITO'
            """
            cursor.execute(sql_fatura)
            fatura_cartao = cursor.fetchone()['total']

            # 4. Saldo Geral Líquido (Receitas - Todos os Gastos)
            saldo_geral = float(receitas) - (float(gastos_debito) + float(fatura_cartao))

        connection.close()

        return {
            "receitas": float(receitas),
            "gastos_debito": float(gastos_debito),
            "fatura_cartao": float(fatura_cartao),
            "saldo_geral": float(saldo_geral)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    # --- NOVAS ROTAS PARA EDITAR E APAGAR ATIVOS ---

class EditarAtivoSchema(BaseModel):
    setor: str
    quantidade: float
    preco_medio: float

# Rota para Apagar Ativo
@app.delete("/investimentos/{ativo_id}")
def apagar_investimento(ativo_id: int):
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            sql = "DELETE FROM ativos WHERE id = %s"
            cursor.execute(sql, (ativo_id,))
            connection.commit()
        connection.close()
        return {"mensagem": "Ativo removido com sucesso!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Rota para Editar Ativo
@app.put("/investimentos/{ativo_id}")
def editar_investimento(ativo_id: int, ativo: EditarAtivoSchema):
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            sql = """
                UPDATE ativos 
                SET setor = %s, quantidade = %s, preco_medio = %s 
                WHERE id = %s
            """
            cursor.execute(sql, (ativo.setor, ativo.quantidade, ativo.preco_medio, ativo_id))
            connection.commit()
        connection.close()
        return {"mensagem": "Ativo atualizado com sucesso!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    # --- NOVAS ROTAS PARA EDITAR E APAGAR METAS ---

class EditarMetaSchema(BaseModel):
    titulo: str
    valor_objetivo: float
    valor_atual: float
    data_limite: Optional[str] = None

# Rota para Apagar Meta
@app.delete("/metas/{meta_id}")
def apagar_meta(meta_id: int):
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            sql = "DELETE FROM metas WHERE id = %s"
            cursor.execute(sql, (meta_id,))
            connection.commit()
        connection.close()
        return {"mensagem": "Meta removida com sucesso!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Rota para Editar Meta
@app.put("/metas/{meta_id}")
def editar_meta(meta_id: int, meta: EditarMetaSchema):
    try:
        data_limite_val = meta.data_limite if meta.data_limite else None
        connection = get_db_connection()
        with connection.cursor() as cursor:
            sql = """
                UPDATE metas 
                SET titulo = %s, valor_objetivo = %s, valor_atual = %s, data_limite = %s 
                WHERE id = %s
            """
            cursor.execute(sql, (meta.titulo, meta.valor_objetivo, meta.valor_atual, data_limite_val, meta_id))
            connection.commit()
        connection.close()
        return {"mensagem": "Meta atualizada com sucesso!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    # --- ROTA PARA APAGAR UMA TRANSAÇÃO ---

@app.delete("/transacoes/{transacao_id}")
def apagar_transacao(transacao_id: int):
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            sql = "DELETE FROM transacoes WHERE id = %s"
            cursor.execute(sql, (transacao_id,))
            connection.commit()
        connection.close()
        return {"mensagem": "Lançamento apagado com sucesso!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    # --- ROTA PARA O GRÁFICO DE FLUXO MENSAL (ENTRADAS E SAÍDAS) ---

from datetime import datetime
from dateutil.relativedelta import relativedelta

@app.get("/grafico-gastos-mensais")
def obter_gastos_mensais():
    try:
        connection = get_db_connection()
        
        meses_nome = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
        hoje = datetime.now()
        
        labels = []
        saidas = []
        entradas = []

        for i in range(5, -1, -1):
            data_mes = hoje - relativedelta(months=i)
            ano = data_mes.year
            mes = data_mes.month
            nome_rotulo = f"{meses_nome[mes - 1]}/{str(ano)[2:]}"
            labels.append(nome_rotulo)

            with connection.cursor() as cursor:
                # 1. Soma Saídas
                sql_saida = """
                    SELECT COALESCE(SUM(valor), 0) AS total 
                    FROM transacoes 
                    WHERE tipo = 'SAIDA' 
                      AND MONTH(data_transacao) = %s 
                      AND YEAR(data_transacao) = %s
                """
                cursor.execute(sql_saida, (mes, ano))
                res_saida = cursor.fetchone()
                saidas.append(float(res_saida['total']) if res_saida else 0.0)

                # 2. Soma Entradas
                sql_entrada = """
                    SELECT COALESCE(SUM(valor), 0) AS total 
                    FROM transacoes 
                    WHERE tipo = 'ENTRADA' 
                      AND MONTH(data_transacao) = %s 
                      AND YEAR(data_transacao) = %s
                """
                cursor.execute(sql_entrada, (mes, ano))
                res_entrada = cursor.fetchone()
                entradas.append(float(res_entrada['total']) if res_entrada else 0.0)

        connection.close()

        return {
            "labels": labels,
            "saidas": saidas,
            "entradas": entradas
        }
    except Exception as e:
        print("ERRO NO GRÁFICO:", str(e)) # Imprime a falha no terminal do VS Code
        raise HTTPException(status_code=500, detail=str(e))