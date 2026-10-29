from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pymysql
import os
from typing import Optional
from datetime import date, datetime
from dateutil.relativedelta import relativedelta


app = FastAPI(title="API Finanças Pessoais")
@app.get("/")
def home():
    return {"mensagem": "API de Finanças Pessoais está no ar!"}
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db_connection():
    return pymysql.connect(
        host=os.getenv('DB_HOST'),
        user=os.getenv('DB_USER'),
        password=os.getenv('DB_PASSWORD'),
        database=os.getenv('DB_NAME'),
        port=int(os.getenv('DB_PORT', 3306)),
        cursorclass=pymysql.cursors.DictCursor
    )

# --- SCHEMAS (MODELOS DE DADOS) ---

class TransacaoSchema(BaseModel):
    descricao: str
    valor: float
    tipo: str
    meio_pagamento: str
    data_transacao: Optional[str] = None
    parcelas: Optional[int] = 1

class AtivoSchema(BaseModel):
    ticker: str
    setor: str
    quantidade: float
    preco: float
    cor_hex: Optional[str] = "#2d6a4f"

class EditarAtivoSchema(BaseModel):
    setor: str
    quantidade: float
    preco_medio: float
    cor_hex: Optional[str] = "#2d6a4f"

class MetaSchema(BaseModel):
    titulo: str
    valor_objetivo: float
    valor_atual: Optional[float] = 0.0
    data_limite: Optional[str] = None

class EditarMetaSchema(BaseModel):
    titulo: str
    valor_objetivo: float
    valor_atual: float
    data_limite: Optional[str] = None

class ProgressoMetaSchema(BaseModel):
    valor_adicional: float

class CartaoSchema(BaseModel):
    nome: str
    limite: Optional[float] = 0.0
    dia_vencimento: Optional[int] = 10
    dia_fechamento: Optional[int] = 3


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
        data_str = transacao.data_transacao if transacao.data_transacao else date.today().strftime('%Y-%m-%d')
        data_inicial = datetime.strptime(data_str, '%Y-%m-%d')
        
        connection = get_db_connection()
        with connection.cursor() as cursor:
            sql = """
                INSERT INTO transacoes (descricao, valor, tipo, meio_pagamento, data_transacao)
                VALUES (%s, %s, %s, %s, %s)
            """
            
            parcelas = transacao.parcelas if transacao.parcelas and transacao.parcelas > 0 else 1
            valor_parcela = transacao.valor / parcelas

            for i in range(parcelas):
                data_parcela = data_inicial + relativedelta(months=i)
                desc_parcela = f"{transacao.descricao} ({i+1}/{parcelas})" if parcelas > 1 else transacao.descricao
                
                cursor.execute(sql, (
                    desc_parcela,
                    valor_parcela,
                    transacao.tipo,
                    transacao.meio_pagamento,
                    data_parcela.strftime('%Y-%m-%d')
                ))
            
            connection.commit()
        connection.close()
        return {"mensagem": "Transação salva com sucesso!"}
    except Exception as e:
        print("ERRO AO SALVAR TRANSAÇÃO:", str(e))
        raise HTTPException(status_code=500, detail=str(e))

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


# --- DASHBOARD & GRÁFICO ---

@app.get("/resumo-financas")
def obter_resumo_financas():
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            sql_receitas = "SELECT COALESCE(SUM(valor), 0) AS total FROM transacoes WHERE tipo = 'ENTRADA'"
            cursor.execute(sql_receitas)
            receitas = cursor.fetchone()['total']

            sql_debito = """
                SELECT COALESCE(SUM(valor), 0) AS total 
                FROM transacoes 
                WHERE tipo = 'SAIDA' 
                  AND meio_pagamento != 'CREDITO' 
                  AND meio_pagamento NOT LIKE 'Crédito%%' 
                  AND meio_pagamento NOT LIKE 'Cartão%%'
            """
            cursor.execute(sql_debito)
            gastos_debito = cursor.fetchone()['total']

            sql_fatura = """
                SELECT COALESCE(SUM(valor), 0) AS total 
                FROM transacoes 
                WHERE tipo = 'SAIDA' 
                  AND (meio_pagamento = 'CREDITO' OR meio_pagamento LIKE 'Crédito%%' OR meio_pagamento LIKE 'Cartão%%')
            """
            cursor.execute(sql_fatura)
            fatura_cartao = cursor.fetchone()['total']

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
        print("ERRO NO GRÁFICO:", str(e))
        raise HTTPException(status_code=500, detail=str(e))


