import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SQLite from 'expo-sqlite';
import {
  Banco,
  createTableTarefas,
  insertTarefa,
  selectTarefasPaginado,
  countTarefas,
  toggleConcluidaTarefa,
  updateTarefa,
  deleteTarefa,
  Tarefa,
  Prioridade,
  Categoria,
  StatusFiltro,
  FiltrosTarefas,
} from './Banco/Config';

const ITENS_POR_PAGINA = 5;
const CATEGORIAS: Categoria[] = ['Estudos', 'Casa', 'Pessoal', 'Trabalho'];
const PRIORIDADES: Prioridade[] = ['Alta', 'Média', 'Baixa'];
const STATUS_OPCOES: StatusFiltro[] = ['Todas', 'Pendentes', 'Concluídas'];

export default function App() {
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [totalTarefas, setTotalTarefas] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(true);

  // Estados dos Filtros
  const [filtroStatus, setFiltroStatus] = useState<StatusFiltro>('Todas');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('Todas');
  const [filtroPrioridade, setFiltroPrioridade] = useState<string>('Todas');
  const [buscaTexto, setBuscaTexto] = useState<string>('');
  const [mostrarFiltrosAvancados, setMostrarFiltrosAvancados] = useState(false);

  // Estados do Modal e Formulário
  const [modalVisivel, setModalVisivel] = useState(false);
  const [tarefaEditando, setTarefaEditando] = useState<Tarefa | null>(null);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [categoria, setCategoria] = useState<Categoria>('Estudos');
  const [prioridade, setPrioridade] = useState<Prioridade>('Média');

  // Inicializa a conexão e cria a tabela
  useEffect(() => {
    async function inicializar() {
      try {
        const database = await Banco();
        await createTableTarefas(database);
        setDb(database);
      } catch (error) {
        Alert.alert('Erro', 'Não foi possível inicializar o banco de dados.');
        console.error(error);
      }
    }
    inicializar();
  }, []);

  // Busca tarefas com suporte total a paginação e filtros
  const carregarTarefas = useCallback(
    async (
      database?: SQLite.SQLiteDatabase | null,
      paginaDesejada?: number,
      filtrosDesejados?: FiltrosTarefas
    ) => {
      const activeDb = database || db;
      if (!activeDb) return;

      try {
        setCarregando(true);

        // Se filtros não forem passados explicitamente, usa os do estado
        const filtros: FiltrosTarefas = filtrosDesejados || {
          status: filtroStatus,
          categoria: filtroCategoria,
          prioridade: filtroPrioridade,
          busca: buscaTexto,
        };

        const total = await countTarefas(activeDb, filtros);
        setTotalTarefas(total);

        const totalPaginas = Math.ceil(total / ITENS_POR_PAGINA) || 1;
        const paginaAlvo = Math.min(
          Math.max(1, paginaDesejada ?? pagina),
          totalPaginas
        );

        const offset = (paginaAlvo - 1) * ITENS_POR_PAGINA;
        const lista = await selectTarefasPaginado(
          activeDb,
          ITENS_POR_PAGINA,
          offset,
          filtros
        );

        setTarefas(lista);
        setPagina(paginaAlvo);
      } catch (error) {
        console.error('Erro ao buscar tarefas:', error);
        Alert.alert('Erro', 'Falha ao buscar as tarefas.');
      } finally {
        setCarregando(false);
      }
    },
    [db, pagina, filtroStatus, filtroCategoria, filtroPrioridade, buscaTexto]
  );

  // Recarrega sempre que qualquer filtro mudar, voltando sempre para a Página 1
  useEffect(() => {
    if (db) {
      const filtros: FiltrosTarefas = {
        status: filtroStatus,
        categoria: filtroCategoria,
        prioridade: filtroPrioridade,
        busca: buscaTexto,
      };
      setPagina(1);
      carregarTarefas(db, 1, filtros);
    }
  }, [db, filtroStatus, filtroCategoria, filtroPrioridade, buscaTexto]);

  // Navega para uma página específica
  const mudarPagina = (novaPagina: number) => {
    if (novaPagina === pagina) return;
    carregarTarefas(db, novaPagina);
  };

  // UPDATE Rápido: Alternar concluída/pendente
  const alternarConcluida = async (item: Tarefa) => {
    if (!db) return;
    try {
      const novoStatus = item.concluida === 1 ? 0 : 1;
      await toggleConcluidaTarefa(db, item.id, novoStatus);
      await carregarTarefas(db, pagina);
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível alterar o status da tarefa.');
    }
  };

  // Abrir Modal para Cadastro
  const abrirModalCadastro = () => {
    setTarefaEditando(null);
    setTitulo('');
    setDescricao('');
    setCategoria('Estudos');
    setPrioridade('Média');
    setModalVisivel(true);
  };

  // Abrir Modal para Edição (UPDATE Completo)
  const abrirModalEdicao = (item: Tarefa) => {
    setTarefaEditando(item);
    setTitulo(item.titulo);
    setDescricao(item.descricao || '');
    setCategoria(
      CATEGORIAS.includes(item.categoria as Categoria)
        ? (item.categoria as Categoria)
        : 'Estudos'
    );
    setPrioridade(
      PRIORIDADES.includes(item.prioridade as Prioridade)
        ? (item.prioridade as Prioridade)
        : 'Média'
    );
    setModalVisivel(true);
  };

  // Salvar (CREATE ou UPDATE Completo)
  const salvarTarefa = async () => {
    if (!db) return;
    if (!titulo.trim()) {
      Alert.alert('Atenção', 'Informe um título para a tarefa.');
      return;
    }

    try {
      if (tarefaEditando) {
        // UPDATE
        await updateTarefa(db, tarefaEditando.id, {
          titulo,
          descricao,
          categoria,
          prioridade,
        });
        Alert.alert('Sucesso', 'Tarefa atualizada com sucesso!');
        setModalVisivel(false);
        await carregarTarefas(db, pagina);
      } else {
        // CREATE
        await insertTarefa(db, {
          titulo,
          descricao,
          categoria,
          prioridade,
        });
        Alert.alert('Sucesso', 'Tarefa cadastrada com sucesso!');
        setModalVisivel(false);
        // Volta para a página 1 para visualizar a nova tarefa inserida
        setPagina(1);
        await carregarTarefas(db, 1);
      }
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível salvar a tarefa.');
    }
  };

  // DELETE com confirmação de segurança
  const confirmarExclusao = (item: Tarefa) => {
    Alert.alert(
      'Excluir Tarefa',
      `Deseja realmente excluir a tarefa "${item.titulo}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            if (!db) return;
            try {
              await deleteTarefa(db, item.id);
              // Se esta for a única tarefa da página atual (e não estivermos na pág 1), recua
              const novaPagina = tarefas.length === 1 && pagina > 1 ? pagina - 1 : pagina;
              await carregarTarefas(db, novaPagina);
            } catch (error) {
              Alert.alert('Erro', 'Não foi possível excluir a tarefa.');
            }
          },
        },
      ]
    );
  };

  // Limpar todos os filtros de uma vez
  const limparFiltros = () => {
    setFiltroStatus('Todas');
    setFiltroCategoria('Todas');
    setFiltroPrioridade('Todas');
    setBuscaTexto('');
  };

  const temFiltroAtivo =
    filtroStatus !== 'Todas' ||
    filtroCategoria !== 'Todas' ||
    filtroPrioridade !== 'Todas' ||
    buscaTexto.trim().length > 0;



  const totalPaginas = Math.ceil(totalTarefas / ITENS_POR_PAGINA) || 1;

  // Cores de destaque por prioridade
  const getPrioridadeCor = (p: Prioridade) => {
    switch (p) {
      case 'Alta':
        return { texto: '#DC2626', fundo: '#FEE2E2', borda: '#FCA5A5' };
      case 'Média':
        return { texto: '#D97706', fundo: '#FEF3C7', borda: '#FCD34D' };
      case 'Baixa':
        return { texto: '#059669', fundo: '#D1FAE5', borda: '#6EE7B7' };
    }
  };

  // Cores de tag por categoria
  const getCategoriaCor = (cat: string) => {
    switch (cat) {
      case 'Estudos':
        return '#6366F1';
      case 'Casa':
        return '#8B5CF6';
      case 'Pessoal':
        return '#EC4899';
      case 'Trabalho':
        return '#0284C7';
      default:
        return '#6B7280';
    }
  };

  const renderItem = ({ item }: { item: Tarefa }) => {
    const isConcluida = item.concluida === 1;
    const prioCor = getPrioridadeCor(item.prioridade);
    const catCor = getCategoriaCor(item.categoria);

    return (
      <View style={[styles.card, isConcluida && styles.cardConcluido]}>
        {/* CHECKBOX / UPDATE RÁPIDO */}
        <TouchableOpacity
          style={[styles.checkbox, isConcluida && styles.checkboxMarcado]}
          onPress={() => alternarConcluida(item)}
          activeOpacity={0.7}
        >
          {isConcluida && <Text style={styles.checkIcon}>✓</Text>}
        </TouchableOpacity>

        {/* DETALHES DA TAREFA */}
        <View style={styles.conteudoCard}>
          <Text
            style={[styles.tituloTarefa, isConcluida && styles.textoRiscado]}
            numberOfLines={2}
          >
            {item.titulo}
          </Text>

          {Boolean(item.descricao) && (
            <Text
              style={[styles.descricaoTarefa, isConcluida && styles.textoRiscado]}
              numberOfLines={2}
            >
              {item.descricao}
            </Text>
          )}

          {/* TAGS (CATEGORIA E PRIORIDADE) */}
          <View style={styles.tagsContainer}>
            <View style={[styles.tagCategoria, { backgroundColor: catCor + '20' }]}>
              <Text style={[styles.textoTagCategoria, { color: catCor }]}>
                {item.categoria}
              </Text>
            </View>

            <View style={[styles.tagPrioridade, { backgroundColor: prioCor.fundo }]}>
              <View style={[styles.pontoPrioridade, { backgroundColor: prioCor.texto }]} />
              <Text style={[styles.textoTagPrioridade, { color: prioCor.texto }]}>
                {item.prioridade}
              </Text>
            </View>
          </View>
        </View>

        {/* AÇÕES: EDITAR E EXCLUIR */}
        <View style={styles.acoesCard}>
          <TouchableOpacity
            style={styles.btnEditar}
            onPress={() => abrirModalEdicao(item)}
            activeOpacity={0.7}
          >
            <Text style={styles.textoBtnEditar}>✎</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.btnExcluir}
            onPress={() => confirmarExclusao(item)}
            activeOpacity={0.7}
          >
            <Text style={styles.textoBtnExcluir}>🗑</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {/* CABEÇALHO */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitulo}>Lembretes & Tarefas</Text>
          <Text style={styles.headerSubtitulo}>
            {totalTarefas} {totalTarefas === 1 ? 'tarefa encontrada' : 'tarefas encontradas'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.btnNovaTarefa}
          onPress={abrirModalCadastro}
          activeOpacity={0.8}
        >
          <Text style={styles.textoBtnNovaTarefa}>+ Nova</Text>
        </TouchableOpacity>
      </View>

      {/* ÁREA DE BUSCA & FILTROS COM SELETORES */}
      <View style={styles.secaoFiltros}>
        {/* BARRA DE PESQUISA */}
        <View style={styles.barraBuscaContainer}>
          <Text style={styles.iconeBusca}>🔍</Text>
          <TextInput
            style={styles.inputBusca}
            placeholder="Pesquisar por título ou descrição..."
            placeholderTextColor="#9CA3AF"
            value={buscaTexto}
            onChangeText={setBuscaTexto}
          />
          {buscaTexto.length > 0 && (
            <TouchableOpacity onPress={() => setBuscaTexto('')}>
              <Text style={styles.iconeLimparBusca}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* SELETOR 1: STATUS (TODAS, PENDENTES, CONCLUÍDAS) */}
        <View style={styles.seletorSegmentado}>
          {STATUS_OPCOES.map((status) => {
            const ativo = filtroStatus === status;
            return (
              <TouchableOpacity
                key={status}
                style={[styles.btnSegmento, ativo && styles.btnSegmentoAtivo]}
                onPress={() => setFiltroStatus(status)}
              >
                <Text
                  style={[
                    styles.textoSegmento,
                    ativo && styles.textoSegmentoAtivo,
                  ]}
                >
                  {status}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* BOTÃO PARA ALTERNAR FILTROS AVANÇADOS (CATEGORIA E PRIORIDADE) */}
        <View style={styles.linhaFiltrosExtras}>
          <TouchableOpacity
            style={styles.btnAlternarFiltros}
            onPress={() => setMostrarFiltrosAvancados(!mostrarFiltrosAvancados)}
          >
            <Text style={styles.textoBtnAlternarFiltros}>
              {mostrarFiltrosAvancados ? '▲ Ocultar Seletores' : '▼ Seletores (Categoria & Prioridade)'}
            </Text>
          </TouchableOpacity>

          {temFiltroAtivo && (
            <TouchableOpacity onPress={limparFiltros} style={styles.btnLimparFiltros}>
              <Text style={styles.textoLimparFiltros}>✕ Limpar Filtros</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* SELETORES EXPANSÍVEIS (CATEGORIA & PRIORIDADE) */}
        {mostrarFiltrosAvancados && (
          <View style={styles.filtrosAvancadosContainer}>
            {/* SELETOR 2: CATEGORIA */}
            <Text style={styles.tituloSeletor}>Filtrar por Categoria:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollFiltros}>
              <TouchableOpacity
                style={[
                  styles.filtroChip,
                  filtroCategoria === 'Todas' && styles.filtroChipAtivo,
                ]}
                onPress={() => setFiltroCategoria('Todas')}
              >
                <Text
                  style={[
                    styles.textoFiltroChip,
                    filtroCategoria === 'Todas' && styles.textoFiltroChipAtivo,
                  ]}
                >
                  Todas
                </Text>
              </TouchableOpacity>

              {CATEGORIAS.map((cat) => {
                const ativo = filtroCategoria === cat;
                const cor = getCategoriaCor(cat);
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.filtroChip,
                      ativo && { backgroundColor: cor, borderColor: cor },
                    ]}
                    onPress={() => setFiltroCategoria(cat)}
                  >
                    <Text
                      style={[
                        styles.textoFiltroChip,
                        ativo && styles.textoFiltroChipAtivo,
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* SELETOR 3: PRIORIDADE */}
            <Text style={styles.tituloSeletor}>Filtrar por Prioridade:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollFiltros}>
              <TouchableOpacity
                style={[
                  styles.filtroChip,
                  filtroPrioridade === 'Todas' && styles.filtroChipAtivo,
                ]}
                onPress={() => setFiltroPrioridade('Todas')}
              >
                <Text
                  style={[
                    styles.textoFiltroChip,
                    filtroPrioridade === 'Todas' && styles.textoFiltroChipAtivo,
                  ]}
                >
                  Todas
                </Text>
              </TouchableOpacity>

              {PRIORIDADES.map((prio) => {
                const ativo = filtroPrioridade === prio;
                const cor = getPrioridadeCor(prio);
                return (
                  <TouchableOpacity
                    key={prio}
                    style={[
                      styles.filtroChip,
                      ativo && {
                        backgroundColor: cor.fundo,
                        borderColor: cor.texto,
                      },
                    ]}
                    onPress={() => setFiltroPrioridade(prio)}
                  >
                    <View
                      style={[
                        styles.pontoPrioridade,
                        { backgroundColor: cor.texto },
                      ]}
                    />
                    <Text
                      style={[
                        styles.textoFiltroChip,
                        ativo && { color: cor.texto, fontWeight: '700' },
                      ]}
                    >
                      {prio}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>

      {/* LISTAGEM OU ESTADO VAZIO */}
      {carregando ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingText}>Carregando tarefas...</Text>
        </View>
      ) : (
        <FlatList
          data={tarefas}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.lista}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>
                {temFiltroAtivo ? '🔍' : '📋'}
              </Text>
              <Text style={styles.emptyTitulo}>
                {temFiltroAtivo ? 'Nenhuma tarefa encontrada' : 'Nenhuma tarefa cadastrada'}
              </Text>
              <Text style={styles.emptySubtitulo}>
                {temFiltroAtivo
                  ? 'Tente ajustar ou limpar os filtros para encontrar tarefas.'
                  : 'Crie sua primeira tarefa ou gere exemplos para testar o SQLite.'}
              </Text>

              <View style={styles.emptyBotoes}>
                {temFiltroAtivo ? (
                  <TouchableOpacity
                    style={styles.btnAdicionarVazio}
                    onPress={limparFiltros}
                  >
                    <Text style={styles.btnAdicionarVazioTexto}>Limpar Filtros</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    
                  </>
                )}
              </View>
            </View>
          }
        />
      )}

      {/* BARRA DE PAGINAÇÃO NAVEGÁVEL */}
      {totalTarefas > 0 && (
        <View style={styles.paginacaoContainer}>
          <TouchableOpacity
            style={[styles.btnPaginacao, pagina <= 1 && styles.btnPaginacaoDesabilitado]}
            disabled={pagina <= 1}
            onPress={() => mudarPagina(pagina - 1)}
          >
            <Text
              style={[
                styles.textoBtnPaginacao,
                pagina <= 1 && styles.textoBtnDesabilitado,
              ]}
            >
              ◀ Anterior
            </Text>
          </TouchableOpacity>

          <View style={styles.infoPagina}>
            <Text style={styles.textoInfoPagina}>
              Página {pagina} de {totalPaginas}
            </Text>
            <Text style={styles.textoInfoItens}>
              {totalTarefas} {totalTarefas === 1 ? 'item filtrado' : 'itens filtrados'}
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.btnPaginacao,
              pagina >= totalPaginas && styles.btnPaginacaoDesabilitado,
            ]}
            disabled={pagina >= totalPaginas}
            onPress={() => mudarPagina(pagina + 1)}
          >
            <Text
              style={[
                styles.textoBtnPaginacao,
                pagina >= totalPaginas && styles.textoBtnDesabilitado,
              ]}
            >
              Próxima ▶
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* MODAL DE CADASTRO / EDIÇÃO */}
      <Modal
        visible={modalVisivel}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisivel(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitulo}>
                {tarefaEditando ? 'Editar Tarefa' : 'Nova Tarefa'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisivel(false)}>
                <Text style={styles.modalFechar}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* CAMPO TÍTULO */}
              <Text style={styles.label}>Título *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: Entregar trabalho de SQLite"
                placeholderTextColor="#9CA3AF"
                value={titulo}
                onChangeText={setTitulo}
              />

              {/* CAMPO DESCRIÇÃO */}
              <Text style={styles.label}>Descrição (opcional)</Text>
              <TextInput
                style={[styles.input, styles.inputDescricao]}
                placeholder="Detalhes ou lembretes adicionais..."
                placeholderTextColor="#9CA3AF"
                value={descricao}
                onChangeText={setDescricao}
                multiline
                numberOfLines={3}
              />

              {/* SELEÇÃO DE CATEGORIA */}
              <Text style={styles.label}>Categoria</Text>
              <View style={styles.opcoesContainer}>
                {CATEGORIAS.map((cat) => {
                  const selecionada = categoria === cat;
                  const cor = getCategoriaCor(cat);
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.chipOpcao,
                        selecionada && { backgroundColor: cor, borderColor: cor },
                      ]}
                      onPress={() => setCategoria(cat)}
                    >
                      <Text
                        style={[
                          styles.textoChipOpcao,
                          selecionada && styles.textoChipOpcaoAtivo,
                        ]}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* SELEÇÃO DE PRIORIDADE */}
              <Text style={styles.label}>Prioridade</Text>
              <View style={styles.opcoesContainer}>
                {PRIORIDADES.map((prio) => {
                  const selecionada = prioridade === prio;
                  const cor = getPrioridadeCor(prio);
                  return (
                    <TouchableOpacity
                      key={prio}
                      style={[
                        styles.chipOpcao,
                        selecionada && {
                          backgroundColor: cor.fundo,
                          borderColor: cor.texto,
                        },
                      ]}
                      onPress={() => setPrioridade(prio)}
                    >
                      <View
                        style={[
                          styles.pontoPrioridade,
                          { backgroundColor: cor.texto },
                        ]}
                      />
                      <Text
                        style={[
                          styles.textoChipOpcao,
                          selecionada && { color: cor.texto, fontWeight: '700' },
                        ]}
                      >
                        {prio}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* BOTÕES DO FORMULÁRIO */}
              <View style={styles.modalBotoes}>
                <TouchableOpacity
                  style={styles.btnCancelar}
                  onPress={() => setModalVisivel(false)}
                >
                  <Text style={styles.textoBtnCancelar}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.btnSalvar} onPress={salvarTarefa}>
                  <Text style={styles.textoBtnSalvar}>
                    {tarefaEditando ? 'Salvar Alterações' : 'Cadastrar'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 45 : 15,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitulo: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  headerSubtitulo: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  btnNovaTarefa: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: '#4F46E5',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 3,
  },
  textoBtnNovaTarefa: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  secaoFiltros: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  barraBuscaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 10,
  },
  iconeBusca: {
    fontSize: 14,
    marginRight: 8,
  },
  inputBusca: {
    flex: 1,
    fontSize: 14,
    color: '#1F2937',
  },
  iconeLimparBusca: {
    fontSize: 14,
    color: '#9CA3AF',
    padding: 4,
    fontWeight: 'bold',
  },
  seletorSegmentado: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 3,
    marginBottom: 8,
  },
  btnSegmento: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 6,
  },
  btnSegmentoAtivo: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  textoSegmento: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  textoSegmentoAtivo: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  linhaFiltrosExtras: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  btnAlternarFiltros: {
    paddingVertical: 4,
  },
  textoBtnAlternarFiltros: {
    fontSize: 12,
    color: '#4F46E5',
    fontWeight: '700',
  },
  btnLimparFiltros: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  textoLimparFiltros: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '700',
  },
  filtrosAvancadosContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  tituloSeletor: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
    marginBottom: 6,
    marginTop: 4,
  },
  scrollFiltros: {
    marginBottom: 6,
  },
  filtroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 8,
  },
  filtroChipAtivo: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  textoFiltroChip: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  textoFiltroChipAtivo: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  lista: {
    padding: 16,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  cardConcluido: {
    backgroundColor: '#F9FAFB',
    opacity: 0.8,
    borderColor: '#E5E7EB',
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  checkboxMarcado: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  checkIcon: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  conteudoCard: {
    flex: 1,
    marginRight: 8,
  },
  tituloTarefa: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  descricaoTarefa: {
    fontSize: 13,
    color: '#4B5563',
    marginBottom: 8,
    lineHeight: 18,
  },
  textoRiscado: {
    textDecorationLine: 'line-through',
    color: '#9CA3AF',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  tagCategoria: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  textoTagCategoria: {
    fontSize: 11,
    fontWeight: '700',
  },
  tagPrioridade: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pontoPrioridade: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  textoTagPrioridade: {
    fontSize: 11,
    fontWeight: '700',
  },
  acoesCard: {
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 8,
    marginLeft: 4,
  },
  btnEditar: {
    backgroundColor: '#EEF2FF',
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoBtnEditar: {
    color: '#4F46E5',
    fontSize: 16,
    fontWeight: 'bold',
  },
  btnExcluir: {
    backgroundColor: '#FEE2E2',
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoBtnExcluir: {
    color: '#EF4444',
    fontSize: 14,
  },
  paginacaoContainer: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  btnPaginacao: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
  },
  btnPaginacaoDesabilitado: {
    backgroundColor: '#F3F4F6',
  },
  textoBtnPaginacao: {
    color: '#4F46E5',
    fontWeight: '700',
    fontSize: 13,
  },
  textoBtnDesabilitado: {
    color: '#9CA3AF',
  },
  infoPagina: {
    alignItems: 'center',
  },
  textoInfoPagina: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  textoInfoItens: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#6B7280',
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitulo: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 6,
  },
  emptySubtitulo: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 19,
  },
  emptyBotoes: {
    flexDirection: 'column',
    gap: 10,
    width: '100%',
    maxWidth: 240,
  },
  btnAdicionarVazio: {
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnAdicionarVazioTexto: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  btnExemplos: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnExemplosTexto: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 22,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  modalTitulo: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  modalFechar: {
    fontSize: 20,
    color: '#9CA3AF',
    fontWeight: 'bold',
    padding: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
  },
  inputDescricao: {
    height: 72,
    textAlignVertical: 'top',
  },
  opcoesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  chipOpcao: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  textoChipOpcao: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '600',
  },
  textoChipOpcaoAtivo: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  modalBotoes: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
    marginBottom: 15,
  },
  btnCancelar: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  textoBtnCancelar: {
    color: '#4B5563',
    fontWeight: '700',
    fontSize: 14,
  },
  btnSalvar: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
  },
  textoBtnSalvar: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
