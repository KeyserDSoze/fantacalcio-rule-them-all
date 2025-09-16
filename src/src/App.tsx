
import React, { useEffect, useState, useMemo } from 'react';
import './App.css';
import {
  Box,
  Typography,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  Popover,
  List,
  ListItem,
  Alert,
  CircularProgress
} from '@mui/material';
import { updateConfig, getGroup, getAllPlayers, getTeams, getLastYearPlayers } from './services/fantacalcioApi';
import type { StatPlayer, Group } from './services/fantacalcioApi';
import { db } from './firebase';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';

type Player = { [key: string]: string };
type Titolare = { [key: string]: string };
type PlayerStatus = 'mia' | 'altra' | null;

interface LiveAuction {
  id: string;
  currentPlayer?: string;
  currentBid?: number;
  currentBidder?: string;
  status: 'waiting' | 'active' | 'sold' | 'paused';
  timeLeft?: number;
}

function parseCSV(text: string): any[] {
  const [header, ...rows] = text.trim().split(/\r?\n/);
  return rows.map(row => {
    const values = row.split(',');
    const obj: any = {};
    header.split(',').forEach((h, i) => {
      obj[h] = values[i];
    });
    return obj;
  });
}

function App() {
  // Stati per la configurazione del gruppo
  const [groupId, setGroupId] = useState<string>('');
  const [groupData, setGroupData] = useState<Group | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<string>('');
  const [selectedBasket, setSelectedBasket] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [configurationStep, setConfigurationStep] = useState<'group' | 'league' | 'basket' | 'year' | 'team' | 'ready'>('group');
  const [isConfiguring, setIsConfiguring] = useState<boolean>(false);
  const [configLoadedFromStorage, setConfigLoadedFromStorage] = useState<boolean>(false);
  
  // Stati esistenti
  const [players, setPlayers] = useState<Player[]>([]);
  const [titolari, setTitolari] = useState<Titolare[]>([]);
  const [incroci, setIncroci] = useState<any[]>([]);
  const [incrociHeader, setIncrociHeader] = useState<string[]>([]);
  const [tiers, setTiers] = useState<any[]>([]);
  const [infortuni, setInfortuni] = useState<any[]>([]);
  const [lastYearPlayers, setLastYearPlayers] = useState<StatPlayer[]>([]);
  const [search, setSearch] = useState('');
  const [filtered, setFiltered] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Stati per i dati dei team dall'API
  const [apiTeams, setApiTeams] = useState<any[]>([]);
  const [apiTeamsLoading, setApiTeamsLoading] = useState(false);
  const [apiTeamsError, setApiTeamsError] = useState<string | null>(null);
  const [lastApiTeamsUpdate, setLastApiTeamsUpdate] = useState<Date | null>(null);
  const [totalCredits] = useState<number>(1000);
  const [selectedRole, setSelectedRole] = useState<string>('Tutti');
  const [showOnlyFree, setShowOnlyFree] = useState<boolean>(false);
  const [showOnlyTitolari, setShowOnlyTitolari] = useState<boolean>(false);
  const [sortField, setSortField] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [visibleColumns, setVisibleColumns] = useState<{ [key: string]: boolean }>({});
  const [visibleSpecialColumns, setVisibleSpecialColumns] = useState<{ [key: string]: boolean }>({
    Incroci: true,
    Infortuni: true,
    Stato: true,
    AnnoScorso: true
  });
  const [columnMenuAnchor, setColumnMenuAnchor] = useState<HTMLElement | null>(null);

  // Stati per l'asta live
  const [auctionId, setAuctionId] = useState<string>('');
  const [liveAuction, setLiveAuction] = useState<LiveAuction | null>(null);
  const [auctionConnected, setAuctionConnected] = useState<boolean>(false);
  const [auctionError, setAuctionError] = useState<string | null>(null);
  const [previousAuctionPlayer, setPreviousAuctionPlayer] = useState<string | null>(null);
  const [forceUpdate, setForceUpdate] = useState<number>(0); // Per forzare re-render

  // Funzione per caricare i dati dei team dall'API
  const loadApiTeams = async () => {
    if (!groupData || !selectedLeague || !selectedBasket || !selectedYear) {
      console.log('⚠️ Dati di configurazione mancanti per loadApiTeams:', {
        groupData: !!groupData,
        selectedLeague: !!selectedLeague,
        selectedBasket: !!selectedBasket,
        selectedYear: !!selectedYear
      });
      return;
    }

    setApiTeamsLoading(true);
    setApiTeamsError(null);

    try {
      console.log('🔄 Chiamata API getTeams in corso...');
      const teams = await getTeams();
      console.log('📊 Team data loaded:', teams.length, 'teams');
      setApiTeams(teams);
      setLastApiTeamsUpdate(new Date());
      
      // Forza il re-render di tutti i componenti che dipendono da apiTeams
      setForceUpdate(prev => prev + 1);
      console.log('🔄 Force update triggered - UI should refresh now');
      
    } catch (err: any) {
      const errorMsg = `Errore nel caricamento dei team: ${err.message}`;
      setApiTeamsError(errorMsg);
      console.error('❌ Errore loadApiTeams:', err);
    } finally {
      setApiTeamsLoading(false);
    }
  };

  // Funzione per ottenere lo status di un giocatore dai dati API
  const getPlayerStatusFromApi = (player: Player): { status: PlayerStatus; price?: number; teamName?: string } => {
    if (!apiTeams || apiTeams.length === 0) {
      console.log('No API teams data available');
      return { status: null };
    }

    // Debug: mostra la struttura dei dati
    if (apiTeams.length > 0 && !(window as any).debugShown) {
      if (apiTeams[0].players && apiTeams[0].players.length > 0) {
      }
      (window as any).debugShown = true;
    }

    // Cerca il giocatore in tutti i team
    for (const team of apiTeams) {
      if (!team.players || !Array.isArray(team.players)) {
        continue;
      }
      
      const foundPlayer = team.players.find((p: any) => {
        // Prova diversi campi per il nome del giocatore
        const apiPlayerName = p.name || p.playerName || p.Nome || p.nome;
        if (!apiPlayerName) return false;
        
        const match = apiPlayerName.toLowerCase().trim() === player.Nome?.toLowerCase().trim();
        if (match) {
          console.log(`Found match: ${player.Nome} -> ${apiPlayerName} in team ${team.name || team.teamName}`);
        }
        return match;
      });
      
      if (foundPlayer) {
        // Se ho selezionato una squadra e questo è il mio team
        const myTeam = selectedTeam ? apiTeams.find(t => t.owner === selectedTeam) : null;
        const isMyTeam = myTeam && team.owner === selectedTeam;
        
        console.log(`Player ${player.Nome} found in team ${team.name || team.teamName}, isMyTeam: ${isMyTeam}`);
        
        return {
          status: isMyTeam ? 'mia' : 'altra',
          price: foundPlayer.price || foundPlayer.prezzo || 0,
          teamName: team.name || team.teamName
        };
      }
    }

    return { status: null };
  };

  // Funzioni per l'asta live
  const connectToAuction = (auctionIdToConnect: string) => {
    if (!auctionIdToConnect.trim()) {
      setAuctionError('Inserisci un ID asta valido');
      return;
    }

    setAuctionError(null);
    setAuctionConnected(false);

    try {
      // Crea un listener per l'asta su Firestore
      const auctionRef = doc(db, 'aste', auctionIdToConnect.trim());
      
      const unsubscribe: Unsubscribe = onSnapshot(auctionRef, async (docSnapshot) => {
        if (docSnapshot.exists()) {
          const auctionData = docSnapshot.data();
          console.log('🔥 Auction data received:', auctionData);
          
          // Estrai il nome del giocatore in diversi modi possibili
          let currentPlayerName = null;
          if (auctionData.currentPlayer) {
            // Se è un oggetto
            if (typeof auctionData.currentPlayer === 'object') {
              currentPlayerName = auctionData.currentPlayer.nome || 
                                 auctionData.currentPlayer.name || 
                                 auctionData.currentPlayer.playerName ||
                                 JSON.stringify(auctionData.currentPlayer);
            } else {
              // Se è una stringa
              currentPlayerName = auctionData.currentPlayer;
            }
          }
          
          console.log('🎯 Current player name extracted:', currentPlayerName);
          console.log('🔄 Previous player name:', previousAuctionPlayer);
          
          // Controlla se il giocatore è cambiato (anche la prima volta)
          if (currentPlayerName && currentPlayerName !== previousAuctionPlayer) {
            console.log(`� CAMBIO GIOCATORE RILEVATO!`);
            console.log(`   Da: "${previousAuctionPlayer || 'NESSUNO'}"`);
            console.log(`   A:  "${currentPlayerName}"`);
            
            // Aggiorna i dati dei team quando cambia il giocatore
            if (configurationStep !== 'ready') {
              console.log('⚠️ App non ancora pronta per auto-sync, saltando aggiornamento');
            } else {
              console.log('📊 Avvio AUTO-SYNC aggiornamento team...');
              try {
                await loadApiTeams();
                console.log('✅ AUTO-SYNC completato con successo!');
              } catch (error) {
                console.error('❌ Errore nell\'AUTO-SYNC:', error);
              }
            }
            
            // Aggiorna lo stato del giocatore precedente
            setPreviousAuctionPlayer(currentPlayerName);
          } else {
            console.log('ℹ️ Nessun cambio giocatore rilevato');
          }
          
          setLiveAuction({
            id: auctionIdToConnect,
            currentPlayer: auctionData.currentPlayer,
            currentBid: auctionData.currentBid,
            currentBidder: auctionData.currentBidder,
            status: auctionData.status || 'waiting',
            timeLeft: auctionData.timeLeft
          });
          
          setAuctionConnected(true);
          
          // Salva la configurazione con l'ID asta
          if (groupData) {
            saveConfiguration();
          }
        } else {
          setAuctionError('Asta non trovata');
          setAuctionConnected(false);
        }
      }, (error) => {
        console.error('Errore nel collegamento all\'asta:', error);
        setAuctionError(`Errore: ${error.message}`);
        setAuctionConnected(false);
      });

      // Salva la funzione di unsubscribe per pulire quando necessario
      return unsubscribe;
    } catch (error: any) {
      setAuctionError(`Errore nella connessione: ${error.message}`);
      setAuctionConnected(false);
    }
  };

  const disconnectFromAuction = () => {
    setLiveAuction(null);
    setAuctionConnected(false);
    setAuctionError(null);
    setAuctionId('');
    setPreviousAuctionPlayer(null); // Reset del giocatore precedente
    
    // Salva la configurazione senza ID asta
    if (groupData) {
      saveConfiguration();
    }
  };

  // Funzione per ottenere i dati completi del giocatore corrente nell'asta
  const getCurrentAuctionPlayerData = (): { player: Player; auctionData: any } | null => {
    if (!liveAuction?.currentPlayer) return null;
    
    
    // Prova diversi campi per il nome del giocatore nell'asta
    const auctionPlayerName = liveAuction.currentPlayer;
    
    if (!auctionPlayerName) {
      console.error('No player name found in auction data');
      return null;
    }
    
    const player = players.find(p => {
      const playerName = p.Nome?.toLowerCase().trim();
      const searchName = auctionPlayerName.toLowerCase().trim();
      const match = playerName === searchName;
      return match;
    });
    
    if (!player) {
      console.error('Player not found in database. Auction player:', auctionPlayerName);
      return null;
    }


    // Restituisci sia i dati del giocatore che quelli dell'asta separatamente
    return {
      player,
      auctionData: {
        currentBid: liveAuction.currentBid,
        currentBidder: liveAuction.currentBidder,
        auctionStatus: liveAuction.status,
        timeLeft: liveAuction.timeLeft
      }
    };
  };

  // Funzione per verificare se un giocatore appartiene alla squadra selezionata
  const isPlayerInMyTeam = (player: Player) => {
    if (!selectedTeam || !apiTeams) return false;
    
    const myTeam = apiTeams.find(t => t.owner === selectedTeam);
    if (!myTeam) return false;
    
    return myTeam.players?.some((p: any) => 
      p.name?.toLowerCase().trim() === player.Nome?.toLowerCase().trim()
    ) || false;
  };

  // Funzione per ottenere i team disponibili per l'anno selezionato
  const getAvailableTeams = () => {
    if (!groupData || !selectedBasket || !selectedYear) return [];
    
    const basket = groupData.b.find(b => b.i === selectedBasket);
    if (!basket) return [];
    
    const yearlyBasket = basket.y.find(y => y.y.toString() === selectedYear);
    if (!yearlyBasket) return [];
    
    return yearlyBasket.t || [];
  };

  // Funzione per convertire StatPlayer a Player (formato app esistente)
  const convertStatPlayerToPlayer = (statPlayer: StatPlayer): Player => {
    const getRoleString = (role: number): string => {
      switch (role) {
        case 0: return 'Portiere';
        case 1: return 'Difensore';
        case 2: return 'Centrocampista';
        case 3: return 'Attaccante';
        default: return 'Attaccante';
      }
    };

    return {
      Nome: statPlayer.name,
      Ruolo: getRoleString(statPlayer.role),
      Squadra: statPlayer.teamName,
      Media: statPlayer.average.toFixed(2),
      FantaMedia: statPlayer.fantaAverage.toFixed(2),
      'Partite >= 6': statPlayer.isEnough.toString(),
      MotM: statPlayer.manOfTheMatch.toString(),
      Presenze: statPlayer.withVote.toString(),
      'Senza Voto': statPlayer.withoutVote.toString(),
      Gialli: statPlayer.yellowCard.toString(),
      Rossi: statPlayer.redCard.toString(),
      Goal: statPlayer.goal.toString(),
      Rigori: statPlayer.penalty.toString(),
      Assist: statPlayer.assist.toString(),
      'Rigori Sbagliati': statPlayer.wrongedPenalty.toString(),
      Autogoal: statPlayer.ownGoal.toString(),
      'Goal Subiti': statPlayer.sufferedGoal.toString(),
      'Rigori Parati': statPlayer.stoppedPenalty.toString(),
      Attivo: statPlayer.isActive ? 'true' : 'false'
    };
  };

  // Funzione per caricare i dati del gruppo
  const loadGroupData = async (groupIdToLoad: string) => {
    if (!groupIdToLoad.trim()) {
      setError('Inserisci un ID gruppo valido');
      return;
    }

    setIsConfiguring(true);
    setError(null);

    try {
      const group = await getGroup(groupIdToLoad.trim());
      if (!group) {
        setError('Gruppo non trovato. Verifica l\'ID gruppo.');
        setIsConfiguring(false);
        return;
      }

      setGroupData(group);
      setConfigurationStep('league');
    } catch (err: any) {
      setError(`Errore nel caricamento del gruppo: ${err.message}`);
    } finally {
      setIsConfiguring(false);
    }
  };

  // Funzione per caricare i giocatori una volta configurato tutto
  const loadPlayersData = async () => {
    if (!selectedLeague || !selectedBasket || !selectedYear) {
      setError('Configurazione incompleta');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Configura l'API con i parametri selezionati
      updateConfig({
        GROUP: groupData!.i,
        LEAGUE: selectedLeague,
        BASKET: selectedBasket,
        YEAR: selectedYear,
      });

      // Carica i giocatori dall'API
      const statPlayers = await getAllPlayers();
      const convertedPlayers = statPlayers.map(convertStatPlayerToPlayer);
      
      setPlayers(convertedPlayers);
      
      // Carica i dati dell'anno scorso dall'API
      try {
        const lastYearData = await getLastYearPlayers();
        setLastYearPlayers(lastYearData);
        console.log(`Caricati ${lastYearData.length} giocatori dell'anno scorso`);
      } catch (lastYearError: any) {
        console.warn('Errore nel caricamento dei dati dell\'anno scorso:', lastYearError.message);
        // Non è un errore critico, continuiamo senza i dati dell'anno scorso
      }
      
      // Carica i dati dei team
      await loadApiTeams();
      
      setConfigurationStep('ready');
      
      // Per ora manteniamo gli altri dati vuoti o carichiamo dai CSV se necessario
      // Potresti voler mantenere titolari, incroci, tiers, etc. dai CSV
      loadAdditionalData();
      
    } catch (err: any) {
      setError(`Errore nel caricamento dei giocatori: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Funzione per caricare dati aggiuntivi (titolari, incroci, etc.) dai CSV se necessario
  const loadAdditionalData = async () => {
    try {
      const baseUrl = import.meta.env.BASE_URL;
      const [titolariText, incrociText, tiersText, infortuniText] = await Promise.all([
        fetch(`${baseUrl}titolari_standard.csv`).then(res => res.text()).catch(() => ''),
        fetch(`${baseUrl}incroci.csv`).then(res => res.text()).catch(() => ''),
        fetch(`${baseUrl}tiers.csv`).then(res => res.text()).catch(() => ''),
        fetch(`${baseUrl}infortuni.csv`).then(res => res.text()).catch(() => ''),
      ]);

      setTitolari(titolariText ? parseCSV(titolariText) : []);
      const tiersData = tiersText ? parseCSV(tiersText) : [];
      setTiers(tiersData);
      setInfortuni(infortuniText ? parseCSV(infortuniText) : []);
      // annoScorso ora viene caricato dall'API, non più dal CSV
      
      if (incrociText) {
        const [header, ...rows] = incrociText.trim().split(/\r?\n/);
        setIncrociHeader(header.split(','));
        setIncroci(rows.map(row => {
          const values = row.split(',');
          const obj: any = {};
          header.split(',').forEach((h, i) => {
            obj[h] = values[i];
          });
          return obj;
        }));
      }
    } catch (error) {
      console.warn('Errore nel caricamento dei dati aggiuntivi:', error);
    }
  };
  useEffect(() => {
    // Carica la configurazione salvata se presente
    const savedConfig = localStorage.getItem('fantacalcioConfig');
    if (savedConfig) {
      const config = JSON.parse(savedConfig);
      setGroupId(config.groupId || '');
      setSelectedLeague(config.leagueId || '');
      setSelectedBasket(config.basketId || '');
      setSelectedYear(config.year || '');
      setSelectedTeam(config.teamOwner || '');
      setAuctionId(config.auctionId || '');
      
      if (config.groupId && config.leagueId && config.basketId && config.year) {
        // Prima carica i dati del gruppo, poi configura tutto
        loadSavedConfiguration(config);
      }
      
      // Se c'è un ID asta salvato, prova a connettersi automaticamente
      if (config.auctionId) {
        setTimeout(() => {
          connectToAuction(config.auctionId);
        }, 2000); // Aspetta 2 secondi per dare tempo ai dati di caricarsi
      }
    }
  }, []);

  // Inizializza le colonne visibili quando i giocatori sono caricati
  useEffect(() => {
    if (players.length > 0) {
      const savedColumns = localStorage.getItem('visibleColumns');
      if (savedColumns) {
        setVisibleColumns(JSON.parse(savedColumns));
      } else {
        // Default: mostra tutte le colonne tranne quelle nascoste
        const defaultColumns: { [key: string]: boolean } = {};
        Object.keys(players[0]).forEach(key => {
          defaultColumns[key] = !['Attivo'].includes(key);
        });
        setVisibleColumns(defaultColumns);
      }
      
      // Carica le colonne speciali
      const savedSpecialColumns = localStorage.getItem('visibleSpecialColumns');
      if (savedSpecialColumns) {
        setVisibleSpecialColumns(JSON.parse(savedSpecialColumns));
      }
    }
  }, [players]);

  // Salva lo stato dei giocatori nel localStorage
  const savePlayerStatus = (newStatus: { [key: string]: PlayerStatus }) => {
    localStorage.setItem('playerStatus', JSON.stringify(newStatus));
  };

  // Salva i prezzi dei giocatori nel localStorage
  const savePlayerPrices = (newPrices: { [key: string]: number }) => {
    localStorage.setItem('playerPrices', JSON.stringify(newPrices));
  };

  // Funzione per gestire la visibilità delle colonne
  const handleColumnVisibilityChange = (column: string, visible: boolean) => {
    const newVisibleColumns = { ...visibleColumns, [column]: visible };
    setVisibleColumns(newVisibleColumns);
    localStorage.setItem('visibleColumns', JSON.stringify(newVisibleColumns));
  };

  // Funzione per gestire la visibilità delle colonne speciali
  const handleSpecialColumnVisibilityChange = (column: string, visible: boolean) => {
    const newVisibleSpecialColumns = { ...visibleSpecialColumns, [column]: visible };
    setVisibleSpecialColumns(newVisibleSpecialColumns);
    localStorage.setItem('visibleSpecialColumns', JSON.stringify(newVisibleSpecialColumns));
  };

  // Funzione per aprire il menu delle colonne
  const handleColumnMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setColumnMenuAnchor(event.currentTarget);
  };

  // Funzione per ottenere il tier di una squadra
  const getTeamTier = (teamName: string): number => {
    const team = tiers.find(t => t.nome?.toLowerCase() === teamName?.toLowerCase());
    const tier = team ? parseInt(team.tier) : 5;
    return tier;
  };

  // Funzione per controllare se un giocatore è infortunato
  const getPlayerInjury = (player: Player) => {
    const injury = infortuni.find(i => 
      i.Nome?.toLowerCase().trim() === player.Nome?.toLowerCase().trim() &&
      i.Squadra?.toLowerCase().trim() === player.Squadra?.toLowerCase().trim()
    );
    return injury ? {
      mesi: injury.Rientro_Mesi,
      tipo: injury.Tipo_Infortunio
    } : null;
  };

  // Funzione per ottenere i dati dell'anno scorso di un giocatore
  const getPlayerLastYearData = (player: Player) => {
    // Cerca il giocatore nei dati dell'anno scorso dall'API
    const lastYearPlayer = lastYearPlayers.find(p => 
      p.name?.toLowerCase().trim() === player.Nome?.toLowerCase().trim()
    );
    
    if (!lastYearPlayer) return null;
    
    const presenze = lastYearPlayer.withVote;
    const wasTitolare = presenze > 20;
    const hasChangedTeam = lastYearPlayer.teamName?.toLowerCase().trim() !== player.Squadra?.toLowerCase().trim();
    
    // Differenzia le statistiche in base al ruolo
    let stats = '';
    if (player.Ruolo === 'Portiere') {
      // Per i portieri: Goal Subiti / Rigori Parati / Autogoal / Ammonizioni / Espulsioni
      stats = `${lastYearPlayer.sufferedGoal || 0}/${lastYearPlayer.stoppedPenalty || 0}/${lastYearPlayer.ownGoal || 0}/${lastYearPlayer.yellowCard || 0}/${lastYearPlayer.redCard || 0}`;
    } else {
      // Per gli altri ruoli: Goal Fatti / Assist / Rigori + / Rigori - / Ammonizioni / Espulsioni
      stats = `${lastYearPlayer.goal || 0}/${lastYearPlayer.assist || 0}/${lastYearPlayer.penalty || 0}/${lastYearPlayer.wrongedPenalty || 0}/${lastYearPlayer.yellowCard || 0}/${lastYearPlayer.redCard || 0}`;
    }
    
    return {
      wasTitolare,
      hasChangedTeam,
      fantamedia: lastYearPlayer.fantaAverage ? lastYearPlayer.fantaAverage.toFixed(2) : '-',
      stats: stats,
      presenze: presenze,
      oldTeam: lastYearPlayer.teamName,
      ruolo: player.Ruolo
    };
  };

  // Funzione per chiudere il menu delle colonne
  const handleColumnMenuClose = () => {
    setColumnMenuAnchor(null);
  };

  const clearAllPlayers = () => {
    if (window.confirm('Vuoi davvero liberare TUTTI i giocatori? Questa azione non può essere annullata.')) {
      savePlayerStatus({});
      savePlayerPrices({});
    }
  };

  // Colonne da nascondere
  const hiddenColumns = ['Attivo'];

  // Filtra le colonne visibili
  const getVisibleColumns = (player: Player) => {
    return Object.keys(player).filter(key => !hiddenColumns.includes(key));
  };

  const getVisiblePlayerData = (player: Player) => {
    const visibleData: { [key: string]: string } = {};
    Object.keys(player).forEach(key => {
      if (!hiddenColumns.includes(key)) {
        visibleData[key] = player[key];
      }
    });
    return visibleData;
  };

  // Ottieni tutti i ruoli unici dai giocatori
  const uniqueRoles = ['Tutti', ...Array.from(new Set(players.map(p => p.Ruolo)))].filter(Boolean);

  // Calcola le statistiche per i titolari
  const getStatsForRole = (role: string) => {
    // Filtra i titolari per ruolo se non è "Tutti"
    const filteredTitolari = role === 'Tutti' 
      ? titolari 
      : titolari.filter(t => {
          const player = players.find(p => 
            p.Nome.toLowerCase() === t['Nome Giocatore']?.toLowerCase() && 
            p.Squadra.toLowerCase() === t['Squadra']?.toLowerCase()
          );
          return player?.Ruolo === role;
        });

    const totalTitolari = filteredTitolari.length;
    
    // Inizializza i contatori per i tier
    const tierStats = {
      total: [0, 0, 0, 0, 0],      // Tier totali
      takenByMe: [0, 0, 0, 0, 0],  // Tier presi da me
      takenByOthers: [0, 0, 0, 0, 0], // Tier presi da altri
      remaining: [0, 0, 0, 0, 0],   // Tier disponibili
      totalTaken: [0, 0, 0, 0, 0]   // Tier totali presi
    };
    
    // Conta quanti titolari sono stati presi
    let takenByMe = 0;
    let takenByOthers = 0;
    
    filteredTitolari.forEach(titolare => {
      // Trova il giocatore per ottenere la squadra e il tier
      const player = players.find(p => 
        p.Nome.toLowerCase() === titolare['Nome Giocatore']?.toLowerCase() && 
        p.Squadra.toLowerCase() === titolare['Squadra']?.toLowerCase()
      );
      
      if (player) {
        // Usa l'API per ottenere lo status invece del localStorage
        const apiStatus = getPlayerStatusFromApi(player);
        const status = apiStatus.status;
        const tier = getTeamTier(player.Squadra);
        const tierIndex = Math.min(Math.max(tier - 1, 0), 4);
        
        // Incrementa il contatore totale per questo tier
        tierStats.total[tierIndex]++;
        
        if (status === 'mia') {
          takenByMe++;
          tierStats.takenByMe[tierIndex]++;
          tierStats.totalTaken[tierIndex]++;
        } else if (status === 'altra') {
          takenByOthers++;
          tierStats.takenByOthers[tierIndex]++;
          tierStats.totalTaken[tierIndex]++;
        } else {
          tierStats.remaining[tierIndex]++;
        }
      }
    });

    const totalTaken = takenByMe + takenByOthers;
    const remaining = totalTitolari - totalTaken;
    const percentageTaken = totalTitolari > 0 ? Math.round((totalTaken / totalTitolari) * 100) : 0;

    // Formatta le statistiche tier
    const formatTierStats = (tiers: number[]) => {
      return tiers.slice(0, 4).join('/'); // Mostra solo tier 1-4
    };

    return {
      totalTitolari,
      takenByMe,
      takenByOthers,
      totalTaken,
      remaining,
      percentageTaken,
      tierStats: {
        total: formatTierStats(tierStats.total),
        takenByMe: formatTierStats(tierStats.takenByMe),
        takenByOthers: formatTierStats(tierStats.takenByOthers),
        remaining: formatTierStats(tierStats.remaining),
        totalTaken: formatTierStats(tierStats.totalTaken)
      }
    };
  };

  const stats = getStatsForRole(selectedRole);

  // Calcola le statistiche dei giocatori presi da me - memoizzato per performance e aggiornamento automatico
  const myTeamStats = useMemo(() => {
    console.log('🔄 Recalculating my team stats', { 
      playersCount: players.length, 
      apiTeamsCount: apiTeams.length 
    });
    
    const myPlayers = players.filter(player => {
      // Usa l'API per ottenere lo status invece del localStorage
      const apiStatus = getPlayerStatusFromApi(player);
      return apiStatus.status === 'mia';
    });

    const roleStats = {
      Portiere: { count: 0, teams: new Set(), tiers: [0, 0, 0, 0, 0] }, // index 0-4 per tier 1-5
      Difensore: { count: 0, teams: new Set(), tiers: [0, 0, 0, 0, 0] },
      Centrocampista: { count: 0, teams: new Set(), tiers: [0, 0, 0, 0, 0] },
      Attaccante: { count: 0, teams: new Set(), tiers: [0, 0, 0, 0, 0] }
    };

    const allTeams = new Set();
    const totalTiers = [0, 0, 0, 0, 0]; // Per contare i tier totali

    myPlayers.forEach(player => {
      const role = player.Ruolo as keyof typeof roleStats;
      if (roleStats[role]) {
        roleStats[role].count++;
        roleStats[role].teams.add(player.Squadra);
        
        // Aggiungi statistiche per tier
        const tier = getTeamTier(player.Squadra);
        const tierIndex = Math.min(Math.max(tier - 1, 0), 4); // Converte tier 1-5 in index 0-4
        roleStats[role].tiers[tierIndex]++;
        totalTiers[tierIndex]++; // Aggiungi al conteggio totale
      }
      allTeams.add(player.Squadra);
    });

    // Formatta le statistiche tier per ogni ruolo
    const formatTierStats = (tiers: number[]) => {
      return tiers.slice(0, 4).join('/'); // Mostra solo tier 1-4
    };

    return {
      portieri: `${roleStats.Portiere.teams.size}/${roleStats.Portiere.count}`,
      difensori: `${roleStats.Difensore.teams.size}/${roleStats.Difensore.count}`,
      centrocampisti: `${roleStats.Centrocampista.teams.size}/${roleStats.Centrocampista.count}`,
      attaccanti: `${roleStats.Attaccante.teams.size}/${roleStats.Attaccante.count}`,
      totale: `${allTeams.size}/${myPlayers.length}`,
      totalePlayers: myPlayers.length,
      portieriTeams: Array.from(roleStats.Portiere.teams).sort(),
      difensoriTeams: Array.from(roleStats.Difensore.teams).sort(),
      centrocampistiTeams: Array.from(roleStats.Centrocampista.teams).sort(),
      attaccantiTeams: Array.from(roleStats.Attaccante.teams).sort(),
      allTeamsList: Array.from(allTeams).sort(),
      portieriTiers: formatTierStats(roleStats.Portiere.tiers),
      difensoriTiers: formatTierStats(roleStats.Difensore.tiers),
      centrocampistiTiers: formatTierStats(roleStats.Centrocampista.tiers),
      attaccantiTiers: formatTierStats(roleStats.Attaccante.tiers),
      totaleTiers: formatTierStats(totalTiers)
    };
  }, [players, apiTeams, forceUpdate]); // Dipende da apiTeams per aggiornarsi automaticamente

  // Calcola le statistiche dei crediti - memoizzato per performance e aggiornamento automatico
  const creditStats = useMemo(() => {
    console.log('🔄 Recalculating credit stats', { 
      playersCount: players.length, 
      apiTeamsCount: apiTeams.length 
    });
    
    const myPlayers = players.filter(player => {
      // Usa l'API per ottenere lo status invece del localStorage
      const apiStatus = getPlayerStatusFromApi(player);
      return apiStatus.status === 'mia';
    });

    let totalSpent = 0;
    const spentByRole = {
      Portiere: 0,
      Difensore: 0,
      Centrocampista: 0,
      Attaccante: 0
    };

    myPlayers.forEach(player => {
      // Usa il prezzo dall'API invece che dal localStorage
      const apiStatus = getPlayerStatusFromApi(player);
      const price = apiStatus.price || 0;
      totalSpent += price;
      
      const role = player.Ruolo as keyof typeof spentByRole;
      if (spentByRole[role] !== undefined) {
        spentByRole[role] += price;
      }
    });

    const remainingCredits = totalCredits - totalSpent;

    return {
      totalCredits,
      totalSpent,
      remainingCredits,
      spentByRole
    };
  }, [players, apiTeams, totalCredits, forceUpdate]); // Dipende da apiTeams per aggiornarsi automaticamente

  // Funzione per gestire l'ordinamento
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Funzione per ordinare i giocatori filtrati
  const getSortedPlayers = () => {
    if (!sortField) return filtered;
    
    return [...filtered].sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      
      // Prova a convertire in numero se possibile
      const aNum = parseFloat(aValue);
      const bNum = parseFloat(bValue);
      
      let comparison = 0;
      if (!isNaN(aNum) && !isNaN(bNum)) {
        // Confronto numerico
        comparison = aNum - bNum;
      } else {
        // Confronto stringa
        comparison = aValue.localeCompare(bValue);
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  };

  const sortedPlayers = getSortedPlayers();

  // Funzione per salvare la configurazione
  const saveConfiguration = () => {
    const config = {
      groupId: groupData!.i,
      leagueId: selectedLeague,
      basketId: selectedBasket,
      year: selectedYear,
      teamOwner: selectedTeam,
      auctionId: auctionId,
      auctionConnected: auctionConnected  // Salva anche lo stato della connessione asta
    };
    localStorage.setItem('fantacalcioConfig', JSON.stringify(config));
  };

  // Funzione per caricare una configurazione salvata
  const loadSavedConfiguration = async (config: any) => {
    try {
      setIsConfiguring(true);
      
      // Prima carica i dati del gruppo
      const group = await getGroup(config.groupId);
      if (!group) {
        setError('Gruppo salvato non trovato. Riconfigura l\'applicazione.');
        setConfigurationStep('group');
        localStorage.removeItem('fantacalcioConfig');
        return;
      }

      setGroupData(group);
      setSelectedTeam(config.teamOwner || '');
      
      // Configura l'API
      updateConfig({
        GROUP: config.groupId,
        LEAGUE: config.leagueId,
        BASKET: config.basketId,
        YEAR: config.year,
      });

      // Carica i giocatori
      const statPlayers = await getAllPlayers();
      const convertedPlayers = statPlayers.map(convertStatPlayerToPlayer);
      setPlayers(convertedPlayers);
      
      // Carica i dati dei team
      await loadApiTeams();
      
      // Carica dati aggiuntivi
      await loadAdditionalData();
      
      setConfigurationStep('ready');
      setError(null);
      setConfigLoadedFromStorage(true);
      
      // Ripristina l'asta se era configurata (DOPO che tutto è pronto)
      if (config.auctionId) {
        setAuctionId(config.auctionId);
        
        // Se era connessa, riconnetti automaticamente
        if (config.auctionConnected) {
          console.log('🔄 Tentativo di riconnessione automatica all\'asta:', config.auctionId);
          setTimeout(() => {
            try {
              connectToAuction(config.auctionId);
              console.log('✅ Riconnessione automatica completata');
            } catch (error) {
              console.error('❌ Errore nella riconnessione automatica:', error);
            }
          }, 1000); // Aspetta 1 secondo per essere sicuri che tutto sia pronto
        }
      }
      
      // Nascondi il messaggio dopo 5 secondi
      setTimeout(() => {
        setConfigLoadedFromStorage(false);
      }, 5000);
      
    } catch (err: any) {
      setError(`Errore nel caricamento della configurazione salvata: ${err.message}`);
      setConfigurationStep('group');
      localStorage.removeItem('fantacalcioConfig');
    } finally {
      setIsConfiguring(false);
    }
  };

  useEffect(() => {
    let filteredPlayers = players;
    
    // Applica il filtro per ruolo se non è "Tutti"
    if (selectedRole !== 'Tutti') {
      filteredPlayers = filteredPlayers.filter(p => p.Ruolo === selectedRole);
    }
    
    // Applica il filtro per nome se c'è una ricerca
    if (search.length >= 1) {
      filteredPlayers = filteredPlayers.filter(p =>
        p.Nome.toLowerCase().startsWith(search.toLowerCase())
      );
    }
    
    // Applica il filtro "Solo Liberi" se attivo
    if (showOnlyFree) {
      filteredPlayers = filteredPlayers.filter(p => {
        // Usa l'API per controllare se il giocatore è libero
        const apiStatus = getPlayerStatusFromApi(p);
        return apiStatus.status === null; // Non assegnato
      });
    }
    
    // Applica il filtro "Solo Titolari" se attivo
    if (showOnlyTitolari) {
      filteredPlayers = filteredPlayers.filter(p => isTitolare(p));
    }
    
    setFiltered(filteredPlayers);
  }, [search, players, selectedRole, showOnlyFree, showOnlyTitolari, apiTeams, forceUpdate]); // Aggiungiamo forceUpdate

  // Effetto per forzare il ricalcolo di tutti i componenti quando cambiano i team
  useEffect(() => {
    console.log('🔄 Force update triggered - recalculating all components', { 
      apiTeamsCount: apiTeams.length, 
      forceUpdate 
    });
    
    // Questo effetto triggera automaticamente il ricalcolo di tutti gli altri useEffect
    // che dipendono da apiTeams
  }, [apiTeams, forceUpdate]);

  function isTitolare(player: Player) {
    return titolari.some(
      t =>
        t['Nome Giocatore'] &&
        t['Nome Giocatore'].toLowerCase() === player.Nome.toLowerCase() &&
        t['Squadra'] &&
        t['Squadra'].toLowerCase() === player.Squadra.toLowerCase()
    );
  }

  // Funzione per verificare se ci sono ancora titolari liberi di una squadra per un ruolo
  function getFreeTitolariByTeamAndRole(teamName: string, role: string): number {
    if (!teamName || !role) return 0;
    
    // Trova tutti i titolari di quella squadra e ruolo
    const titolariOfTeamAndRole = titolari.filter(t => 
      t['Squadra'] && 
      t['Squadra'].toLowerCase().trim() === teamName.toLowerCase().trim()
    ).filter(titolare => {
      // Trova il giocatore corrispondente per verificare il ruolo
      const player = players.find(p => 
        p.Nome.toLowerCase().trim() === titolare['Nome Giocatore']?.toLowerCase().trim() && 
        p.Squadra.toLowerCase().trim() === titolare['Squadra']?.toLowerCase().trim()
      );
      return player && player.Ruolo === role;
    });

    // Conta quanti di questi sono ancora liberi
    let freeTitolari = 0;
    titolariOfTeamAndRole.forEach(titolare => {
      const player = players.find(p => 
        p.Nome.toLowerCase().trim() === titolare['Nome Giocatore']?.toLowerCase().trim() && 
        p.Squadra.toLowerCase().trim() === titolare['Squadra']?.toLowerCase().trim()
      );
      
      if (player) {
        const apiStatus = getPlayerStatusFromApi(player);
        if (apiStatus.status === null) { // Giocatore libero
          freeTitolari++;
        }
      }
    });

    return freeTitolari;
  }

  function getMinIncroci(player: Player) {
    if (!player || !player.Squadra || !incroci.length) return [];
    const squadra = player.Squadra;
    const row = incroci.find(r => r['Nome'] === squadra);
    if (!row) return [];
    // Prendi tutte le squadre diverse dalla propria e con valore numerico
    const values = incrociHeader
      .filter(h => h !== 'Nome' && h !== squadra)
      .map(h => ({ squadra: h, valore: row[h] === '' ? undefined : Number(row[h]) }))
      .filter(v => typeof v.valore === 'number' && !isNaN(v.valore));
    // Ordina per valore crescente e prendi le prime 3
    return (values as { squadra: string; valore: number }[]).sort((a, b) => a.valore - b.valore).slice(0, 3);
  }

  // Funzione per analizzare gli incroci ottimali per ogni ruolo basata sui giocatori già presi
  function getOptimalCrossesForRole(role: string) {
    if (!incroci.length || !players.length) return [];
    
    // Ottieni i giocatori del ruolo già presi dalla mia squadra
    const myPlayersInRole = players.filter(player => {
      const apiStatus = getPlayerStatusFromApi(player);
      return apiStatus.status === 'mia' && player.Ruolo === role;
    });

    if (myPlayersInRole.length === 0) {
      return []; // Se non ho giocatori in questo ruolo, non posso calcolare incroci
    }

    // Per ogni squadra, calcola la media degli incroci con le squadre dei miei giocatori
    const teamAnalysis: Array<{
      squadra: string;
      avgIncroci: number;
      maxIncroci: number;
      minIncroci: number;
      incrociFacts: string[];
      availableTitolari: number;
      titolariNames: string[];
    }> = [];

    // Ottieni tutte le squadre possibili (escludendo quelle dei miei giocatori per evitare duplicati)
    const myTeams = new Set(myPlayersInRole.map(p => p.Squadra));
    const allTeams = incrociHeader.filter(h => h !== 'Nome' && !myTeams.has(h));

    allTeams.forEach(targetTeam => {
      const incroceValues: number[] = [];
      const incrociFacts: string[] = [];

      // Per ogni mio giocatore nel ruolo, calcola l'incrocio con la squadra target
      myPlayersInRole.forEach(myPlayer => {
        const myTeam = myPlayer.Squadra;
        const incrociRow = incroci.find(r => r['Nome'] === myTeam);
        
        if (incrociRow && incrociRow[targetTeam] !== undefined && incrociRow[targetTeam] !== '') {
          const incroceValue = Number(incrociRow[targetTeam]);
          if (!isNaN(incroceValue)) {
            incroceValues.push(incroceValue);
            incrociFacts.push(`${myPlayer.Nome} (${myTeam}): ${incroceValue}`);
          }
        }
      });

      if (incroceValues.length > 0) {
        // Conta i titolari disponibili di quella squadra nel ruolo
        const availableTitolari = players.filter(player => {
          const apiStatus = getPlayerStatusFromApi(player);
          return player.Squadra === targetTeam && 
                 player.Ruolo === role && 
                 apiStatus.status === null && // Non ancora preso
                 isTitolare(player); // È titolare
        });

        if (availableTitolari.length > 0) {
          const avgIncroci = incroceValues.reduce((sum, val) => sum + val, 0) / incroceValues.length;
          const maxIncroci = Math.max(...incroceValues);
          const minIncroci = Math.min(...incroceValues);

          teamAnalysis.push({
            squadra: targetTeam,
            avgIncroci: Math.round(avgIncroci * 10) / 10, // Arrotonda a 1 decimale
            maxIncroci,
            minIncroci,
            incrociFacts,
            availableTitolari: availableTitolari.length,
            titolariNames: availableTitolari.map(p => p.Nome)
          });
        }
      }
    });

    // Ordina per media incroci crescente (i migliori incroci hanno valori bassi)
    return teamAnalysis.sort((a, b) => a.avgIncroci - b.avgIncroci).slice(0, 5); // Top 5
  }

  // Funzione per verificare se un giocatore è "papabile" per gli incroci favorevoli
  function isPlayerOptimalForCrosses(player: Player): { isPapabile: boolean; avgIncroci?: number; details?: string } {
    if (!player || !player.Squadra || !player.Ruolo || !incroci.length) {
      return { isPapabile: false };
    }

    // Ottieni i giocatori del mio team nello stesso ruolo
    const myPlayersInRole = players.filter(p => {
      const apiStatus = getPlayerStatusFromApi(p);
      return apiStatus.status === 'mia' && p.Ruolo === player.Ruolo;
    });

    if (myPlayersInRole.length === 0) {
      return { isPapabile: false }; // Non ho giocatori in questo ruolo
    }

    // Calcola la media degli incroci con i miei giocatori
    const incroceValues: number[] = [];
    const myTeams = myPlayersInRole.map(p => p.Squadra);

    myPlayersInRole.forEach(myPlayer => {
      const myTeam = myPlayer.Squadra;
      const incrociRow = incroci.find(r => r['Nome'] === myTeam);
      
      if (incrociRow && incrociRow[player.Squadra] !== undefined && incrociRow[player.Squadra] !== '') {
        const incroceValue = Number(incrociRow[player.Squadra]);
        if (!isNaN(incroceValue)) {
          incroceValues.push(incroceValue);
        }
      }
    });

    if (incroceValues.length === 0) {
      return { isPapabile: false };
    }

    const avgIncroci = incroceValues.reduce((sum, val) => sum + val, 0) / incroceValues.length;
    const roundedAvg = Math.round(avgIncroci * 10) / 10;
    
    // Considera "papabile" se la media incroci è <= 8 (soglia ragionevole)
    const isPapabile = avgIncroci <= 8;
    
    const details = `Media incroci: ${roundedAvg} (con ${myTeams.join(', ')})`;

    return {
      isPapabile,
      avgIncroci: roundedAvg,
      details
    };
  }

  return (
    <Box sx={{ bgcolor: '#f5f5f5ff', minHeight: '80vh', width: '100%'  }}>
      {/* Interfaccia di Configurazione */}
      {configurationStep !== 'ready' && (
        <Box sx={{ width: '100%', p: 3 }}>
          <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h5" gutterBottom color="primary">
              Configurazione Fantacalcio
            </Typography>
            
            {/* Indicatore di caricamento configurazione salvata */}
            {isConfiguring && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, p: 2, bgcolor: 'info.main', color: 'white', borderRadius: 1 }}>
                <CircularProgress size={20} color="inherit" />
                <Typography>
                  Caricamento configurazione salvata...
                </Typography>
              </Box>
            )}
            
            {/* Step 1: Inserimento GUID */}
            {configurationStep === 'group' && !isConfiguring && (
              <Box>
                <Typography variant="h6" gutterBottom>
                  1. Inserisci l'ID del Gruppo
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
                  <TextField
                    label="ID Gruppo"
                    value={groupId}
                    onChange={(e) => setGroupId(e.target.value)}
                    placeholder="es: abc123-def456-ghi789"
                    sx={{ flex: 1 }}
                  />
                  <Button
                    variant="contained"
                    onClick={() => loadGroupData(groupId)}
                    disabled={!groupId.trim() || isConfiguring}
                  >
                    {isConfiguring ? <CircularProgress size={20} /> : 'Carica Gruppo'}
                  </Button>
                </Box>
              </Box>
            )}

            {/* Step 2: Selezione League */}
            {configurationStep === 'league' && groupData && (
              <Box>
                <Typography variant="h6" gutterBottom>
                  2. Seleziona la Lega
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Gruppo: <strong>{groupData.n}</strong>
                </Typography>
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Lega</InputLabel>
                  <Select
                    value={selectedLeague}
                    onChange={(e) => setSelectedLeague(e.target.value)}
                    label="Lega"
                  >
                    {groupData.l.map((league) => (
                      <MenuItem key={league.i} value={league.i}>
                        {league.n} {league.m ? '(Principale)' : ''}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  variant="contained"
                  onClick={() => setConfigurationStep('basket')}
                  disabled={!selectedLeague}
                >
                  Continua
                </Button>
              </Box>
            )}

            {/* Step 3: Selezione Basket */}
            {configurationStep === 'basket' && groupData && (
              <Box>
                <Typography variant="h6" gutterBottom>
                  3. Seleziona il Basket
                </Typography>
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Basket</InputLabel>
                  <Select
                    value={selectedBasket}
                    onChange={(e) => setSelectedBasket(e.target.value)}
                    label="Basket"
                  >
                    {groupData.b.map((basket) => (
                      <MenuItem key={basket.i} value={basket.i}>
                        {basket.n}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  variant="contained"
                  onClick={() => setConfigurationStep('year')}
                  disabled={!selectedBasket}
                >
                  Continua
                </Button>
              </Box>
            )}

            {/* Step 4: Selezione Anno */}
            {configurationStep === 'year' && groupData && (
              <Box>
                <Typography variant="h6" gutterBottom>
                  4. Seleziona l'Anno
                </Typography>
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Anno</InputLabel>
                  <Select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    label="Anno"
                  >
                    {groupData.l
                      .find(l => l.i === selectedLeague)?.y
                      ?.map((year) => (
                        <MenuItem key={year.y} value={year.y.toString()}>
                          {year.y}
                        </MenuItem>
                      )) || []}
                  </Select>
                </FormControl>
                <Button
                  variant="contained"
                  onClick={() => setConfigurationStep('team')}
                  disabled={!selectedYear}
                >
                  Continua
                </Button>
              </Box>
            )}

            {/* Step 5: Selezione Team */}
            {configurationStep === 'team' && groupData && (
              <Box>
                <Typography variant="h6" gutterBottom>
                  5. Seleziona la tua Squadra
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Seleziona la squadra che vuoi gestire (opzionale - puoi anche non selezionare nessuna squadra)
                </Typography>
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>La mia Squadra</InputLabel>
                  <Select
                    value={selectedTeam}
                    onChange={(e) => setSelectedTeam(e.target.value)}
                    label="La mia Squadra"
                  >
                    <MenuItem value="">
                      <em>Nessuna squadra selezionata</em>
                    </MenuItem>
                    {getAvailableTeams().map((team) => (
                      <MenuItem key={team.o} value={team.o}>
                        {team.n} ({team.o})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  variant="contained"
                  onClick={() => {
                    saveConfiguration();
                    loadPlayersData();
                  }}
                  disabled={loading}
                >
                  {loading ? <CircularProgress size={20} /> : 'Carica Giocatori'}
                </Button>
              </Box>
            )}

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}
          </Paper>
        </Box>
      )}

      {/* Contenuto principale - visibile solo dopo configurazione */}
      {configurationStep === 'ready' && (
        <Box sx={{ width: '100%', margin: 0, padding: 0 }}>
          {/* Messaggio configurazione caricata */}
          {configLoadedFromStorage && (
            <Alert severity="success" sx={{ m: 2 }}>
              ✅ Configurazione caricata automaticamente dal storage locale
            </Alert>
          )}
          
          {/* Banner Auto-Sync Attivo */}
          {auctionConnected && (
            <Alert 
              severity="info" 
              sx={{ 
                m: 2, 
                bgcolor: '#e3f2fd', 
                border: '2px solid #2196f3',
                '& .MuiAlert-icon': {
                  color: '#2196f3'
                }
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontWeight: 600, color: '#1976d2' }}>
                  🔄 AUTO-SYNC ATTIVO
                </Typography>
                <Typography sx={{ color: '#1976d2' }}>
                  • I team si aggiornano automaticamente ad ogni cambio giocatore in asta
                </Typography>
                {liveAuction?.currentPlayer && (
                  <Typography sx={{ color: '#1976d2', fontWeight: 600, ml: 1 }}>
                    • Giocatore corrente: {liveAuction.currentPlayer}
                  </Typography>
                )}
              </Box>
            </Alert>
          )}
          
          {/* Errore caricamento team API */}
          {apiTeamsError && (
            <Alert severity="warning" sx={{ m: 2 }}>
              ⚠️ Errore nel caricamento dei team: {apiTeamsError}
            </Alert>
          )}
          
          {/* Pulsante per riconfigurare */}
          <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="h4" color="primary">
                Fantacalcio Manager
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Configurazione salvata: Gruppo {groupData?.n}, Anno {selectedYear}
                {selectedTeam && (
                  <>
                    <br />
                    La mia squadra: <strong>{getAvailableTeams().find(t => t.o === selectedTeam)?.n || selectedTeam}</strong>
                  </>
                )}
                {lastApiTeamsUpdate && (
                  <>
                    <br />
                    Ultimo aggiornamento team: <strong>{lastApiTeamsUpdate.toLocaleTimeString()}</strong>
                  </>
                )}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {/* Controlli Asta Live */}
              {!auctionConnected ? (
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <TextField
                    label="ID Asta"
                    variant="outlined"
                    value={auctionId}
                    onChange={(e) => setAuctionId(e.target.value)}
                    size="small"
                    sx={{ width: 200 }}
                    placeholder="ID Firebase..."
                  />
                  <Button
                    variant="contained"
                    onClick={() => connectToAuction(auctionId)}
                    disabled={!auctionId.trim()}
                    size="small"
                    sx={{ 
                      bgcolor: 'error.main', 
                      '&:hover': { bgcolor: 'error.dark' },
                      whiteSpace: 'nowrap'
                    }}
                  >
                    🔴 Connetti Asta
                  </Button>
                </Box>
              ) : (
                <Button
                  variant="contained"
                  color="success"
                  onClick={disconnectFromAuction}
                  size="small"
                  sx={{ 
                    whiteSpace: 'nowrap',
                    animation: 'pulse 2s infinite',
                    '@keyframes pulse': {
                      '0%': { boxShadow: '0 0 0 0 rgba(76, 175, 80, 0.7)' },
                      '70%': { boxShadow: '0 0 0 10px rgba(76, 175, 80, 0)' },
                      '100%': { boxShadow: '0 0 0 0 rgba(76, 175, 80, 0)' }
                    }
                  }}
                >
                  🔄 Asta Auto-Sync
                </Button>
              )}
              
              <Button
                variant="outlined"
                onClick={loadApiTeams}
                disabled={apiTeamsLoading}
                size="small"
                title={auctionConnected ? "I team si aggiornano automaticamente ad ogni cambio giocatore in asta" : "Aggiorna manualmente i dati dei team"}
              >
                {apiTeamsLoading ? <CircularProgress size={16} /> : auctionConnected ? '🔄 Auto-Sync' : 'Aggiorna Team'}
              </Button>
              <Button
                variant="outlined"
                onClick={() => {
                  localStorage.removeItem('fantacalcioConfig');
                  setConfigurationStep('group');
                  setPlayers([]);
                  setGroupData(null);
                  setSelectedLeague('');
                  setSelectedBasket('');
                  setSelectedYear('');
                  setSelectedTeam('');
                  setGroupId('');
                  setAuctionId('');
                  disconnectFromAuction();
                }}
              >
                Riconfigura
              </Button>
            </Box>
          </Box>
        {/* Statistiche Titolari */}
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 3, pt: 3, flexWrap: 'wrap' }}>
          <Paper elevation={3} sx={{ p: 2, bgcolor: '#e3f2fd', minWidth: 150 }}>
            <Typography variant="h6" color="primary" sx={{ fontWeight: 700, fontSize: 16 }}>
              Titolari {selectedRole !== 'Tutti' ? selectedRole : ''}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Totali: {stats.totalTitolari}
            </Typography>
            <Typography variant="body2" color="primary.main" sx={{ fontSize: 11, fontWeight: 600 }}>
              T1/T2/T3/T4: {stats.tierStats.total}
            </Typography>
          </Paper>
          
          <Paper elevation={3} sx={{ p: 2, bgcolor: '#e8f5e8', minWidth: 150 }}>
            <Typography variant="h6" color="success.main" sx={{ fontWeight: 700, fontSize: 16 }}>
              Presi da Me
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {stats.takenByMe} / {stats.totalTitolari}
            </Typography>
            <Typography variant="body2" color="primary.main" sx={{ fontSize: 11, fontWeight: 600 }}>
              T1/T2/T3/T4: {stats.tierStats.takenByMe}
            </Typography>
          </Paper>

          <Paper elevation={3} sx={{ p: 2, bgcolor: '#fff3e0', minWidth: 150 }}>
            <Typography variant="h6" color="warning.main" sx={{ fontWeight: 700, fontSize: 16 }}>
              Presi da Altri
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {stats.takenByOthers} / {stats.totalTitolari}
            </Typography>
            <Typography variant="body2" color="primary.main" sx={{ fontSize: 11, fontWeight: 600 }}>
              T1/T2/T3/T4: {stats.tierStats.takenByOthers}
            </Typography>
          </Paper>

          <Paper elevation={3} sx={{ p: 2, bgcolor: '#f3e5f5', minWidth: 150 }}>
            <Typography variant="h6" color="secondary.main" sx={{ fontWeight: 700, fontSize: 16 }}>
              Disponibili
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {stats.remaining} ({100 - stats.percentageTaken}%)
            </Typography>
            <Typography variant="body2" color="primary.main" sx={{ fontSize: 11, fontWeight: 600 }}>
              T1/T2/T3/T4: {stats.tierStats.remaining}
            </Typography>
          </Paper>

          <Paper elevation={3} sx={{ p: 2, bgcolor: '#fce4ec', minWidth: 150 }}>
            <Typography variant="h6" color="error.main" sx={{ fontWeight: 700, fontSize: 16 }}>
              Totale Presi
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {stats.totalTaken} ({stats.percentageTaken}%)
            </Typography>
            <Typography variant="body2" color="primary.main" sx={{ fontSize: 11, fontWeight: 600 }}>
              T1/T2/T3/T4: {stats.tierStats.totalTaken}
            </Typography>
          </Paper>
        </Box>

        {/* Statistiche Mia Squadra */}
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <Paper elevation={3} sx={{ p: 2, bgcolor: '#e1f5fe', minWidth: 120 }}>
            <Typography variant="h6" color="info.main" sx={{ fontWeight: 700, fontSize: 14 }}>
              Portieri
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {myTeamStats.portieri}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
              {myTeamStats.portieriTeams.join(', ') || 'Nessuna'}
            </Typography>
            <Typography variant="body2" color="primary.main" sx={{ fontSize: 11, fontWeight: 600 }}>
              T1/T2/T3/T4: {myTeamStats.portieriTiers}
            </Typography>
          </Paper>

          <Paper elevation={3} sx={{ p: 2, bgcolor: '#f1f8e9', minWidth: 120 }}>
            <Typography variant="h6" color="success.main" sx={{ fontWeight: 700, fontSize: 14 }}>
              Difensori
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {myTeamStats.difensori}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
              {myTeamStats.difensoriTeams.join(', ') || 'Nessuna'}
            </Typography>
            <Typography variant="body2" color="primary.main" sx={{ fontSize: 11, fontWeight: 600 }}>
              T1/T2/T3/T4: {myTeamStats.difensoriTiers}
            </Typography>
          </Paper>

          <Paper elevation={3} sx={{ p: 2, bgcolor: '#fff8e1', minWidth: 120 }}>
            <Typography variant="h6" color="warning.main" sx={{ fontWeight: 700, fontSize: 14 }}>
              Centrocampisti
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {myTeamStats.centrocampisti}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
              {myTeamStats.centrocampistiTeams.join(', ') || 'Nessuna'}
            </Typography>
            <Typography variant="body2" color="primary.main" sx={{ fontSize: 11, fontWeight: 600 }}>
              T1/T2/T3/T4: {myTeamStats.centrocampistiTiers}
            </Typography>
          </Paper>

          <Paper elevation={3} sx={{ p: 2, bgcolor: '#fce4ec', minWidth: 120 }}>
            <Typography variant="h6" color="error.main" sx={{ fontWeight: 700, fontSize: 14 }}>
              Attaccanti
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {myTeamStats.attaccanti}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
              {myTeamStats.attaccantiTeams.join(', ') || 'Nessuna'}
            </Typography>
            <Typography variant="body2" color="primary.main" sx={{ fontSize: 11, fontWeight: 600 }}>
              T1/T2/T3/T4: {myTeamStats.attaccantiTiers}
            </Typography>
          </Paper>

          <Paper elevation={3} sx={{ p: 2, bgcolor: '#f3e5f5', minWidth: 150 }}>
            <Typography variant="h6" color="secondary.main" sx={{ fontWeight: 700, fontSize: 14 }}>
              Totale Squadra
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {myTeamStats.totale} ({myTeamStats.totalePlayers} giocatori)
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
              {myTeamStats.allTeamsList.join(', ') || 'Nessuna'}
            </Typography>
            <Typography variant="body2" color="primary.main" sx={{ fontSize: 11, fontWeight: 600 }}>
              T1/T2/T3/T4: {myTeamStats.totaleTiers}
            </Typography>
          </Paper>
        </Box>

        {/* Statistiche Crediti */}
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <Paper elevation={3} sx={{ p: 2, bgcolor: '#e8f5e8', minWidth: 150 }}>
            <Typography variant="h6" color="success.main" sx={{ fontWeight: 700, fontSize: 16 }}>
              Budget Totale
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {creditStats.totalCredits} crediti
            </Typography>
          </Paper>

          <Paper elevation={3} sx={{ p: 2, bgcolor: '#fff3e0', minWidth: 150 }}>
            <Typography variant="h6" color="warning.main" sx={{ fontWeight: 700, fontSize: 16 }}>
              Spesi
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {creditStats.totalSpent} crediti
            </Typography>
          </Paper>

          <Paper elevation={3} sx={{ p: 2, bgcolor: creditStats.remainingCredits < 0 ? '#ffebee' : '#e3f2fd', minWidth: 150 }}>
            <Typography variant="h6" color={creditStats.remainingCredits < 0 ? 'error.main' : 'primary'} sx={{ fontWeight: 700, fontSize: 16 }}>
              Rimanenti
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {creditStats.remainingCredits} crediti
            </Typography>
          </Paper>

          <Paper elevation={3} sx={{ p: 2, bgcolor: '#f1f8e9', minWidth: 120 }}>
            <Typography variant="h6" color="success.main" sx={{ fontWeight: 700, fontSize: 14 }}>
              Portieri
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {creditStats.spentByRole.Portiere} crediti
            </Typography>
          </Paper>

          <Paper elevation={3} sx={{ p: 2, bgcolor: '#e1f5fe', minWidth: 120 }}>
            <Typography variant="h6" color="info.main" sx={{ fontWeight: 700, fontSize: 14 }}>
              Difensori
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {creditStats.spentByRole.Difensore} crediti
            </Typography>
          </Paper>

          <Paper elevation={3} sx={{ p: 2, bgcolor: '#fff8e1', minWidth: 120 }}>
            <Typography variant="h6" color="warning.main" sx={{ fontWeight: 700, fontSize: 14 }}>
              Centrocampisti
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {creditStats.spentByRole.Centrocampista} crediti
            </Typography>
          </Paper>

          <Paper elevation={3} sx={{ p: 2, bgcolor: '#fce4ec', minWidth: 120 }}>
            <Typography variant="h6" color="error.main" sx={{ fontWeight: 700, fontSize: 14 }}>
              Attaccanti
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {creditStats.spentByRole.Attaccante} crediti
            </Typography>
          </Paper>
        </Box>

        {/* Analisi Incroci Ottimali per Ruolo */}
        {myTeamStats.totalePlayers > 0 && (
          <Box sx={{ mb: 3 }}>
            <Paper elevation={3} sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom color="primary" sx={{ fontWeight: 700, mb: 2 }}>
                🎯 Incroci Ottimali per Ruolo
              </Typography>
              
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 2 }}>
                {['Portiere', 'Difensore', 'Centrocampista', 'Attaccante'].map(role => {
                  const optimalCrosses = getOptimalCrossesForRole(role);
                  
                  if (optimalCrosses.length === 0) {
                    return (
                      <Paper key={role} elevation={1} sx={{ p: 2, bgcolor: '#f9f9f9' }}>
                        <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600, mb: 1 }}>
                          {role}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Nessun giocatore in squadra
                        </Typography>
                      </Paper>
                    );
                  }

                  return (
                    <Paper key={role} elevation={1} sx={{ p: 2 }}>
                      <Typography variant="subtitle2" color="primary" sx={{ fontWeight: 600, mb: 1 }}>
                        {role}
                      </Typography>
                      
                      {optimalCrosses.slice(0, 3).map((cross, index) => (
                        <Box key={cross.squadra} sx={{ mb: 1, p: 1, bgcolor: index === 0 ? '#e8f5e8' : '#f5f5f5', borderRadius: 1 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {cross.squadra}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                              <Chip 
                                label={`Media: ${cross.avgIncroci}`} 
                                size="small" 
                                color={cross.avgIncroci <= 5 ? 'success' : cross.avgIncroci <= 10 ? 'warning' : 'error'} 
                                variant="outlined"
                              />
                              <Chip 
                                label={`${cross.availableTitolari} titolari`} 
                                size="small" 
                                color="primary" 
                                variant="filled"
                              />
                            </Box>
                          </Box>
                          
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            Range: {cross.minIncroci}-{cross.maxIncroci} | 
                            Titolari: {cross.titolariNames.slice(0, 3).join(', ')}
                            {cross.titolariNames.length > 3 && ` (+${cross.titolariNames.length - 3})`}
                          </Typography>
                          
                          {cross.incrociFacts.length > 0 && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic' }}>
                              {cross.incrociFacts.slice(0, 2).join(', ')}
                              {cross.incrociFacts.length > 2 && '...'}
                            </Typography>
                          )}
                        </Box>
                      ))}
                    </Paper>
                  );
                })}
              </Box>
            </Paper>
          </Box>
        )}

        {/* Giocatore in Asta (se connesso) */}
        {auctionConnected && liveAuction?.currentPlayer && (
          <Box sx={{ mb: 3 }}>
            <Paper elevation={3} sx={{ p: 3, bgcolor: '#f8f9fa', border: '2px solid #ff6b35' }}>
              <Typography variant="h6" sx={{ textAlign: 'center', fontWeight: 700, mb: 2, color: '#ff6b35' }}>
                🎯 GIOCATORE IN ASTA
              </Typography>
              
              {(() => {
                const currentPlayerData = getCurrentAuctionPlayerData();
                if (!currentPlayerData) {
                  return (
                    <Typography variant="body1" sx={{ textAlign: 'center', color: 'text.secondary' }}>
                      Giocatore non trovato nel database: {liveAuction.currentPlayer}
                    </Typography>
                  );
                }

                const { player, auctionData } = currentPlayerData;
                const apiStatus = getPlayerStatusFromApi(player);
                const backgroundColor = apiStatus.status === 'mia' ? '#e8f5e8' : 
                                     apiStatus.status === 'altra' ? '#fff3e0' : '#ffffff';

                return (
                  <Paper 
                    elevation={2} 
                    sx={{ 
                      p: 2, 
                      bgcolor: backgroundColor,
                      border: '2px solid #ff6b35',
                      borderRadius: 2
                    }}
                  >
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
                      <Box>
                        <Typography variant="h5" sx={{ fontWeight: 700, color: '#333' }}>
                          {player.Nome}
                        </Typography>
                        <Typography variant="subtitle1" color="text.secondary">
                          {player.Squadra} • {player.Ruolo}
                        </Typography>
                      </Box>
                      
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h4" sx={{ fontWeight: 700, color: '#ff6b35' }}>
                          {auctionData.currentBid || 0}€
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {auctionData.currentBidder ? `Offerta di: ${auctionData.currentBidder}` : 'Nessuna offerta'}
                        </Typography>
                      </Box>

                      <Box sx={{ textAlign: 'right' }}>
                        <Chip 
                          label={auctionData.auctionStatus === 'active' ? '🔴 ATTIVA' : 
                                auctionData.auctionStatus === 'sold' ? '✅ VENDUTO' : 
                                auctionData.auctionStatus === 'paused' ? '⏸️ PAUSA' : '⏳ ATTESA'}
                          color={auctionData.auctionStatus === 'active' ? 'error' : 
                                auctionData.auctionStatus === 'sold' ? 'success' : 'default'}
                          sx={{ fontWeight: 600, mb: 1 }}
                        />
                        {auctionData.timeLeft && (
                          <Typography variant="body2" color="text.secondary">
                            Tempo: {auctionData.timeLeft}s
                          </Typography>
                        )}
                      </Box>
                    </Box>

                    {/* Dati aggiuntivi del giocatore */}
                    <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #ddd' }}>
                      {(() => {
                        const isTitolarePlayer = isTitolare(player);
                        const crossesInfo = isPlayerOptimalForCrosses(player);
                        const lastYearData = getPlayerLastYearData(player);
                        const injury = getPlayerInjury(player);
                        const teamTier = getTeamTier(player.Squadra);
                        const minIncroci = getMinIncroci(player);

                        return (
                          <Box>
                            {/* Prima riga: Info principali */}
                            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 2, mb: 2 }}>
                              <Box sx={{ textAlign: 'center', p: 1, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', fontWeight: 600 }}>
                                  MEDIA VOTO
                                </Typography>
                                <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main' }}>
                                  {player.Media || '-'}
                                </Typography>
                              </Box>
                              
                              <Box sx={{ textAlign: 'center', p: 1, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', fontWeight: 600 }}>
                                  FANTAMEDIA
                                </Typography>
                                <Typography variant="h6" sx={{ fontWeight: 700, color: 'secondary.main' }}>
                                  {player.FantaMedia || '-'}
                                </Typography>
                              </Box>

                              <Box sx={{ textAlign: 'center', p: 1, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', fontWeight: 600 }}>
                                  PRESENZE
                                </Typography>
                                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                  {player.Presenze || '-'}
                                </Typography>
                              </Box>

                              <Box sx={{ textAlign: 'center', p: 1, bgcolor: isTitolarePlayer ? '#e8f5e8' : '#ffebee', borderRadius: 1 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', fontWeight: 600 }}>
                                  TITOLARE
                                </Typography>
                                <Typography variant="h6" sx={{ fontWeight: 700, color: isTitolarePlayer ? 'success.main' : 'error.main' }}>
                                  {isTitolarePlayer ? '✅ SÌ' : '❌ NO'}
                                </Typography>
                                {crossesInfo.isPapabile ? (
                                  <Typography variant="caption" sx={{ 
                                    display: 'block', 
                                    color: 'primary.main', 
                                    fontWeight: 600, 
                                    fontSize: '0.65rem',
                                    mt: 0.5
                                  }}>
                                    🎯 PAPABILE
                                  </Typography>
                                ) : crossesInfo.avgIncroci !== undefined ? (
                                  <Typography variant="caption" sx={{ 
                                    display: 'block', 
                                    color: 'warning.main', 
                                    fontWeight: 600, 
                                    fontSize: '0.65rem',
                                    mt: 0.5
                                  }}>
                                    ⚠️ INCROCI ALTI
                                  </Typography>
                                ) : null}
                              </Box>

                              {/* Box per gli incroci - sempre visibile se ci sono dati */}
                              {crossesInfo.avgIncroci !== undefined && (
                                <Box sx={{ 
                                  textAlign: 'center', 
                                  p: 1, 
                                  bgcolor: crossesInfo.isPapabile ? '#e3f2fd' : '#fff3e0', 
                                  borderRadius: 1 
                                }}>
                                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', fontWeight: 600 }}>
                                    INCROCI
                                  </Typography>
                                  <Typography variant="h6" sx={{ 
                                    fontWeight: 700, 
                                    color: crossesInfo.isPapabile ? 'primary.main' : 'warning.main' 
                                  }}>
                                    {crossesInfo.isPapabile ? '⭐' : '⚠️'} {crossesInfo.avgIncroci}
                                  </Typography>
                                  <Typography variant="caption" sx={{ 
                                    display: 'block', 
                                    color: 'text.secondary', 
                                    fontSize: '0.6rem' 
                                  }}>
                                    {crossesInfo.isPapabile ? 'Buoni incroci!' : 'Incroci elevati'}
                                  </Typography>
                                </Box>
                              )}

                              <Box sx={{ textAlign: 'center', p: 1, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', fontWeight: 600 }}>
                                  TIER SQUADRA
                                </Typography>
                                <Typography variant="h6" sx={{ fontWeight: 700, color: teamTier <= 2 ? 'success.main' : teamTier <= 3 ? 'warning.main' : 'error.main' }}>
                                  T{teamTier}
                                </Typography>
                              </Box>
                            </Box>

                            {/* Seconda riga: Statistiche dettagliate */}
                            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 1, mb: 2 }}>
                              <Box sx={{ textAlign: 'center' }}>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>Goal</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>{player.Goal || '0'}</Typography>
                              </Box>
                              <Box sx={{ textAlign: 'center' }}>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>Assist</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>{player.Assist || '0'}</Typography>
                              </Box>
                              <Box sx={{ textAlign: 'center' }}>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>MotM</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>{player.MotM || '0'}</Typography>
                              </Box>
                              <Box sx={{ textAlign: 'center' }}>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>Gialli</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: 'warning.main' }}>{player.Gialli || '0'}</Typography>
                              </Box>
                              <Box sx={{ textAlign: 'center' }}>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>Rossi</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: 'error.main' }}>{player.Rossi || '0'}</Typography>
                              </Box>
                              {player.Ruolo === 'Portiere' && (
                                <>
                                  <Box sx={{ textAlign: 'center' }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>Goal Sub.</Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{player['Goal Subiti'] || '0'}</Typography>
                                  </Box>
                                  <Box sx={{ textAlign: 'center' }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>Rig. Par.</Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.main' }}>{player['Rigori Parati'] || '0'}</Typography>
                                  </Box>
                                </>
                              )}
                              {player.Ruolo !== 'Portiere' && (
                                <>
                                  <Box sx={{ textAlign: 'center' }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>Rigori</Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{player.Rigori || '0'}</Typography>
                                  </Box>
                                  <Box sx={{ textAlign: 'center' }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>Rig. Sbag.</Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'error.main' }}>{player['Rigori Sbagliati'] || '0'}</Typography>
                                  </Box>
                                </>
                              )}
                            </Box>

                            {/* Terza riga: Dati anno scorso */}
                            {lastYearData && (
                              <Box sx={{ mb: 2, p: 2, bgcolor: '#f0f7ff', borderRadius: 1, border: '1px solid #e3f2fd' }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: 'primary.main' }}>
                                  📊 STATISTICHE ANNO SCORSO
                                </Typography>
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 2 }}>
                                  <Box sx={{ textAlign: 'center' }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>FANTAMEDIA</Typography>
                                    <Typography variant="body1" sx={{ fontWeight: 700, color: 'secondary.main' }}>
                                      {lastYearData.fantamedia}
                                    </Typography>
                                  </Box>
                                  <Box sx={{ textAlign: 'center' }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>PRESENZE</Typography>
                                    <Typography variant="body1" sx={{ fontWeight: 700 }}>
                                      {lastYearData.presenze}
                                    </Typography>
                                  </Box>
                                  <Box sx={{ textAlign: 'center' }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                      {lastYearData.ruolo === 'Portiere' ? 'GS/RP/AU/AMM/ESP' : 'GOL/ASS/R+/R-/AMM/ESP'}
                                    </Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                                      {lastYearData.stats}
                                    </Typography>
                                  </Box>
                                  {lastYearData.hasChangedTeam && (
                                    <Box sx={{ textAlign: 'center' }}>
                                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>SQUADRA PRECEDENTE</Typography>
                                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'warning.main' }}>
                                        🔄 {lastYearData.oldTeam}
                                      </Typography>
                                    </Box>
                                  )}
                                  {lastYearData.wasTitolare && (
                                    <Box sx={{ textAlign: 'center' }}>
                                      <Chip 
                                        label="🌟 ERA TITOLARE" 
                                        size="small" 
                                        color="success" 
                                        sx={{ fontSize: '0.7rem', fontWeight: 600 }}
                                      />
                                    </Box>
                                  )}
                                </Box>
                              </Box>
                            )}

                            {/* Quarta riga: Info aggiuntive */}
                            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 2 }}>
                              {/* Infortuni */}
                              {injury && (
                                <Box sx={{ p: 2, bgcolor: '#ffebee', borderRadius: 1, border: '1px solid #ffcdd2' }}>
                                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: 'error.main' }}>
                                    🤕 INFORTUNIO
                                  </Typography>
                                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                    {injury.tipo}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    Rientro: {injury.mesi} mesi
                                  </Typography>
                                </Box>
                              )}

                              {/* Incroci migliori */}
                              {minIncroci.length > 0 && (
                                <Box sx={{ p: 2, bgcolor: '#e8f5e8', borderRadius: 1, border: '1px solid #c8e6c9' }}>
                                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: 'success.main', textAlign: 'center' }}>
                                    ⚽ INCROCI MIGLIORI
                                  </Typography>
                                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                                    {minIncroci.slice(0, 3).map((incrocio, index) => {
                                      const freeTitolari = getFreeTitolariByTeamAndRole(incrocio.squadra, player.Ruolo);
                                      const hasFreeTitolari = freeTitolari > 0;
                                      
                                      return (
                                        <Box key={index} sx={{ 
                                          display: 'flex', 
                                          justifyContent: 'center', 
                                          alignItems: 'center', 
                                          gap: 1,
                                          width: '100%',
                                          minHeight: '24px'
                                        }}>
                                          <Typography 
                                            variant="body2" 
                                            sx={{ 
                                              fontSize: hasFreeTitolari ? '0.85rem' : '0.7rem',
                                              fontWeight: hasFreeTitolari ? 700 : 400,
                                              color: hasFreeTitolari ? 'success.dark' : 'text.secondary',
                                              textAlign: 'center',
                                              minWidth: '80px'
                                            }}
                                          >
                                            {incrocio.squadra}: {incrocio.valore}
                                          </Typography>
                                          {hasFreeTitolari && (
                                            <Chip 
                                              label={`${freeTitolari} liberi`}
                                              size="small"
                                              color="success"
                                              sx={{ 
                                                fontSize: '0.6rem', 
                                                height: '18px',
                                                '& .MuiChip-label': { px: 1 }
                                              }}
                                            />
                                          )}
                                          {!hasFreeTitolari && (
                                            <Typography variant="caption" sx={{ 
                                              fontSize: '0.6rem', 
                                              color: 'text.disabled',
                                              textAlign: 'center',
                                              minWidth: '60px'
                                            }}>
                                              tutti presi
                                            </Typography>
                                          )}
                                        </Box>
                                      );
                                    })}
                                  </Box>
                                </Box>
                              )}

                              {/* Incroci con i miei giocatori */}
                              {crossesInfo.avgIncroci !== undefined && (
                                <Box sx={{ 
                                  p: 2, 
                                  bgcolor: crossesInfo.isPapabile ? '#e3f2fd' : '#fff8e1', 
                                  borderRadius: 1, 
                                  border: `1px solid ${crossesInfo.isPapabile ? '#2196f3' : '#ff9800'}` 
                                }}>
                                  <Typography variant="subtitle2" sx={{ 
                                    fontWeight: 700, 
                                    mb: 1, 
                                    color: crossesInfo.isPapabile ? 'primary.main' : 'warning.main',
                                    textAlign: 'center' 
                                  }}>
                                    {crossesInfo.isPapabile ? '🎯 INCROCI CON I TUOI' : '⚠️ INCROCI CON I TUOI'}
                                  </Typography>
                                  
                                  <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
                                    <Chip 
                                      label={`Media: ${crossesInfo.avgIncroci}`}
                                      color={crossesInfo.isPapabile ? 'primary' : 'warning'}
                                      size="small"
                                      sx={{ fontWeight: 600 }}
                                    />
                                  </Box>
                                  
                                  <Typography variant="caption" color="text.secondary" sx={{ 
                                    display: 'block', 
                                    textAlign: 'center',
                                    fontSize: '0.75rem'
                                  }}>
                                    {crossesInfo.details}
                                  </Typography>
                                  
                                  <Typography variant="caption" sx={{ 
                                    display: 'block', 
                                    textAlign: 'center',
                                    fontSize: '0.7rem',
                                    mt: 0.5,
                                    fontWeight: 600,
                                    color: crossesInfo.isPapabile ? 'success.main' : 'warning.main'
                                  }}>
                                    {crossesInfo.isPapabile ? 
                                      '✅ Buoni incroci! Giocatore consigliato per il tuo team' : 
                                      '⚠️ Incroci elevati, valuta attentamente'
                                    }
                                  </Typography>
                                </Box>
                              )}

                              {/* Status giocatore */}
                              {apiStatus.status && (
                                <Box sx={{ 
                                  p: 2, 
                                  bgcolor: apiStatus.status === 'mia' ? '#e8f5e8' : '#fff3e0', 
                                  borderRadius: 1, 
                                  border: `1px solid ${apiStatus.status === 'mia' ? '#c8e6c9' : '#ffcc02'}` 
                                }}>
                                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: apiStatus.status === 'mia' ? 'success.main' : 'warning.main' }}>
                                    {apiStatus.status === 'mia' ? '✅ MIA SQUADRA' : '⚠️ GIÀ PRESO'}
                                  </Typography>
                                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                    Prezzo: {apiStatus.price || 0}€
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    Squadra: {apiStatus.teamName}
                                  </Typography>
                                </Box>
                              )}
                            </Box>
                          </Box>
                        );
                      })()}
                    </Box>
                  </Paper>
                );
              })()}
            </Paper>
          </Box>
        )}

        {/* Errori dell'asta */}
        {auctionError && (
          <Box sx={{ mb: 3 }}>
            <Alert severity="error" sx={{ mx: 2 }}>
              Errore asta: {auctionError}
            </Alert>
          </Box>
        )}

        {/* Legenda Colori */}
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <Paper elevation={1} sx={{ p: 2, bgcolor: 'grey.50' }}>
            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600, textAlign: 'center' }}>
              Legenda Colori
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 16, height: 16, bgcolor: '#e8f5e8', border: '1px solid #ccc' }} />
                <Typography variant="caption">I miei giocatori</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 16, height: 16, bgcolor: '#fff3e0', border: '1px solid #ccc' }} />
                <Typography variant="caption">Presi da altri</Typography>
              </Box>
              {selectedTeam && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ width: 16, height: 16, bgcolor: '#e3f2fd', border: '1px solid #ccc' }} />
                  <Typography variant="caption">Della mia squadra</Typography>
                </Box>
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 16, height: 16, bgcolor: '#e3fcec', border: '1px solid #ccc' }} />
                <Typography variant="caption">Titolari</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 16, height: 16, bgcolor: '#ffebee', border: '1px solid #ccc' }} />
                <Typography variant="caption">Infortunati</Typography>
              </Box>
            </Box>
          </Paper>
        </Box>

        {/* Barra di ricerca e filtri */}
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <TextField
            label="Cerca giocatore..."
            variant="outlined"
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            sx={{ width: 350, bgcolor: 'white', borderRadius: 1 }}
            InputProps={{ style: { fontSize: 20 } }}
          />
          <FormControl sx={{ minWidth: 120, bgcolor: 'white', borderRadius: 1 }}>
            <InputLabel>Ruolo</InputLabel>
            <Select
              value={selectedRole}
              label="Ruolo"
              onChange={(e) => setSelectedRole(e.target.value as string)}
            >
              {uniqueRoles.map(role => (
                <MenuItem key={role} value={role}>{role}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControlLabel
            control={
              <Checkbox
                checked={showOnlyFree}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShowOnlyFree(e.target.checked)}
                color="primary"
              />
            }
            label="Solo Liberi"
            sx={{ bgcolor: 'white', px: 1, borderRadius: 1, color: 'text.secondary' }}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={showOnlyTitolari}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShowOnlyTitolari(e.target.checked)}
                color="success"
              />
            }
            label="Solo Titolari"
            sx={{ bgcolor: 'white', px: 1, borderRadius: 1, color: 'text.secondary' }}
          />
          <Button
            variant="outlined"
            onClick={handleColumnMenuOpen}
            sx={{ height: 56, bgcolor: 'white' }}
          >
            Colonne
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={clearAllPlayers}
            sx={{ height: 56 }}
          >
            Libera Tutti
          </Button>
        </Box>
        {loading && <Typography color="grey.400" sx={{ pl: 2 }}>Caricamento...</Typography>}
        {error && <Typography color="error.main" sx={{ pl: 2 }}>{error}</Typography>}
        {filtered.length > 0 && (
          <TableContainer sx={{ width: '100%', overflowX: 'auto' }}>
            <Table size="small" stickyHeader sx={{ width: '100%', tableLayout: 'fixed' }}>
              <TableHead>
                <TableRow>
                  {getVisibleColumns(filtered[0]).filter(key => visibleColumns[key] !== false).map(key => (
                    <TableCell 
                      key={key} 
                      sx={{ 
                        fontWeight: 700, 
                        bgcolor: '#eafff0', 
                        width: `${100/(getVisibleColumns(filtered[0]).filter(k => visibleColumns[k] !== false).length + 2)}%`,
                        cursor: 'pointer',
                        '&:hover': { bgcolor: '#d4f5dd' }
                      }}
                      onClick={() => handleSort(key)}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {key}
                        {sortField === key && (
                          <Typography variant="caption" sx={{ fontSize: 12 }}>
                            {sortDirection === 'asc' ? '↑' : '↓'}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                  ))}
                  {visibleSpecialColumns.Incroci && (
                    <TableCell sx={{ fontWeight: 700, bgcolor: '#eafff0', width: `${100/(getVisibleColumns(filtered[0]).filter(k => visibleColumns[k] !== false).length + Object.values(visibleSpecialColumns).filter(Boolean).length)}%` }}>Incroci</TableCell>
                  )}
                  {visibleSpecialColumns.Infortuni && (
                    <TableCell sx={{ fontWeight: 700, bgcolor: '#eafff0', width: `${100/(getVisibleColumns(filtered[0]).filter(k => visibleColumns[k] !== false).length + Object.values(visibleSpecialColumns).filter(Boolean).length)}%` }}>Infortuni</TableCell>
                  )}
                  {visibleSpecialColumns.AnnoScorso && (
                    <TableCell 
                      sx={{ fontWeight: 700, bgcolor: '#eafff0', width: `${100/(getVisibleColumns(filtered[0]).filter(k => visibleColumns[k] !== false).length + Object.values(visibleSpecialColumns).filter(Boolean).length)}%` }}
                      title="P: goal subiti/rigori parati/autogoal/ammonizioni/espulsioni | Altri: goal fatti/rigori/rigori sbagliati/assist/ammonizioni/espulsioni"
                    >
                      Anno Scorso
                    </TableCell>
                  )}
                  {visibleSpecialColumns.Stato && (
                    <TableCell sx={{ fontWeight: 700, bgcolor: '#eafff0', width: `${100/(getVisibleColumns(filtered[0]).filter(k => visibleColumns[k] !== false).length + Object.values(visibleSpecialColumns).filter(Boolean).length)}%` }}>Stato</TableCell>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedPlayers.map((player, idx) => {
                  const minIncroci = getMinIncroci(player);
                  const titolare = isTitolare(player);
                  const injury = getPlayerInjury(player);
                  const isMyTeamPlayer = isPlayerInMyTeam(player);
                  
                  // Ottieni lo status dall'API invece che dallo storage locale
                  const apiStatus = getPlayerStatusFromApi(player);
                  const status = apiStatus.status;
                  
                  // Determina il colore di sfondo della riga
                  let rowBgColor = {};
                  if (injury) {
                    rowBgColor = { bgcolor: '#ffebee' }; // Sfondo rosso chiaro per infortunati
                  } else if (status === 'mia') {
                    rowBgColor = { bgcolor: '#e8f5e8' }; // Sfondo verde per i miei giocatori
                  } else if (status === 'altra') {
                    rowBgColor = { bgcolor: '#fff3e0' }; // Sfondo arancione per giocatori di altre squadre
                  } else if (isMyTeamPlayer) {
                    rowBgColor = { bgcolor: '#e3f2fd' }; // Sfondo azzurro per giocatori della mia squadra
                  } else if (titolare) {
                    rowBgColor = { bgcolor: '#e3fcec' }; // Sfondo verde chiaro per titolari
                  }
                  
                  return (
                    <TableRow key={idx} sx={rowBgColor}>
                      {Object.entries(getVisiblePlayerData(player)).filter(([key]) => visibleColumns[key] !== false).map(([, val], i) => (
                        <TableCell key={i} sx={{ fontSize: 15 }}>{val}</TableCell>
                      ))}
                      {visibleSpecialColumns.Incroci && (
                        <TableCell>
                          {minIncroci.length > 0 && (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                              {minIncroci.map((v, i) => (
                                <Chip
                                  key={i}
                                  label={`${v.squadra}: ${v.valore}`}
                                  size="small"
                                  sx={i === 0 ? { bgcolor: '#219653', color: 'white', fontWeight: 700 } : { bgcolor: '#f5f5f5' }}
                                />
                              ))}
                            </Box>
                          )}
                        </TableCell>
                      )}
                      {visibleSpecialColumns.Infortuni && (
                        <TableCell>
                          {(() => {
                            const injury = getPlayerInjury(player);
                            if (injury) {
                              const getInjuryColor = (mesi: string) => {
                                const m = parseInt(mesi);
                                if (m === 1) return '#ff9800'; // Arancione per 1 mese
                                if (m === 2) return '#f44336'; // Rosso per 2 mesi
                                if (m === 3) return '#9c27b0'; // Viola per 3 mesi
                                if (m === 4) return '#673ab7'; // Viola scuro per 4 mesi
                                return '#424242'; // Grigio scuro per 5+ mesi
                              };
                              
                              return (
                                <Chip
                                  label={`${injury.mesi}${injury.mesi === '5' ? '+' : ''} mesi`}
                                  size="small"
                                  sx={{ 
                                    bgcolor: getInjuryColor(injury.mesi), 
                                    color: 'white', 
                                    fontWeight: 700 
                                  }}
                                  title={injury.tipo}
                                />
                              );
                            }
                            return null;
                          })()}
                        </TableCell>
                      )}
                      {visibleSpecialColumns.AnnoScorso && (
                        <TableCell 
                          title="P: goal subiti/rigori parati/autogoal/ammonizioni/espulsioni | Altri: goal fatti/rigori/rigori sbagliati/assist/ammonizioni/espulsioni"
                          sx={(() => {
                            const lastYearData = getPlayerLastYearData(player);
                            if (lastYearData?.wasTitolare) {
                              if (lastYearData.hasChangedTeam) {
                                return { bgcolor: '#fff3e0' }; // Arancione chiaro: era titolare ma ha cambiato squadra
                              } else {
                                return { bgcolor: '#e8f5e8' }; // Verde chiaro: era titolare nella stessa squadra
                              }
                            }
                            return {}; // Nessun background speciale
                          })()}
                        >
                          {(() => {
                            const lastYearData = getPlayerLastYearData(player);
                            if (!lastYearData) {
                              return <Typography variant="caption" color="text.disabled">N/D</Typography>;
                            }
                            
                            return (
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                <Typography variant="caption" sx={{ fontWeight: 600, fontSize: 11 }}>
                                  FM: {lastYearData.fantamedia}
                                </Typography>
                                <Typography variant="caption" sx={{ fontSize: 10 }}>
                                  {lastYearData.stats}
                                </Typography>
                                {lastYearData.hasChangedTeam && (
                                  <Typography variant="caption" sx={{ fontSize: 9, color: 'warning.main' }}>
                                    ex {lastYearData.oldTeam}
                                  </Typography>
                                )}
                                <Typography variant="caption" sx={{ fontSize: 9, color: 'text.secondary' }}>
                                  {lastYearData.presenze} pres.
                                </Typography>
                              </Box>
                            );
                          })()}
                        </TableCell>
                      )}
                      {visibleSpecialColumns.Stato && (
                        <TableCell>
                          {status === 'mia' ? (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              <Chip 
                                label="Mia squadra" 
                                color="primary" 
                                size="small"
                              />
                              <Typography variant="caption" sx={{ fontSize: 10, color: 'success.main', fontWeight: 600 }}>
                                {apiStatus.price || 0} crediti
                              </Typography>
                              {apiStatus.teamName && (
                                <Typography variant="caption" sx={{ fontSize: 9, color: 'text.secondary' }}>
                                  {apiStatus.teamName}
                                </Typography>
                              )}
                            </Box>
                          ) : status === 'altra' ? (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              <Chip 
                                label="Altra squadra" 
                                color="secondary" 
                                size="small"
                              />
                              <Typography variant="caption" sx={{ fontSize: 10, color: 'warning.main', fontWeight: 600 }}>
                                {apiStatus.price || 0} crediti
                              </Typography>
                              {apiStatus.teamName && (
                                <Typography variant="caption" sx={{ fontSize: 9, color: 'text.secondary' }}>
                                  {apiStatus.teamName}
                                </Typography>
                              )}
                            </Box>
                          ) : (
                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                              <Chip 
                                label="Libero" 
                                variant="outlined"
                                size="small"
                                color="default"
                              />
                            </Box>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {search.length >= 2 && filtered.length === 0 && !loading && (
          <Typography color="grey.400" sx={{ mt: 3, pl: 2 }}>Nessun giocatore trovato.</Typography>
        )}

        {/* Menu per selezionare le colonne */}
        <Popover
          open={Boolean(columnMenuAnchor)}
          anchorEl={columnMenuAnchor}
          onClose={handleColumnMenuClose}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'left',
          }}
        >
          <List sx={{ py: 1, minWidth: 200 }}>
            {/* Colonne dati giocatori */}
            {filtered.length > 0 && Object.keys(filtered[0]).map(column => (
              <ListItem key={column} sx={{ py: 0.5 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={visibleColumns[column] || false}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleColumnVisibilityChange(column, e.target.checked)}
                      size="small"
                    />
                  }
                  label={column}
                  sx={{ width: '100%', fontSize: 14 }}
                />
              </ListItem>
            ))}
            
            {/* Separatore */}
            {filtered.length > 0 && (
              <ListItem sx={{ py: 0, borderTop: '1px solid #e0e0e0', mt: 1, pt: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Colonne Speciali
                </Typography>
              </ListItem>
            )}
            
            {/* Colonne speciali */}
            {Object.keys(visibleSpecialColumns).map(specialColumn => (
              <ListItem key={specialColumn} sx={{ py: 0.5 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={visibleSpecialColumns[specialColumn]}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleSpecialColumnVisibilityChange(specialColumn, e.target.checked)}
                      size="small"
                    />
                  }
                  label={specialColumn}
                  sx={{ width: '100%', fontSize: 14 }}
                />
              </ListItem>
            ))}
          </List>
        </Popover>
        </Box>
      )}
    </Box>
  );
}

export default App;
