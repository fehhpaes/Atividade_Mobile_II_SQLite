import * as SQLite from 'expo-sqlite';

export type Prioridade = 'Alta' | 'Média' | 'Baixa';
export type Categoria = 'Estudos' | 'Casa' | 'Pessoal' | 'Trabalho';
export type StatusFiltro = 'Todas' | 'Pendentes' | 'Concluídas';

export interface Tarefa {
  id: number;
  titulo: string;
  descricao: string;
  categoria: string;
  prioridade: Prioridade;
  concluida: number; // 0 = pendente, 1 = concluída
}

export interface DadosTarefa {
  titulo: string;
  descricao?: string;
  categoria: string;
  prioridade: Prioridade;
  concluida?: number;
}

export interface FiltrosTarefas {
  categoria?: string;
  prioridade?: string;
  status?: StatusFiltro;
  busca?: string;
}

// Fila de execução sequencial (Mutex) para evitar concorrência nativa no Android
// Isso previne o erro NullPointerException em NativeDatabase.prepareAsync
let filaBanco: Promise<any> = Promise.resolve();

export function executarNoBanco<T>(operacao: () => Promise<T>): Promise<T> {
  const proxima = filaBanco.then(operacao, operacao);
  filaBanco = proxima.catch(() => {});
  return proxima;
}

// Abre ou cria o banco de dados local (Singleton)
let instanciaDb: SQLite.SQLiteDatabase | null = null;

export async function Banco(): Promise<SQLite.SQLiteDatabase> {
  return executarNoBanco(async () => {
    if (instanciaDb) {
      return instanciaDb;
    }
    try {
      const db = await SQLite.openDatabaseAsync('DDM2.db');
      await db.execAsync('PRAGMA journal_mode = WAL;');
      instanciaDb = db;
      return db;
    } catch (error) {
      console.error('Erro ao abrir banco de dados:', error);
      throw error;
    }
  });
}

