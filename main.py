from fastapi import FastAPI, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pymysql
import os
import csv
from typing import Optional
from datetime import date, datetime
from dateutil.relativedelta import relativedelta
import io
import re
from datetime import datetime
from fastapi import UploadFile, File, Form, HTTPException


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
@app.get("/cartoes/corrigir-faturas-existentes")
def corrigir_faturas_existentes():
    """
    Atualiza todos os lançamentos de cartão passados para pertencerem ao cartão 'Inter'
    """
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            # 1. Garante que o cartão Inter existe
            cursor.execute("SELECT id FROM cartoes WHERE LOWER(nome) = 'inter'")
            if not cursor.fetchone():
                cursor.execute("INSERT INTO cartoes (nome, limite, dia_vencimento, dia_fechamento) VALUES ('Inter', 5000.00, 10, 3)")

            # 2. Atualiza os lançamentos antigos para 'Crédito (Inter)'
            sql = """
                UPDATE transacoes 
                SET meio_pagamento = 'Crédito (Inter)' 
                WHERE meio_pagamento LIKE 'Crédito%%' 
                   OR meio_pagamento = 'CREDITO'
            """
            cursor.execute(sql)
            afetados = cursor.rowcount
            connection.commit()
        connection.close()
        return {"mensagem": f"{afetados} lançamentos foram vinculados com sucesso ao cartão Inter!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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

# --- ROTAS DE TRANSAÇÕES ---

@app.get("/transacoes")
def listar_transacoes():
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            # Tira o LIMIT 10 para trazer todo o histórico no modal/tabela
            sql = "SELECT * FROM transacoes ORDER BY id DESC"
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
                    transacao.meio_pagamento, # Usa exatamente o cartão escolhido no dropdown
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



# 1. IMPORTAÇÃO DO CSV: ATRIBUI TUDO AUTOMATICAMENTE AO CARTÃO INTER
# 2. IMPORTAR CSV (FORÇA AUTOMATICAMENTE O CARTÃO "INTER")
@app.post("/cartoes/importar-csv")
async def importar_csv_cartao(
    cartao_nome: str = Form(None),
    arquivo: UploadFile = File(...)
):
    try:
        conteudo = await arquivo.read()
        try:
            texto = conteudo.decode('utf-8-sig')
        except UnicodeDecodeError:
            texto = conteudo.decode('latin-1')

        buffer = io.StringIO(texto)
        leitor_csv = csv.reader(buffer, delimiter=',')
        cabecalho = next(leitor_csv, None)

        connection = get_db_connection()
        total_importados = 0
        
        NOME_CARTAO_FIXO = "Inter"
        meio_pagamento_fixo = f"Crédito ({NOME_CARTAO_FIXO})"

        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM cartoes WHERE LOWER(nome) = 'inter'")
            cartao = cursor.fetchone()
            if not cartao:
                cursor.execute(
                    "INSERT INTO cartoes (nome, limite, dia_vencimento, dia_fechamento) VALUES ('Inter', 5000.00, 1, 25)"
                )
            else:
                cursor.execute("UPDATE cartoes SET dia_fechamento = 25 WHERE id = %s", (cartao['id'],))

            sql_insert = """
                INSERT INTO transacoes (descricao, valor, tipo, meio_pagamento, data_transacao)
                VALUES (%s, %s, 'SAIDA', %s, %s)
            """
            
            for linha in leitor_csv:
                if not linha or len(linha) < 5:
                    continue
                
                raw_data = linha[0].strip()
                desc_item = linha[1].strip()
                tipo_item = linha[3].strip()
                raw_valor = linha[4].strip()

                if "pagamento" in tipo_item.lower() or "pagamento" in desc_item.lower():
                    continue

                valor_limpo = re.sub(r'[^\d,-]', '', raw_valor).replace(',', '.')
                try:
                    valor_item = float(valor_limpo)
                except ValueError:
                    continue

                try:
                    data_formatada = datetime.strptime(raw_data, '%d/%m/%Y').strftime('%Y-%m-%d')
                except ValueError:
                    data_formatada = datetime.now().strftime('%Y-%m-%d')

                if valor_item > 0:
                    cursor.execute(sql_insert, (desc_item, valor_item, meio_pagamento_fixo, data_formatada))
                    total_importados += 1

            connection.commit()
        connection.close()
        
        return {"mensagem": f"{total_importados} lançamentos importados e atribuídos com sucesso ao cartão Inter!"}
    
    except Exception as e:
        print("ERRO AO IMPORTAR CSV:", str(e))
        raise HTTPException(status_code=500, detail=f"Erro ao processar fatura CSV: {str(e)}")


# 2. ROTA DE LISTAGEM COM CÁLCULO BASEADO NO FECHAMENTO (DIA 24)
# ROTA DE LISTAGEM COM CÁLCULO ESPECÍFICO POR CARTÃO (BTG, INTER, ETC.)
@app.get("/cartoes")
def listar_cartoes():
    criar_tabela_cartoes()
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            cursor.execute("SELECT * FROM cartoes ORDER BY nome ASC")
            cartoes = cursor.fetchall()
            
            hoje = datetime.now().date()

            for c in cartoes:
                nome_cartao = c['nome']
                dia_fechamento = c.get('dia_fechamento') or 25

                # Define a data de corte baseada no dia do fechamento do cartão
                try:
                    data_fechamento_mes_atual = date(hoje.year, hoje.month, dia_fechamento)
                except ValueError:
                    data_fechamento_mes_atual = date(hoje.year, hoje.month, 28)

                if hoje > data_fechamento_mes_atual:
                    proximo_mes = hoje + relativedelta(months=1)
                    data_fechamento_ciclo = date(proximo_mes.year, proximo_mes.month, dia_fechamento)
                    data_inicio_ciclo = data_fechamento_mes_atual + relativedelta(days=1)
                else:
                    mes_passado = hoje - relativedelta(months=1)
                    data_inicio_ciclo = date(mes_passado.year, mes_passado.month, dia_fechamento) + relativedelta(days=1)
                    data_fechamento_ciclo = data_fechamento_mes_atual

                meio_pag = f"Crédito ({nome_cartao})"

                # Fatura Atual: Busca APENAS as transações do próprio cartão
                sql_fatura_atual = """
                    SELECT COALESCE(SUM(valor), 0) AS total 
                    FROM transacoes 
                    WHERE meio_pagamento = %s
                      AND tipo = 'SAIDA'
                      AND data_transacao >= %s 
                      AND data_transacao <= %s
                """
                cursor.execute(sql_fatura_atual, (meio_pag, data_inicio_ciclo, data_fechamento_ciclo))
                res_atual = cursor.fetchone()
                c['fatura_atual'] = float(res_atual['total']) if res_atual else 0.0

                # Compras Futuras: Busca APENAS as transações do próprio cartão
                sql_futuras = """
                    SELECT COALESCE(SUM(valor), 0) AS total 
                    FROM transacoes 
                    WHERE meio_pagamento = %s
                      AND tipo = 'SAIDA'
                      AND data_transacao > %s
                """
                cursor.execute(sql_futuras, (meio_pag, data_fechamento_ciclo))
                res_futuras = cursor.fetchone()
                c['parcelas_futuras'] = float(res_futuras['total']) if res_futuras else 0.0

        connection.close()
        return cartoes
    except Exception as e:
        print("ERRO EM LISTAR CARTOES:", str(e))
        raise HTTPException(status_code=500, detail=str(e))

# 3. ROTA PARA RE-VINCULAR TRANSAÇÕES ANTIGAS AO CARTÃO INTER

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