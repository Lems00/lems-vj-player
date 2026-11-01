# Lems VJ Player — plan de l'application (Mac, Windows, Android)

Statut : **plan validé dans ses grandes lignes** (décisions en section 5, deux points encore ouverts). Étape 1 (maquettes des vues) : validée le 1er novembre 2026. Aucun code écrit.
Emplacement prévu du projet : `/Volumes/LEMSSD/Claude/Vibecoding/lems-vj-player/`
Design system : https://claude.ai/artifact/XXxqwrzgihY5hSLKj1DRG1

## 0. Le point qui décide de tout : les règles de YouTube

Source : YouTube API Services — Developer Policies, section III.I
(https://developers.google.com/youtube/terms/developer-policies).

- Règle 6 : interdiction de *modifier, compléter ou bloquer une partie ou une fonction du lecteur YouTube*.
- Règle 7 : interdiction de *séparer, isoler ou modifier la piste audio ou vidéo* d'un contenu YouTube.

Conséquences pour un morceau YouTube :

- **Autorisé** : lire, mettre en pause, se déplacer, régler le volume de chaque lecteur. Mixer au volume et au crossfader.
- **Interdit** : égaliseur, gain et filtres sur le son ; son au casque séparé de la vidéo ; extraction des flux (contraire aux conditions de YouTube, refus des boutiques).
- **Zone grise, à faire valider par un juriste** : fondu d'une image YouTube par-dessus une autre. Par défaut : coupe franche.
- **Quota** : l'accès gratuit à l'API permet environ 100 recherches par jour pour toute l'application (10 000 unités, 100 par recherche). Au-delà : demande de hausse à Google, avec audit.

Recommandation — **deux sources** :

- **YouTube** via le lecteur officiel : mixage au volume, vidéo telle quelle, égaliseur grisé avec explication.
- **Fichiers de l'utilisateur** (MP3, MP4 qu'il possède) : moteur complet — égaliseur, gain, casque séparé, fondus vidéo, effets.

## 1. « Interconnectable et interopérable » (proposition)

- **Réseau local sans configuration** : découverte automatique sur le Wi-Fi, appairage par QR code ou code à 6 chiffres, connexion chiffrée.
- **Rôles** : Console (moteur et son), Contrôleur (ex. tablette Android en surface de mixage), Écran (ex. PC branché au vidéoprojecteur), Bibliothèque (préparer ses playlists sur téléphone).
- **Des commandes plutôt que de la vidéo** : chaque appareil Écran lit lui-même la vidéo, calé sur l'horloge de la Console. Léger, conforme aux règles de YouTube.
- **Interopérable** : protocole ouvert, documenté et versionné ; mêmes données sur les trois systèmes (playlists, points de repère, export M3U) ; contrôleurs DJ MIDI plus tard.
- **Sans Internet** : tout fonctionne en local, sauf la recherche YouTube. Synchronisation cloud entre lieux : plus tard, en option.

## 2. Architecture recommandée

