# Lems VJ Player — application (version 1, ordinateur)

Console DJ/VJ à quatre platines YouTube, pour Mac et Windows. Étape 3 du plan
(`docs/plan.md`). Le design system « Lems VJ Player » est utilisé tel quel
(`src/design/lems.js`, `src/design/lems.css`, jetons dans `tokens.css`).

```
app/
├── index.html, output.html     la console et la fenêtre de sortie (deux pages)
├── src/
│   ├── design/                 design system vendorisé + accès typé (index.ts)
│   ├── engine.ts               4 platines, mixeur, ce qui part en sortie
│   ├── youtube.ts              lecteur officiel YouTube (IFrame API), liens collés
│   ├── follower.ts             suivi d'une lecture de référence (essais 5 et 6)
│   ├── search.ts               recherche (Data API v3, clé de l'utilisateur), oEmbed
│   ├── store.ts                réglages et bibliothèque (JSON), types
│   ├── Stage.tsx               la scène : les lecteurs, posés sur les moniteurs
│   ├── views/                  Console, Bibliothèque, Réglages
│   └── output/                 la fenêtre de sortie (deux lecteurs, préchargement)
├── src-tauri/                  partie native (son, réseau, écrans, fichiers)
└── tests/                      vérifications des pages avec doublures
```

## Ce que fait la version 1

- **Quatre platines YouTube** (lecteur officiel) : lecture, pause, repère, position, volume. Gain, égaliseur, casque séparé, SYNC et tempo sont grisés : règles de YouTube (sections III.I.6 et 7).
- **Mixeur** : volume par platine, crossfaders A/B et C/D (courbe au choix), master. Appliqué au volume de chaque lecteur.
- **Moniteurs** : deux prévisualisations et la sortie programme ; la platine la plus forte est à l'antenne. Les lecteurs ne sont jamais déplacés dans la page (ils rechargeraient) : la scène les pose sur l'emplacement voulu. Une platine chargée hors moniteur reste visible, en petit (356 × 200, minimum YouTube 200 × 200).
- **Recherche** : lien ou identifiant YouTube collé (sans clé ni quota) ; mots-clés avec une clé Data API v3 (100 recherches par jour, compteur affiché).
- **Bibliothèque** : historique des morceaux chargés, favoris, playlists, filtre, chargement sur A/B/C/D.
- **Réglages** : sorties son (pour les fichiers locaux à venir ; « Tester » joue un son d'essai), latence, courbe du crossfader, écran de sortie, plein écran, titre à l'écran, clé YouTube et quota, appareils (code d'appairage, adresse), à propos.
- **Fenêtre de sortie** : plein écran sur l'écran choisi, deux lecteurs muets (le son vient de la console) : l'un suit la lecture réelle de la platine à l'antenne (méthode des essais 5 et 6), l'autre précharge la platine suivante pour une coupe franche sans attente. Échap la ferme.
- **Sur Mac**, l'interface est servie en `http://localhost:14870` : YouTube refuse ses lecteurs en `tauri://` (essai 1).

Pas encore : fichiers locaux (moteur son complet, casque séparé, fondus), contrôle à distance et écrans synchronisés sur d'autres appareils (étape 5), signature des applications (étape 6).

## Lancer sur sa machine

Prérequis : Node.js 22 et Rust (voir `prototypes/README.md` pour chaque système).

```bash
cd app
```

```bash
npm install
```

```bash
npm run app:dev
```

Compiler une application installable : `npm run app:build`. La compilation automatique (GitHub Actions, « Application — compilation ») fournit les fichiers Mac et Windows à chaque changement sur `main`.

## Vérifier

```bash
npm run build && npm test
```

46 vérifications des trois vues et de la fenêtre de sortie, avec un faux lecteur YouTube et une fausse application : elles prouvent la logique des pages, pas le comportement du vrai YouTube. Côté Rust : `cargo check` dans `src-tauri/` (Windows : `--target x86_64-pc-windows-msvc`).

## Clé YouTube

Console Google Cloud → projet → activer « YouTube Data API v3 » → Identifiants → clé d'API, à coller dans Réglages → YouTube. La clé reste sur l'ordinateur (dossier de données de l'application).
