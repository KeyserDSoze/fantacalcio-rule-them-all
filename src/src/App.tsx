
import React, { useEffect, useState } from 'react';
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
  ListItem
} from '@mui/material';

type Player = { [key: string]: string };
type Titolare = { [key: string]: string };
type PlayerStatus = 'mia' | 'altra' | null;

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
  const [players, setPlayers] = useState<Player[]>([]);
  const [titolari, setTitolari] = useState<Titolare[]>([]);
  const [incroci, setIncroci] = useState<any[]>([]);
  const [incrociHeader, setIncrociHeader] = useState<string[]>([]);
  const [tiers, setTiers] = useState<any[]>([]);
  const [infortuni, setInfortuni] = useState<any[]>([]);
  const [annoScorso, setAnnoScorso] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filtered, setFiltered] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playerStatus, setPlayerStatus] = useState<{ [key: string]: PlayerStatus }>({});
  const [selectedRole, setSelectedRole] = useState<string>('Tutti');
  const [showOnlyFree, setShowOnlyFree] = useState<boolean>(false);
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

  // Carica lo stato dei giocatori dal localStorage
  useEffect(() => {
    const saved = localStorage.getItem('playerStatus');
    if (saved) {
      setPlayerStatus(JSON.parse(saved));
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
    setPlayerStatus(newStatus);
    localStorage.setItem('playerStatus', JSON.stringify(newStatus));
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
    const lastYearPlayer = annoScorso.find(p => 
      p.Nome?.toLowerCase().trim() === player.Nome?.toLowerCase().trim()
    );
    
    if (!lastYearPlayer) return null;
    
    const presenze = parseInt(lastYearPlayer.Pv) || 0;
    const wasTitolare = presenze > 20;
    const hasChangedTeam = lastYearPlayer.Squadra?.toLowerCase().trim() !== player.Squadra?.toLowerCase().trim();
    
    // Differenzia le statistiche in base al ruolo
    let stats = '';
    if (player.Ruolo === 'Portiere') {
      // Per i portieri: Goal Subiti / Rigori Parati / Autogoal / Ammonizioni / Espulsioni
      stats = `${lastYearPlayer.Gs || 0}/${lastYearPlayer.Rp || 0}/${lastYearPlayer.Au || 0}/${lastYearPlayer.Amm || 0}/${lastYearPlayer.Esp || 0}`;
    } else {
      // Per gli altri ruoli: Goal Fatti / Assist / Rigori + / Rigori -  / Ammonizioni / Espulsioni
      stats = `${lastYearPlayer.Gf || 0}/${lastYearPlayer.Ass || 0}/${lastYearPlayer['R+'] || 0}/${lastYearPlayer['R-'] || 0}/${lastYearPlayer.Amm || 0}/${lastYearPlayer.Esp || 0}`;
    }
    
    return {
      wasTitolare,
      hasChangedTeam,
      fantamedia: lastYearPlayer.Fm || '-',
      stats: stats,
      presenze: presenze,
      oldTeam: lastYearPlayer.Squadra,
      ruolo: player.Ruolo
    };
  };

  // Funzione per chiudere il menu delle colonne
  const handleColumnMenuClose = () => {
    setColumnMenuAnchor(null);
  };

  // Funzioni per assegnare giocatori
  const assignToMyTeam = (playerKey: string) => {
    const newStatus = { ...playerStatus, [playerKey]: 'mia' as PlayerStatus };
    savePlayerStatus(newStatus);
  };

  const assignToOtherTeam = (playerKey: string) => {
    const newStatus = { ...playerStatus, [playerKey]: 'altra' as PlayerStatus };
    savePlayerStatus(newStatus);
  };

  const removePlayerAssignment = (playerKey: string) => {
    if (window.confirm('Vuoi davvero liberare questo giocatore?')) {
      const newStatus = { ...playerStatus };
      delete newStatus[playerKey];
      savePlayerStatus(newStatus);
    }
  };

  const clearAllPlayers = () => {
    if (window.confirm('Vuoi davvero liberare TUTTI i giocatori? Questa azione non può essere annullata.')) {
      savePlayerStatus({});
    }
  };

  const getPlayerKey = (player: Player) => `${player.Nome}_${player.Squadra}`;

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
      const playerKey = `${titolare['Nome Giocatore']}_${titolare['Squadra']}`;
      const status = playerStatus[playerKey];
      
      // Trova il giocatore per ottenere la squadra e il tier
      const player = players.find(p => 
        p.Nome.toLowerCase() === titolare['Nome Giocatore']?.toLowerCase() && 
        p.Squadra.toLowerCase() === titolare['Squadra']?.toLowerCase()
      );
      
      if (player) {
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

  // Calcola le statistiche dei giocatori presi da me
  const getMyTeamStats = () => {
    const myPlayers = players.filter(player => {
      const playerKey = getPlayerKey(player);
      return playerStatus[playerKey] === 'mia';
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
  };

  const myTeamStats = getMyTeamStats();

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

  useEffect(() => {
    const baseUrl = import.meta.env.BASE_URL;
    Promise.all([
      fetch(`${baseUrl}players_Tutti_2025-09-10 00_00.csv`).then(res => res.text()),
      fetch(`${baseUrl}titolari_standard.csv`).then(res => res.text()).catch(() => ''),
      fetch(`${baseUrl}incroci.csv`).then(res => res.text()).catch(() => ''),
      fetch(`${baseUrl}tiers.csv`).then(res => res.text()).catch(() => ''),
      fetch(`${baseUrl}infortuni.csv`).then(res => res.text()).catch(() => ''),
      fetch(`${baseUrl}anno_scorso_all.csv`).then(res => res.text()).catch(() => ''),
    ])
      .then(([playersText, titolariText, incrociText, tiersText, infortuniText, annoScorsoText]) => {
        setPlayers(parseCSV(playersText));
        setTitolari(titolariText ? parseCSV(titolariText) : []);
        const tiersData = tiersText ? parseCSV(tiersText) : [];
        setTiers(tiersData);
        setInfortuni(infortuniText ? parseCSV(infortuniText) : []);
        setAnnoScorso(annoScorsoText ? parseCSV(annoScorsoText) : []);
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
        setLoading(false);
      })
      .catch(() => {
        setError('Errore nel caricamento dei file CSV');
        setLoading(false);
      });
  }, []);

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
        const playerKey = getPlayerKey(p);
        return !playerStatus[playerKey]; // Non assegnato (né 'mia' né 'altra')
      });
    }
    
    setFiltered(filteredPlayers);
  }, [search, players, selectedRole, showOnlyFree, playerStatus]);

  function isTitolare(player: Player) {
    return titolari.some(
      t =>
        t['Nome Giocatore'] &&
        t['Nome Giocatore'].toLowerCase() === player.Nome.toLowerCase() &&
        t['Squadra'] &&
        t['Squadra'].toLowerCase() === player.Squadra.toLowerCase()
    );
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

  return (
    <Box sx={{ bgcolor: '#f5f5f5ff', minHeight: '80vh', width: '100%'  }}>
      <Box sx={{ width: '100%', margin: 0, padding: 0 }}>
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
                  const playerKey = getPlayerKey(player);
                  const status = playerStatus[playerKey];
                  const injury = getPlayerInjury(player);
                  
                  // Determina il colore di sfondo della riga
                  let rowBgColor = {};
                  if (injury) {
                    rowBgColor = { bgcolor: '#ffebee' }; // Sfondo rosso chiaro per infortunati
                  } else if (titolare) {
                    rowBgColor = { bgcolor: '#e3fcec' }; // Sfondo verde per titolari
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
                            <Chip 
                              label="Mia squadra" 
                              color="primary" 
                              size="small" 
                              onClick={() => removePlayerAssignment(playerKey)}
                              sx={{ cursor: 'pointer' }}
                            />
                          ) : status === 'altra' ? (
                            <Chip 
                              label="Altra squadra" 
                              color="secondary" 
                              size="small" 
                              onClick={() => removePlayerAssignment(playerKey)}
                              sx={{ cursor: 'pointer' }}
                            />
                          ) : (
                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                              <Button 
                                size="small" 
                                variant="contained" 
                                color="primary"
                                onClick={() => assignToMyTeam(playerKey)}
                                sx={{ fontSize: 10, minWidth: 'auto', px: 1 }}
                              >
                                Mia
                              </Button>
                              <Button 
                                size="small" 
                                variant="outlined" 
                                color="secondary"
                                onClick={() => assignToOtherTeam(playerKey)}
                                sx={{ fontSize: 10, minWidth: 'auto', px: 1 }}
                              >
                                Altra
                              </Button>
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
    </Box>
  );
}

export default App;