// Criação da tabela de tarefas
export async function createTableTarefas(db: SQLite.SQLiteDatabase): Promise<void> {
  return executarNoBanco(async () => {
    try {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS tarefas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          titulo TEXT NOT NULL,
          descricao TEXT,
          categoria TEXT,
          prioridade TEXT,
          concluida INTEGER DEFAULT 0
        );
      `);
      console.log('Tabela "tarefas" pronta para uso.');
    } catch (error) {
      console.error('Erro ao criar tabela tarefas:', error);
      throw error;
    }
  });
}

// Função auxiliar para construir cláusulas WHERE dinâmicas e seguras
function construirQueryFiltros(filtros?: FiltrosTarefas): {
  whereClause: string;
  params: (string | number)[];
} {
  const condicoes: string[] = [];
  const params: (string | number)[] = [];

  if (filtros) {
    // Filtro por Categoria
    if (filtros.categoria && filtros.categoria !== 'Todas') {
      condicoes.push('categoria = ?');
      params.push(filtros.categoria);
    }

    // Filtro por Prioridade
    if (filtros.prioridade && filtros.prioridade !== 'Todas') {
      condicoes.push('prioridade = ?');
      params.push(filtros.prioridade);
    }

    // Filtro por Status (Pendentes ou Concluídas) com suporte a null-safe
    if (filtros.status === 'Pendentes') {
      condicoes.push('(concluida = 0 OR concluida IS NULL)');
    } else if (filtros.status === 'Concluídas') {
      condicoes.push('concluida = 1');
    }

    // Busca textual no título ou na descrição
    if (filtros.busca && filtros.busca.trim().length > 0) {
      condicoes.push('(titulo LIKE ? OR descricao LIKE ?)');
      const termo = `%${filtros.busca.trim()}%`;
      params.push(termo, termo);
    }
  }

  const whereClause = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';
  return { whereClause, params };
}

// CREATE: Cadastra uma nova tarefa
export async function insertTarefa(
  db: SQLite.SQLiteDatabase,
  dados: DadosTarefa
): Promise<number> {
  return executarNoBanco(async () => {
    try {
      const result = await db.runAsync(
        `INSERT INTO tarefas (titulo, descricao, categoria, prioridade, concluida)
         VALUES (?, ?, ?, ?, 0);`,
        dados.titulo ? dados.titulo.trim() : '',
        dados.descricao ? dados.descricao.trim() : '',
        dados.categoria || 'Geral',
        dados.prioridade || 'Média'
      );
      return result.lastInsertRowId;
    } catch (error) {
      console.error('Erro ao inserir tarefa:', error);
      throw error;
    }
  });
}

// READ + Paginação + Filtros Dinâmicos + Ordenação Inteligente:
export async function selectTarefasPaginado(
  db: SQLite.SQLiteDatabase,
  limit: number = 5,
  offset: number = 0,
  filtros?: FiltrosTarefas
): Promise<Tarefa[]> {
  return executarNoBanco(async () => {
    try {
      const { whereClause, params } = construirQueryFiltros(filtros);
      const query = `
        SELECT * FROM tarefas
        ${whereClause}
        ORDER BY concluida ASC, id DESC
        LIMIT ? OFFSET ?;
      `;

      const todosParams = [...params, Number(limit), Number(offset)];
      const result = await db.getAllAsync<Tarefa>(query, ...todosParams);
      return result;
    } catch (error) {
      console.error('Erro ao buscar tarefas paginadas:', error);
      throw error;
    }
  });
}

// Conta o total de registros considerando os filtros aplicados
export async function countTarefas(
  db: SQLite.SQLiteDatabase,
  filtros?: FiltrosTarefas
): Promise<number> {
  return executarNoBanco(async () => {
    try {
      const { whereClause, params } = construirQueryFiltros(filtros);
      const query = `SELECT COUNT(*) as total FROM tarefas ${whereClause};`;
      const result = await db.getFirstAsync<{ total: number }>(query, ...params);
      return result?.total ?? 0;
    } catch (error) {
      console.error('Erro ao contar tarefas:', error);
      throw error;
    }
  });
}

// UPDATE Rápido: Alterna status de concluída (0 ou 1)
export async function toggleConcluidaTarefa(
  db: SQLite.SQLiteDatabase,
  id: number,
  concluida: number
): Promise<void> {
  return executarNoBanco(async () => {
    try {
      await db.runAsync(
        'UPDATE tarefas SET concluida = ? WHERE id = ?;',
        Number(concluida),
        Number(id)
      );
    } catch (error) {
      console.error('Erro ao alternar status da tarefa:', error);
      throw error;
    }
  });
}

// UPDATE Completo: Edita todos os dados da tarefa (apenas se pendente)
export async function updateTarefa(
  db: SQLite.SQLiteDatabase,
  id: number,
  dados: DadosTarefa
): Promise<void> {
  return executarNoBanco(async () => {
    try {
      await db.runAsync(
        `UPDATE tarefas
         SET titulo = ?, descricao = ?, categoria = ?, prioridade = ?
         WHERE id = ? AND (concluida = 0 OR concluida IS NULL);`,
        dados.titulo ? dados.titulo.trim() : '',
        dados.descricao ? dados.descricao.trim() : '',
        dados.categoria || 'Geral',
        dados.prioridade || 'Média',
        Number(id)
      );
    } catch (error) {
      console.error('Erro ao atualizar tarefa:', error);
      throw error;
    }
  });
}

// DELETE: Remove uma tarefa pelo ID
export async function deleteTarefa(
  db: SQLite.SQLiteDatabase,
  id: number
): Promise<void> {
  return executarNoBanco(async () => {
    try {
      await db.runAsync('DELETE FROM tarefas WHERE id = ?;', Number(id));
    } catch (error) {
      console.error('Erro ao excluir tarefa:', error);
      throw error;
    }
  });
}

// Utilitário de Debug: Imprime no terminal/console as tabelas e registros existentes
export async function imprimirDadosConsole(
  db: SQLite.SQLiteDatabase,
  acao?: string
): Promise<void> {
  return executarNoBanco(async () => {
    try {
      const tituloLog = acao ? `[SQLite: ${acao}]` : '[SQLite: Dados Atuais]';
      console.log(`\n=================== ${tituloLog} ===================`);

      // 1. Lista todas as tabelas criadas no SQLite
      const tabelas = await db.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';"
      );
      const nomesTabelas = tabelas.map((t) => `"${t.name}"`).join(', ');
      console.log(`📌 Tabelas existentes (${tabelas.length}): ${nomesTabelas || '(nenhuma)'}`);

      // 2. Lista todos os dados da tabela tarefas
      const dados = await db.getAllAsync<Tarefa>('SELECT * FROM tarefas ORDER BY id ASC;');
      console.log(`📋 Total de registros na tabela "tarefas": ${dados.length}`);
      if (dados.length > 0) {
        dados.forEach((item) => {
          const status = item.concluida === 1 ? '[CONCLUÍDA]' : '[PENDENTE] ';
          const desc = item.descricao ? ` | Desc: "${item.descricao}"` : '';
          console.log(
            `   ID ${item.id} | ${status} | [${item.prioridade}] [${item.categoria}] | "${item.titulo}"${desc}`
          );
        });
      } else {
        console.log('   (Nenhum registro cadastrado ainda)');
      }
      console.log('==============================================================\n');
    } catch (error) {
      console.error('Erro ao imprimir dados no console:', error);
    }
  });
}