# --- ROTAS DE INVESTIMENTOS (COM SUPORTE A COR) ---

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
        cor = ativo.cor_hex if ativo.cor_hex else "#2d6a4f"
        connection = get_db_connection()
        
        with connection.cursor() as cursor:
            sql_check = "SELECT * FROM ativos WHERE ticker = %s"
            cursor.execute(sql_check, (ticker_upper,))
            existente = cursor.fetchone()

            if existente:
                qtd_antiga = float(existente['quantidade'])
                pm_antigo = float(existente['preco_medio'])
                qtd_nova_compra = ativo.quantidade
                preco_novo_compra = ativo.preco

                qtd_total = qtd_antiga + qtd_nova_compra
                novo_pm = ((qtd_antiga * pm_antigo) + (qtd_nova_compra * preco_novo_compra)) / qtd_total

                sql_update = """
                    UPDATE ativos 
                    SET quantidade = %s, preco_medio = %s, setor = %s, cor_hex = %s 
                    WHERE ticker = %s
                """
                cursor.execute(sql_update, (qtd_total, novo_pm, ativo.setor, cor, ticker_upper))
            else:
                sql_insert = """
                    INSERT INTO ativos (ticker, setor, quantidade, preco_medio, cor_hex)
                    VALUES (%s, %s, %s, %s, %s)
                """
                cursor.execute(sql_insert, (ticker_upper, ativo.setor, ativo.quantidade, ativo.preco, cor))

            connection.commit()
        connection.close()
        return {"mensagem": "Aporte registrado com sucesso!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/investimentos/{ativo_id}")
def editar_investimento(ativo_id: int, ativo: EditarAtivoSchema):
    try:
        cor = ativo.cor_hex if ativo.cor_hex else "#2d6a4f"
        connection = get_db_connection()
        with connection.cursor() as cursor:
            sql = """
                UPDATE ativos 
                SET setor = %s, quantidade = %s, preco_medio = %s, cor_hex = %s 
                WHERE id = %s
            """
            cursor.execute(sql, (ativo.setor, ativo.quantidade, ativo.preco_medio, cor, ativo_id))
            connection.commit()
        connection.close()
        return {"mensagem": "Ativo atualizado com sucesso!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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

@app.get("/investimentos/setores")
def obter_distribuicao_setores():
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            sql = """
                SELECT setor, SUM(quantidade * preco_medio) AS total_setor
                FROM ativos
                GROUP BY setor
                ORDER BY total_setor DESC
            """
            cursor.execute(sql)
            resultados = cursor.fetchall()
        connection.close()

        labels = []
        valores = []

        for row in resultados:
            labels.append(row['setor'] if row['setor'] else 'Outros')
            valores.append(float(row['total_setor']))

        return {
            "labels": labels,
            "valores": valores
        }
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


# --- ROTAS DE CARTÕES DE CRÉDITO ---

def criar_tabela_cartoes():
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS cartoes (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    nome VARCHAR(100) NOT NULL,
                    limite DECIMAL(10, 2) DEFAULT 0.00,
                    dia_vencimento INT DEFAULT 10,
                    dia_fechamento INT DEFAULT 3
                )
            """)
            connection.commit()
        connection.close()
    except Exception as e:
        print("Aviso ao verificar tabela cartoes:", e)

@app.get("/cartoes")
def listar_cartoes():
    criar_tabela_cartoes()
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            mes_atual = datetime.now().month
            ano_atual = datetime.now().year
            
            sql = """
                SELECT c.*,
                       COALESCE((
                           SELECT SUM(valor) FROM transacoes t
                           WHERE t.meio_pagamento = CONCAT('Crédito (', c.nome, ')')
                             AND t.tipo = 'SAIDA'
                             AND MONTH(t.data_transacao) = %s
                             AND YEAR(t.data_transacao) = %s
                       ), 0) AS fatura_atual,
                       COALESCE((
                           SELECT SUM(valor) FROM transacoes t
                           WHERE t.meio_pagamento = CONCAT('Crédito (', c.nome, ')')
                             AND t.tipo = 'SAIDA'
                             AND (YEAR(t.data_transacao) > %s OR (YEAR(t.data_transacao) = %s AND MONTH(t.data_transacao) > %s))
                       ), 0) AS parcelas_futuras
                FROM cartoes c
                ORDER BY c.nome ASC
            """
            cursor.execute(sql, (mes_atual, ano_atual, ano_atual, ano_atual, mes_atual))
            cartoes = cursor.fetchall()
        connection.close()
        return cartoes
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/cartoes")
def criar_cartao(cartao: CartaoSchema):
    criar_tabela_cartoes()
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            sql = """
                INSERT INTO cartoes (nome, limite, dia_vencimento, dia_fechamento)
                VALUES (%s, %s, %s, %s)
            """
            cursor.execute(sql, (
                cartao.nome.strip(),
                cartao.limite if cartao.limite is not None else 0.0,
                cartao.dia_vencimento or 10,
                cartao.dia_fechamento or 3
            ))
            connection.commit()
        connection.close()
        return {"mensagem": "Cartão cadastrado com sucesso!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/cartoes/{cartao_id}")
def apagar_cartao(cartao_id: int):
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            sql = "DELETE FROM cartoes WHERE id = %s"
            cursor.execute(sql, (cartao_id,))
            connection.commit()
        connection.close()
        return {"mensagem": "Cartão removido com sucesso!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))