- **Tauri 2 + React** : une base de code pour macOS, Windows et Android (iOS possible plus tard). Réutilise les composants du design system. Applications légères.
- **Briques** : interface (design system) ; moteur audio natif pour les fichiers locaux (égaliseur, deux sorties séparées enceintes / casque) ; lecteurs YouTube officiels ; service réseau (découverte, appairage, commandes) ; base locale (bibliothèque, playlists, repères).
- **Sortie vidéo** : sur ordinateur, deuxième fenêtre plein écran sur le projecteur ; sur Android, écran externe HDMI / USB-C, ou envoi vers un appareil Écran.
- **Écartés** : Electron (pas d'Android), Flutter (réécrire les composants), React Native (bureau moins mûr).
- **Risques à vérifier en premier** : quatre lecteurs YouTube simultanés sur Android ; latence audio Android ; deux sorties audio séparées sur les trois systèmes.

## 3. Étapes (chacune commence par des maquettes validées)

0. **Cadrage** : décisions (section 5), validation juridique YouTube, compte Google Cloud et quota.
1. **Maquettes de toutes les vues** : console ordinateur, téléphone Android contrôleur, tablette console compacte, écran de sortie, appairage, bibliothèque, réglages audio.
2. **Prototypes d'essai jetables** pour les risques de la section 2 → rapport : on continue ou on ajuste.
3. **Version 1 ordinateur (Mac, Windows)** : 4 platines, YouTube et fichiers locaux, casque, deuxième écran, bibliothèque.
4. **Version 1 Android.**
5. **Interconnexion** : appairage, contrôleur à distance, écrans synchronisés, bibliothèque partagée.
6. **Distribution** : signature Apple (99 $/an), certificat Windows, Google Play (25 $ une fois), mises à jour automatiques, compilation automatique des trois versions.
7. **Tests et bêta** : plusieurs modèles d'appareils, essais en conditions réelles (soirée de 4 h, coupure du Wi-Fi).

Pas de durées avant l'étape 2 : elles dépendent des prototypes.

## 4. Où vivra le code

Dans un dossier dédié, `/Volumes/LEMSSD/Claude/Vibecoding/lems-vj-player/`, et dans un dépôt dédié (à créer). Pas dans `imgam-project`.

## 5. Décisions

Validé le 1er novembre 2026 :

1. **YouTube : deux sources** — YouTube via le lecteur officiel, et les fichiers de l'utilisateur avec le moteur complet.
2. **Android en version 1 : contrôleur et écran.** La console complète sur Android viendra ensuite.
3. **iOS : prévu plus tard.** Tauri 2 le permet sans changer d'architecture.
4. **Design system** : renommé « Lems VJ Player », aperçus en deux cartes par ligne — enregistré.

Encore ouvert :

5. **Distribution** : boutiques (App Store, Microsoft Store, Google Play) ou téléchargement direct ?
6. **Dépôt** pour le code (à créer).

## Maquettes

- `maquettes/1-console.png` — écran Console
- `maquettes/2-fondations.png` — couverture, couleurs, typographie
- `maquettes/3-composants.png` — les 14 composants
- `maquettes/4-apercus-deux-colonnes.png` — aperçus Deck et VideoMonitor en deux cartes par ligne

### Maquettes des vues (étape 1)

- `maquettes/vues/1-console.png` — console ordinateur, platines YouTube et fichier
- `maquettes/vues/2-bibliotheque.png` — bibliothèque
- `maquettes/vues/3-reglages.png` — réglages son et vidéo
- `maquettes/vues/4-appairage.png` — appairage des appareils
- `maquettes/vues/5-android-telephone.png` — téléphone : connexion et contrôleur
- `maquettes/vues/6-android-tablette.png` — tablette en contrôleur
- `maquettes/vues/7-ecrans-sortie.png` — écrans de sortie

Constats tirés des maquettes, à confirmer par les prototypes (étape 2) :

- Platine YouTube : pas de gain, d'égaliseur, de casque séparé ni de fondu vidéo (règles YouTube).
- Platine YouTube : pas de forme d'onde, de BPM ni de tonalité automatiques — l'application n'a pas accès au son. BPM saisi au tap.
- Platine YouTube : le lecteur officiel ne propose a priori que des vitesses par paliers (0,25× … 2×) → pas de réglage fin du tempo, donc pas de SYNC. À vérifier.
- Sortie vidéo YouTube : logo et publicités YouTube possibles devant le public, interdiction de les bloquer.
- Éléments d'interface nouveaux, à ajouter au design system après validation : onglets de navigation, tableau, menu déroulant, interrupteur, sélecteur segmenté, fenêtre de dialogue, QR code, cadre d'appareil.

### Nouveaux composants du design system (validés et enregistrés le 1er novembre 2026)

- `maquettes/5-nouveaux-composants.png` — AppBar, Select, TextField / CodeInput, Toggle, SegmentedControl, Notice, PairingCode, Dialog, Table, DeviceRow.
- Règle confirmée : la couleur ne dit que « quelle platine » ou « à l'antenne ». Les états d'erreur et de connexion sont neutres : contour `ink` et symbole « ! » pour une erreur, point plein `ink` = connecté, point creux = déconnecté, « ! » = instable. Le point vert des maquettes des vues a été remplacé en conséquence.
- Enregistrés dans le design system : AppBar, Select, TextField, CodeInput, Toggle, SegmentedControl, Notice, PairingCode, Dialog, Table, DeviceRow, StatusDot (26 composants au total), plus l'option `source="youtube"` sur Deck et ChannelStrip, et l'écran Console aligné sur la vue 1.

### Étape 2 — essais techniques (écrits le 1er novembre 2026, à lancer sur vos appareils)

- Dossier `prototypes/` : cœur commun en Rust (`core/`) et application d'essai Tauri (`app/`). Mode d'emploi et feuille de résultats : `prototypes/README.md`.
- Vérifié dans le cloud : 22 tests du cœur (appairage SPAKE2, chiffrement, horloge, connexion réelle, découverte mDNS), compilation Windows sans erreur, 35 vérifications des pages avec doublures.
- Reste à faire sur appareils : vrai YouTube, vrai son, compilation Mac et Android, Wi-Fi réel.
- Deux défauts trouvés et corrigés par les tests : l'appareil se croyait accepté avant que la console l'ait enregistré ; un mauvais code n'était pas compté si l'appareil coupait la connexion (essais illimités possibles).

### Résultats des essais sur Mac (MacBook, processeur Apple, 1er novembre 2026)

**Essai 1 — YouTube**
- **Fenêtre en `tauri://localhost` : YouTube refuse ses lecteurs (erreur 153).** Servie en `http://localhost`, la même page fonctionne. → **Décision : sur Mac, l'interface sera servie en `http://localhost`** (greffon localhost de Tauri). À vérifier sur Windows et Android, dont l'adresse par défaut est déjà en `http://`.
- 4 lecteurs simultanés : chargement en 0,6 à 1 s chacun, sans erreur.
- **Vitesse : pas de 0,05 seulement.** 1,05× est réellement jouée (1,050) ; 0,98× est arrondie à 0,95×. → **Pas de SYNC fin sur YouTube**, mais des sauts de tempo de ±5 % sont possibles. Les fichiers locaux gardent le réglage fin.
- Position : écart-type de 1 à 19 ms selon les passages.
- **Dérive** : de 0 à 250 ms de retard par 10 s selon la charge ; la vidéo la plus lourde (très haute définition) décroche à chaque passage. → recalages réguliers nécessaires entre platines et écrans ; limiter la qualité des platines non diffusées.
- Saut dans la vidéo (repère) : 0,25 à 0,7 s → préparer les repères à l'avance.

**Essai 1 — confirmation en v6 (fenêtre principale servie en `http://localhost`)**
- **YouTube joue dans la fenêtre principale** : plus d'erreur 153. Décision confirmée.
- **Pas de vitesse de 0,05, arrondi vers le bas** : 1,01 à 1,04 → 1,00 ; 1,06 → 1,05 ; 0,97 et 0,99 → 0,95 ; vitesses acceptées réellement jouées (1,0502). **Pas de SYNC fin sur YouTube, établi.**
- Saut vers un repère : 0,22 à 0,34 s. Écart-type de la position : 16 à 18 ms.
- **Probable : un changement de vitesse provoque un arrêt d'environ 0,2 s** (retard de 200 à 250 ms sur les 4 lecteurs juste après neuf changements de vitesse, alors que la vitesse mesurée à 1× est exacte). À confirmer à l'oreille ; si c'est le cas, éviter les changements de tempo sur une platine YouTube à l'antenne.

**Essai 2 — deux sorties son**
- Deux flux simultanés stables (une minute, aucune erreur, aucun craquement).
- Un MacBook n'a qu'une sortie pour ses haut-parleurs et sa prise casque : la pré-écoute demande un second appareil (carte son USB à deux sorties, ou casque USB / Bluetooth).
- Le Bluetooth ajoute environ 150 à 250 ms : inadapté à la pré-écoute d'un DJ.
- **v6 : deux sorties séparées confirmées sur Mac** — haut-parleurs du MacBook Pro (grave, sortie principale) et AirPods (aigu, casque) en même temps, sans erreur ni craquement, sur 4 passages (environ 70 s). Tampons : 10,7 ms sur les sorties intégrées (512 échantillons imposés), 5,3 ms sur les AirPods, plus la latence Bluetooth.
- **Défaut de la bibliothèque audio (cpal 0.15) sur Mac** : les sorties intégrées (« Écouteurs externes », « Haut-parleurs MacBook Pro ») qui ne sont pas la sortie par défaut renvoient « Invalid property value » à la lecture de leurs réglages, et étaient écartées. Correctif v6 : elles sont proposées et ouvertes en 48 kHz stéréo — **confirmé, elles fonctionnent**. À garder dans l'application, ou à remplacer par cpal 0.16 / CoreAudio direct si le défaut gêne ailleurs.

**Essai 4 — deuxième écran (v6)**
- Écran externe 1920 × 1080 (échelle 1) détecté à côté de l'écran du MacBook Pro (2880 × 1800, échelle 2).
- **La sortie s'ouvre bien sur l'écran externe**, en plein écran, en 0,1 s (constat visuel). Le rapport disait le contraire : la vérification lisait la position trop tôt, avant la fin de l'animation de macOS. v7 : vérification après l'animation, et placement en points de l'écran visé (écrans d'échelles différentes).

