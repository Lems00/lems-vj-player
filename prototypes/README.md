# Lems VJ Player — essais techniques (étape 2 du plan)

Cinq essais pour vérifier, **sur vos vrais appareils**, ce qui pourrait bloquer l'application avant d'écrire la vraie. Le code ici est **jetable** : il sert à mesurer, pas à être livré.

| Essai | Question posée | Appareils |
|---|---|---|
| 1 · Quatre lecteurs YouTube | Quatre lecteurs officiels tiennent-ils ensemble ? Quelles vitesses proposent-ils (SYNC possible ou non) ? Avec quelle précision donnent-ils la position ? | Mac, PC, Android |
| 2 · Deux sorties son | Peut-on jouer en même temps sur les enceintes et sur le casque, avec quelle latence ? | Mac, PC (Android si possible) |
| 3 · Découverte et appairage | Les appareils trouvent-ils la console sur le Wi-Fi ? L'appairage par code fonctionne-t-il ? Quel aller-retour ? | 1 console (Mac ou PC) + 1 appareil |
| 4 · Deuxième écran | La fenêtre de sortie s'ouvre-t-elle en plein écran sur le projecteur ? | Mac ou PC + écran externe |
| 5 · Écran synchronisé | Un deuxième appareil peut-il lire la même vidéo, calé sur la console ? Avec quel écart ? | 1 console + 1 écran |

Chaque essai affiche un **rapport** : bouton « Copier le rapport », puis collez-le dans la conversation avec ce que vous avez vu et entendu.

## Ce qui a déjà été vérifié (dans le cloud, sans vos appareils)

