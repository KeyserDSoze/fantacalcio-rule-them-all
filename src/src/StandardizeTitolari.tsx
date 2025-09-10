
import React, { useState } from 'react';
import Navbar from './Navbar';

// Levenshtein distance for fuzzy matching
function levenshtein(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix = Array.from({ length: an + 1 }, () => Array(bn + 1).fill(0));
  for (let i = 0; i <= an; i++) matrix[i][0] = i;
  for (let j = 0; j <= bn; j++) matrix[0][j] = j;
  for (let i = 1; i <= an; i++) {
    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[an][bn];
}

function normalizeName(name: string) {
  return name
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^a-zàèéìòùç\s]/gi, '')
    .trim();
}

function csvToArray(csv: string) {
  const lines = csv.trim().split(/\r?\n/);
  const header = lines[0].split(',');
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const obj: any = {};
    header.forEach((h, i) => (obj[h.trim()] = values[i]?.trim() || ''));
    return obj;
  });
}

function arrayToCsv(arr: any[], header: string[]) {
  const rows = arr.map(obj => header.map(h => obj[h] || '').join(','));
  return [header.join(','), ...rows].join('\r\n');
}

const StandardizeTitolari: React.FC = () => {
  const [resultCsv, setResultCsv] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStandardize = async () => {
    setLoading(true);
    setError(null);
    try {
      // Carica entrambi i file CSV
      const [playersRes, titolariRes] = await Promise.all([
        fetch('/players_Tutti_2025-09-10 00_00.csv'),
        fetch('/titolari.csv'),
      ]);
      const [playersCsv, titolariCsv] = await Promise.all([
        playersRes.text(),
        titolariRes.text(),
      ]);
      const playersArr = csvToArray(playersCsv);
      const titolariArr = csvToArray(titolariCsv);


      // Per ogni titolare, cerca il nome più simile tra i giocatori della stessa squadra
      const newTitolari = titolariArr.map(t => {
        const squadraTitolare = (t['Squadra'] || t['Squadra, Nome Giocatore'] || '').toLowerCase().replace(/\s+/g, ' ').trim();
        const nomeTitolare = normalizeName(t['Nome Giocatore'] || t['Nome'] || '');
        // Filtra solo i giocatori della stessa squadra
        const candidates = playersArr.filter(p =>
          (p['Squadra'] || '').toLowerCase().replace(/\s+/g, ' ').trim() === squadraTitolare
        );
        let bestMatch = null;
        let bestScore = Infinity;
        candidates.forEach(p => {
          const nomePlayer = normalizeName(p['Nome']);
          const score = levenshtein(nomeTitolare, nomePlayer);
          if (score < bestScore) {
            bestScore = score;
            bestMatch = p['Nome'];
          }
        });
        // Soglia di similarità: accetta solo se la distanza è ragionevole (<=2 o match esatto)
        const useMatch = bestMatch && (bestScore <= 2 || nomeTitolare === normalizeName(bestMatch));
        return {
          ...t,
          'Nome Giocatore': useMatch ? bestMatch : (t['Nome Giocatore'] || t['Nome']),
        };
      });

      // Ricostruisci il CSV
      const header = Object.keys(newTitolari[0]);
      setResultCsv(arrayToCsv(newTitolari, header));
    } catch (e) {
      setError('Errore durante la standardizzazione.');
    }
    setLoading(false);
  };

  const handleDownload = () => {
    if (!resultCsv) return;
    const blob = new Blob([resultCsv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'titolari_standard.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Navbar />
      <div style={{ padding: 24, paddingTop: 64 }}>
        <h2>Standardizza nomi titolari</h2>
        <button onClick={handleStandardize} disabled={loading}>
          {loading ? 'Elaborazione...' : 'Standardizza e genera CSV'}
        </button>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {resultCsv && (
          <div style={{ marginTop: 16 }}>
            <button onClick={handleDownload}>Scarica CSV standardizzato</button>
          </div>
        )}
      </div>
    </>
  );
};

export default StandardizeTitolari;