**Essai 3 — découverte et appairage (Mac console + PC Windows, v6)**
- **Premier échange réel entre deux appareils.** Console sur le Mac : démarrage en 20 ms, annonce Wi-Fi sans erreur. Le PC (« Win32 de test », 192.168.88.231) s'est appairé par code et reste connecté.
- **Aller-retour réseau : 4 ms.** Écart d'horloge PC ↔ Mac : −351 ms, mesuré et compensable (base de l'essai 5).
- **Côté PC (Windows 10, WebView2 / Edge 156)** : **découverte automatique réussie** (le PC trouve le Mac sur le Wi-Fi), **appairage accepté en 0,12 s**, aller-retour 4 ms sur 32 mesures, écart d'horloge −347 ms (−351 ms vu du Mac : cohérent à 4 ms près).
- Les autorisations « réseau local » de macOS et le pare-feu Windows n'ont rien bloqué.
- Pages servies en `http://tauri.localhost` sur Windows : YouTube devrait y fonctionner sans le détour `http://localhost` du Mac (à confirmer par l'essai 1 sur PC).
- Amélioration possible : la recherche dure toujours 4 s ; la faire s'arrêter dès qu'une console répond.
- Petit défaut : « Se connecter » avec une adresse vide affiche une erreur technique (« HTTP format error ») ; à remplacer par un message clair.

**Essai 5 — écran synchronisé (Mac console + PC écran, v6)**
- **YouTube joue directement sur Windows** (`http://tauri.localhost`), sans le détour du Mac.
- **Horloge** : le PC estime l'heure de la console de façon stable (écart −331 ms, aller-retour 3 ms, 32 mesures).
- **Écart vidéo côté PC : constant, 139 à 140 ms** sur 72 mesures, 3 corrections. Un écart fixe est un défaut de calage, pas d'instabilité : la première méthode anticipait les sauts d'une durée fixe (0,25 s) et ne corrigeait qu'au-delà de 150 ms.
- **Côté Mac (console, qui lit aussi la vidéo)** : la correction s'emballait (10 sauts en 16 s) — chaque saut prend 0,25 à 0,35 s, la mesure suivante voyait encore un écart et relançait un saut.
- **v8** : rattrapage doux à 1,05× / 0,95× pour les écarts de 30 ms à 1,5 s ; saut seulement au-delà, avec une anticipation apprise ; stabilisation après chaque saut. Simulation d'un lecteur décalé de 140 ms au pas de vitesse YouTube : écart ramené à 1 ms (médiane) en 2,8 s, un seul rattrapage. **À confirmer sur vos appareils.**
- **v8** : un appareil qui se reconnecte remplace son ancienne connexion (le PC était connecté 3 fois) ; la recherche s'arrête 0,6 s après la première console trouvée (au lieu de 4 s).