- **Le cœur commun** (`core/`) : 26 tests automatiques, tous verts, relancés 10 fois sans échec.
  - **protocole** des messages ;
  - **appairage** par code à 6 chiffres (SPAKE2 : le code n'est jamais envoyé), avec mauvais code détecté des deux côtés et code changé après 3 erreurs ;
  - **chiffrement** des échanges (rejeu et modification refusés) ;
  - **écart d'horloge** (méthode NTP, filtrage des mesures bruitées) ;
  - **connexion réelle** console ↔ appareils sur la même machine, plusieurs appareils compris ;
  - **découverte mDNS**.
- **L'application** (`app/`) : le code Rust se compile pour **Windows** sans erreur ni avertissement de l'outil de contrôle.
- **Les pages des 5 essais** : 45 vérifications automatiques passent, avec un **faux lecteur YouTube** et une **fausse application**. Cela prouve que la logique des pages fonctionne, pas que YouTube ou le son se comportent comme prévu.

**Pas encore vérifié, et c'est l'objet de vos essais :**
- le vrai YouTube (bloqué dans le cloud) ;
- le vrai son (aucune carte son dans le cloud) ;
- la compilation sur **Mac** et **Android** (les outils Apple et Android ne sont pas disponibles dans le cloud) ;
- le Wi-Fi réel entre plusieurs appareils.

## Contenu

```
prototypes/
├── core/                 cœur commun en Rust (protocole, appairage, chiffrement, horloge, réseau)
└── app/                  application d'essai (Tauri 2)
    ├── ui/               les pages des essais (HTML + JavaScript, sans outil de compilation)
    └── src-tauri/        la partie Rust : son (cpal), réseau (lems-core), écrans
```

## Le plus simple : télécharger les applications toutes prêtes

GitHub compile l'application d'essai pour Mac, Windows et Android à chaque modification des essais. Pour lancer une compilation à la main : onglet **Actions** du dépôt → « Essais — compilation » → **Run workflow**.

1. Ouvrez la dernière compilation réussie (coche verte) dans l'onglet **Actions**.
2. En bas de la page, section **Artifacts**, téléchargez `essais-mac`, `essais-windows` ou `essais-android`. Ils restent disponibles 30 jours.

Les applications **ne sont pas signées** : la signature viendra à l'étape 6 du plan. D'où les avertissements suivants au premier lancement.

- **Mac** (processeurs Apple et Intel) : décompressez, puis glissez « Lems VJ Essais » dans Applications. Au premier lancement, macOS refuse d'ouvrir l'application : allez dans **Réglages Système → Confidentialité et sécurité**, puis cliquez sur **Ouvrir quand même**. Ou bien, dans le Terminal :

```bash
xattr -dr com.apple.quarantine "/Applications/Lems VJ Essais.app"
```

- **Windows** : lancez l'installateur. Si SmartScreen affiche « Windows a protégé votre ordinateur », cliquez sur **Informations complémentaires**, puis sur **Exécuter quand même**.
- **Android** (téléphones et tablettes 64 bits, soit presque tous les modèles depuis 2017) : copiez le fichier `.apk` sur l'appareil et ouvrez-le. Android demandera d'autoriser l'installation depuis cette source.

La suite de ce document sert à compiler vous-même, si vous le préférez.

## Préparer chaque système (une seule fois)

Il faut d'abord **Node.js 20 ou plus récent** (https://nodejs.org) et **Rust** (https://rustup.rs).

**Mac** : les outils de développement d'Apple.

```bash
xcode-select --install
```

**Windows** : installez « Microsoft C++ Build Tools » avec la charge de travail « Développement Desktop en C++ ». WebView2 est déjà présent sur Windows 10 et 11.

**Android** : Android Studio, avec dans le SDK Manager le SDK Android, le NDK et les « Command-line Tools ». Définissez `JAVA_HOME` (le JDK fourni avec Android Studio convient), `ANDROID_HOME` et `NDK_HOME`. Puis :

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

Guide officiel, à jour : https://v2.tauri.app/start/prerequisites/

## Lancer

Sur Mac ou Windows :

```bash
cd prototypes/app
```

```bash
npm install
```

```bash
npm run dev
```

La première compilation prend plusieurs minutes. Ensuite, la fenêtre « Lems VJ Player — essais » s'ouvre sur le menu des essais.

Sur Android, avec le téléphone branché en USB et le mode développeur activé :

```bash
npm run android:init
```

```bash
npm run android:dev
```

Pour faire tourner les tests du cœur sur votre machine (le dernier teste la découverte sur votre vrai réseau) :

```bash
cd prototypes/core && cargo test && cargo test -- --ignored
```

**Autorisations à accepter :** sur Mac, « Autoriser Lems VJ Essais à trouver des appareils sur votre réseau local » ; sur Windows, l'accès du pare-feu sur les **réseaux privés**.

## Déroulé de chaque essai

### 1 · Quatre lecteurs YouTube
1. Cliquez sur « Charger les 4 lecteurs », puis « Tout lancer », puis « Lancer les mesures » (20 s environ).
2. Recommencez avec le bouton « Rouvrir cette page en http://localhost (variante B) ». YouTube peut refuser une page selon son adresse : on compare les deux.
3. Faites l'essai aussi **dans Chrome sur Android**. Le menu des essais s'ouvre dans n'importe quel navigateur avec `npm run pages`, à l'adresse indiquée.

Le verdict « pas de SYNC sur YouTube » apparaît si le lecteur refuse la vitesse 1,05×. Notez aussi toute **erreur 150, 101 ou 153** (vidéo non intégrable, ou adresse refusée).

### 2 · Deux sorties son
1. **Baissez le volume.** Choisissez la sortie principale et le casque (idéalement deux périphériques différents), puis « Lancer les deux sons ».
2. Vous devez entendre un **grave dans les enceintes** et un **aigu dans le casque**. Cochez ce que vous entendez.
3. Recommencez avec un tampon de 128, puis de 1024. Notez la latence affichée et les craquements éventuels.

### 3 · Découverte et appairage
1. Sur la console (Mac ou PC) : « Cet appareil est la console ». Un code à 6 chiffres s'affiche.
2. Sur l'autre appareil : « Cet appareil se connecte », puis « Chercher les consoles », saisissez le code, et « Se connecter ».
3. Essayez aussi un **mauvais code**, trois fois de suite : le code de la console doit changer.
4. Laissez tourner 1 minute, puis copiez le rapport **des deux côtés**.

### 4 · Deuxième écran
1. Branchez l'écran ou le projecteur en mode **étendu** (pas en recopie), puis « Actualiser ».
2. Choisissez l'écran externe, puis « Ouvrir la sortie ». Les **quatre coins** de la mire doivent être visibles, et la résolution affichée doit être celle de l'écran.
3. Vérifiez que la console reste utilisable sur l'écran principal. Échap ferme la sortie.

### 5 · Écran synchronisé
1. Sur la console : « Cet appareil est la console ». Sur l'écran : « Cet appareil est un écran », puis la recherche, le code, et la connexion.
   Si la recherche ne trouve rien, recopiez sur l'écran l'adresse affichée par la console (par exemple `ws://192.168.1.20:48700`). Si la console est un PC Windows, autorisez d'abord « Lems VJ Essais » en réseau **privé** dans le pare-feu.
2. Sur la console : « Lancer la lecture synchronisée ». Les deux appareils lisent la même vidéo.
3. Filmez les deux **mires** côte à côte pendant 10 s avec un téléphone. L'écart se lit image par image sur la vidéo.
4. Après 60 s, copiez le rapport **des deux côtés** : l'écran donne son écart à la console, la console donne son propre retard sur l'horloge (pour information : depuis la v10, les écrans suivent la lecture réelle de la console).

## Feuille de résultats (à me renvoyer)

| Essai | Mac | PC Windows | Android |
|---|---|---|---|
| Modèle et version du système | | | |
| 1 · 4 lecteurs se chargent (variante A / B) | | | |
| 1 · Vitesses proposées, verdict SYNC | | | |
| 2 · Grave enceintes / aigu casque / craquements | | | |
| 2 · Latence au tampon 256 | | | |
| 3 · Console trouvée par la recherche ? Temps d'appairage, aller-retour | | | |
| 4 · Sortie plein écran sur le bon écran ? | | | |
| 5 · Écart médian, écart vu sur la vidéo des mires | | | |

## Limites connues, prévues par les essais

- **Android, découverte Wi-Fi :** Android filtre le multicast sans autorisation particulière (« multicast lock », à ajouter en code Android natif). Si la recherche ne trouve rien, saisissez l'adresse `ws://…:48700` affichée sur la console. L'appairage et la suite fonctionnent pareil.
- **Android, deuxième écran :** l'application ne voit qu'un écran. Une vraie sortie séparée sur HDMI ou USB-C demandera un module Android natif, prévu après les essais.
- **Android, son :** la bibliothèque audio utilise le NDK. Si la compilation Android échoue sur cette partie, dites-le-moi.
- **YouTube :** un lecteur doit mesurer au moins 200 × 200 px (règle YouTube), d'où des lecteurs de 356 × 200 dans l'essai 1.
- **Versions :** Tauri 2.12.3 et cpal 0.15, choisies pour leur recul (plus de deux semaines).
