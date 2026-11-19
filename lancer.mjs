// Démarre Ondi en arrière-plan s'il ne tourne pas déjà, puis ouvre la page (Windows, Mac, Linux).
//   node lancer.mjs                    → démarre si besoin + ouvre le navigateur
//   node lancer.mjs --sans-navigateur  → démarre seulement (démarrage de l'ordinateur)
//   node lancer.mjs --arreter          → arrête le serveur (proprement : les téléchargements reprendront)
//   node lancer.mjs --redemarrer       → attend l'arrêt du serveur en cours puis le relance (mise à jour)
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RACINE = path.dirname(fileURLToPath(import.meta.url));
const DONNEES = process.env.DEBRIDEUR_DONNEES || path.join(RACINE, 'donnees');
let port = 8097;
try {
  port = JSON.parse(fs.readFileSync(path.join(DONNEES, 'config.json'), 'utf8')).port || port;
} catch {}
port = Number(process.env.DEBRIDEUR_PORT) || port;
const adresse = `http://localhost:${port}`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export async function enLigne() {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/ping`, { signal: AbortSignal.timeout(1500) });
    return (await r.json()).app === 'debrideur';
  } catch {
    return false;
  }
}

export async function demarrer() {
  if (await enLigne()) return true;
  fs.mkdirSync(DONNEES, { recursive: true });
  const fichierJournal = path.join(DONNEES, 'debrideur.log');
  try {
    if (fs.statSync(fichierJournal).size > 5e6) fs.renameSync(fichierJournal, `${fichierJournal}.ancien`);
  } catch {}
  const sortie = fs.openSync(fichierJournal, 'a');
  const p = spawn(process.execPath, [path.join(RACINE, 'src', 'serveur.mjs')], {
    cwd: RACINE,
    detached: true,
    stdio: ['ignore', sortie, sortie],
    windowsHide: true,
  });
  p.unref();
  for (let i = 0; i < 60; i++) {
    await pause(250);
    if (await enLigne()) return true;
  }
  return false;
}

// Processus qui écoute sur le port (dernier recours si l'arrêt propre ne répond pas).
function pidDuPort() {
  try {
    if (process.platform === 'win32') {
      const sortie = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' });
      return sortie
        .split('\n')
        .map((l) => l.trim().split(/\s+/))
        .find((c) => c[1]?.endsWith(`:${port}`) && c[3] === 'LISTENING')?.[4];
    }
    return execFileSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).trim().split('\n')[0];
  } catch {
    return null;
  }
}

async function arreter() {
  if (!(await enLigne())) return console.log('Ondi ne tournait pas.');
  try {
    await fetch(`http://127.0.0.1:${port}/api/arreter`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(3000) });
  } catch {}
  for (let i = 0; i < 20 && (await enLigne()); i++) await pause(250);
  if (await enLigne()) {
    const pid = pidDuPort();
    if (pid) {
      if (process.platform === 'win32') execFileSync('taskkill', ['/PID', pid, '/F']);
      else process.kill(Number(pid), 'SIGTERM');
    }
  }
  console.log('Ondi arrêté.');
}

function ouvrirNavigateur() {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', adresse]] : process.platform === 'darwin' ? ['open', [adresse]] : ['xdg-open', [adresse]];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch {}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--arreter')) await arreter();
  else {
    if (process.argv.includes('--redemarrer')) {
      // Le serveur qui s'arrête libère le port en une à deux secondes.
      for (let i = 0; i < 80 && (await enLigne()); i++) await pause(250);
    }
    const ok = await demarrer();
    if (!ok) {
      console.error(`Ondi n'a pas démarré : regarde ${path.join(DONNEES, 'debrideur.log')}`);
      process.exit(1);
    }
    if (!process.argv.includes('--sans-navigateur')) ouvrirNavigateur();
    console.log(`Ondi en marche : ${adresse}`);
  }
}
