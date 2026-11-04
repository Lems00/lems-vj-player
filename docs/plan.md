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

**Essai 5 en v8 (PC console, Mac écran) : pas de connexion.** Le Mac ne trouve pas le PC (« Aucune console trouvée »), alors que le PC trouvait le Mac à l'essai 3. Cause probable : le pare-feu Windows bloque l'annonce et les connexions entrantes vers le PC. L'adresse saisie à la main contenait un point à la place des deux-points (`…231.48700`), d'où « failed to lookup address ».

- **v9** : la console affiche ses adresses (`ws://IP:48700`) sur la page de l'essai 5 et dans les rapports ; l'adresse saisie est corrigée (point au lieu des deux-points, sans `ws://`, sans port) ; la connexion abandonne après 8 s ; les erreurs disent la cause probable (adresse mal écrite, rien n'écoute, pare-feu, autre réseau, code) ; le rapport de l'écran garde la recherche et l'erreur de connexion.

**Essai 5 en v9 (Mac console + PC écran) : connexion réussie, premier écran synchronisé.**
- Connexion par la recherche automatique ; aller-retour 2 à 3 ms ; écart d'horloge −339 ms, identique des deux côtés à 0,3 ms près.
- **PC (écran) : écart médian de 4 ms avec l'horloge de la console** (p95 4 ms), 1 saut et 1 rattrapage doux au démarrage, puis plus rien. **Synchronisation fine atteinte.**
- **Mac (console, qui se corrigeait lui aussi sur son horloge) : 128 ms de retard médian** (p95 253 ms, max 425 ms), à 1,05× pendant 111 s sur 113 sans rattraper. Le lecteur du Mac perd du temps en continu (même constat qu'à l'essai 1 : jusqu'à 250 ms par 10 s selon la charge, arrêt d'environ 0,2 s à chaque changement de vitesse).
- Conséquence : les deux écrans étaient chacun près de leur cible, mais **décalés d'environ 130 ms entre eux**, parce que la cible (l'horloge théorique) n'était pas ce que la console jouait.
- **v10 : la console est la référence.** Elle ne se corrige plus ; elle diffuse sa position réelle deux fois par seconde (nouveau message `position` du protocole) ; les écrans suivent cette lecture réelle (médiane des 8 derniers relevés, remise à zéro si la console saute). Simulation d'une console en retard de 130 ms : l'écran prend le même retard (−125 ms sur l'horloge) et reste à 10 ms médian de la console. **À confirmer sur vos appareils, avec la vidéo des mires.**


**Essai 5 en v10 (Mac console + PC écran) : réussi.**
- **PC (écran) : 5 ms d'écart médian avec la lecture réelle du Mac** (p95 6 ms, max 6 ms), sur 411 mesures et 201 positions reçues ; aucun saut, 3 rattrapages doux au démarrage (13 s hors 1×), puis plus rien. **Objectif atteint : l'écran suit la console.**
- **Mac (console, sans correction) : lecture parfaitement régulière** — 600 à 602 ms de retard constant sur l'horloge théorique, sur 101 relevés. Ce retard fixe est le temps que met le lecteur du Mac à repartir après la mise en place (pause, puis lecture) ; il ne dérive pas.
- **Enseignement : la dérive du Mac en v9 venait de ses propres corrections** (chaque changement de vitesse arrête le lecteur environ 0,2 s, cf. essai 1). → **Règle pour l'application : ne jamais changer la vitesse ni sauter dans une platine YouTube à l'antenne pour la synchroniser ; la console est la référence, seuls les écrans se corrigent.**
- Écart d'horloge PC ↔ Mac : −303 ms (−339 ms la veille) : les horloges dérivent d'un jour à l'autre, la mesure continue est indispensable.
- Petits défauts : la recherche automatique n'a pas trouvé le Mac cette fois (elle l'avait trouvé en v6 et v9) — l'adresse saisie à la main a servi ; à fiabiliser (recherche plus longue, nouvel essai automatique). Un second clic sur « Se connecter » après la connexion a produit « code incorrect » sans couper la connexion : bouton à désactiver une fois connecté.
- Reste à confirmer à l'œil : vidéo des deux lecteurs filmés côte à côte.

**Android (v10) : l'APK ne fonctionne pas.** Il s'installe mais ne marche pas, avec un message de débogage que l'utilisateur n'a pas pu récupérer ; plus de 100 Mo une fois installé. Cause de la taille : APK de **débogage** (code non optimisé, symboles de débogage). Cause de l'arrêt : inconnue sans journal.
- **v11** : APK **optimisé** (version de publication, symboles retirés), pour appareils **64 et 32 bits**, signé avec une clé de test fixe (les versions suivantes s'installent par-dessus) ; un **plantage est noté dans un fichier** et affiché au lancement suivant, avec un bouton « Copier le rapport ».

**Essai 5, deuxième passage en v10 : la vidéo n'a pas démarré sur la console.** Le Mac n'a envoyé aucune position (aucune lecture constatée) ; le PC n'a fait que 7 mesures, sur l'horloge théorique, avec 383 ms de retard. Le rapport ne disait pas pourquoi. Un « code incorrect » apparaît de nouveau après une connexion réussie (second clic sur « Se connecter »).
- **v12** : le rapport garde l'état du lecteur YouTube (chargement, lecture, pause…) et ses erreurs (vidéo privée, intégration refusée, adresse refusée…) ; la console prévient si la vidéo ne démarre pas 5 s après l'heure prévue et invite à cliquer dessus ; « Se connecter » est désactivé pendant et après la connexion.

**Essai 5 en v12 (Mac console + PC écran) : réussi de nouveau, et la panne de démarrage est expliquée.**
- **PC (écran) : 6 ms d'écart médian avec la lecture réelle du Mac** (p95 6 ms, max 35 ms), 114 positions reçues ; 1 saut (la console a démarré en retard), 1 rattrapage doux. La pause de la console arrive bien sur l'écran (même seconde).
- **Mac (console) : la vidéo ne démarre pas au premier lancement.** Historique du lecteur : « non démarrée → en chargement → non démarrée », alerte au bout de 5 s ; au lancement suivant (lecteur déjà créé), la même séquence aboutit à « en lecture ». Cause probable : un lecteur YouTube tout juste créé sur Mac ignore la mise en place rapide (chargement, saut, pause, lecture). Retard constant de la console sur l'horloge : 609 ms, stable à 1 ms près.
- La recherche automatique a encore échoué côté PC (2 fois sur 4) : l'annonce du Mac n'est pas toujours vue par Windows.
- Écart d'horloge PC ↔ Mac : −339, −303, −283, −242 ms en 1 h 30 : **l'horloge du PC dérive d'environ 65 ms par heure** par rapport au Mac. La mesure continue (toutes les 250 ms) est indispensable sur une soirée de 4 h.
- **Android v12** : APK optimisé de 8 Mo (au lieu de 44 Mo compressés), 64 et 32 bits, signé avec la clé de test.
- **v13** : lecture relancée automatiquement si le lecteur reste « non démarré » (jusqu'à 4 fois) ; lecteur de la console préparé dès le choix du rôle ; recherche en 3 tentatives ; l'écran retient la dernière adresse de console qui a fonctionné.
- Pour l'application : Tauri 2.12 ne permet pas encore de régler la lecture automatique de WebKit (la bibliothèque wry le permet) ; à prévoir.

**Essai 5 en v13 : réussi une troisième fois, sans intervention.**
- **Mac (console)** : la vidéo est restée « non démarrée » puis a été **relancée automatiquement une fois** et a joué 75 s. Plus besoin de cliquer.
- **PC (écran) : 5 ms d'écart médian avec la lecture réelle du Mac** (p95 6 ms, max 6 ms), 303 mesures, 147 positions, aucun saut, 2 rattrapages doux. La pause arrive à la même seconde.
- Recherche automatique : échec côté PC malgré 3 tentatives ; l'adresse retenue a servi. La découverte mDNS sur Windows reste à fiabiliser (pistes pour l'application : annonce complémentaire en diffusion UDP, ou QR code).
- Écart d'horloge PC ↔ Mac : −651 ms (−242 ms une heure plus tôt) : le PC a recalé son heure entre-temps. La mesure continue l'absorbe.
- **Conclusion de l'essai 5 : un écran suit la console à 5–6 ms près**, bien sous la durée d'une image (33–40 ms). Méthode retenue : console référence, position réelle diffusée 2 fois par seconde, écrans corrigés par rattrapage doux.

**Android (v13) : arrêt au lancement expliqué.** `UnsatisfiedLinkError: cannot locate symbol "__cxa_pure_virtual"` dans `liblems_essais_lib.so` : la bibliothèque audio (cpal → oboe, en C++) n'embarque pas le moteur C++ du NDK.
- **v14** : moteur C++ du NDK relié en statique pour Android ; la compilation automatique vérifie, pour chaque processeur, qu'aucun symbole C++ ne manque dans l'APK.


**v14 : l'application démarre sur Android.** Appareil : modèle 25062RN2DA, Android 16, processeur 64 bits, WebView Chrome 156, écran 384 × 832 points.
- **Correctif confirmé** : plus d'arrêt au lancement ; menu des essais affiché.
- **Appairage Android ↔ Mac réussi** (adresse saisie : la recherche ne trouve rien sur Android, comme prévu — filtrage du multicast) ; aller-retour 6 ms, écart d'horloge +860 ms, 32 mesures.
- **Mais la connexion s'est perdue avant la lecture** : la console voit l'Android « déconnecté », et l'Android n'a reçu ni chargement ni lecture. Probable : application passée en arrière-plan ou écran éteint pendant qu'on allait sur le Mac. L'écran ne s'en apercevait pas et ne se reconnectait pas.
- **PC (écran) dans le même passage : 2 ms d'écart médian** avec la console (p95 3 ms, max 5 ms) — meilleur résultat à ce jour. Mac et PC ont chacun eu besoin d'une ou deux relances automatiques de la lecture.
- **v15** : l'appareil détecte la perte de connexion (fermeture, ou 3 s sans réponse de la console) ; l'écran se reconnecte tout seul toutes les 2 s et note chaque coupure dans le rapport ; il demande à garder l'écran allumé pendant l'essai.

**Essai 5 en v15 avec Android en écran (4 novembre) : réussi.**
- Le Mac avait changé d'adresse (192.168.88.232 → .224) : l'adresse retenue par l'Android ne répondait plus (« No route to host »). Avec la bonne adresse : connexion, aller-retour 5 à 8 ms, écart d'horloge +347 ms.
- **Android (écran) : 17 ms d'écart médian avec la lecture réelle du Mac** (p95 22 ms, max 27 ms), 552 mesures, 323 positions reçues, aucune coupure, **écran gardé allumé** (accepté par la WebView). Sous la durée d'une image (33 ms à 30 i/s) : suffisant pour un écran de salle.
- Mais 3 sauts, 7 rattrapages et 85 s hors 1× sur 90 : la console a été relancée trois fois, et **chaque lancement ajoutait une boucle de correction** sur l'écran, sans arrêter la précédente (relances numérotées en double dans l'historique). Défaut de la page d'essai.
- **Mac (console)** : au premier lancement, la vidéo n'a pas démarré malgré 4 relances ; aux lancements suivants, si. Hypothèse : WebKit refuse une lecture déclenchée par programme 2 à 3 s après le clic.
- Recherche automatique : échec sur Android (attendu) et sur le Mac.
- **v16** : la console démarre la vidéo **dans le clic** « Lancer » (plus de départ différé de 3 s ; les écrans rattrapent) ; un nouveau lancement remplace le précédent (une seule boucle de correction à la fois) ; « No route to host » est expliqué (adresse de la console changée, ou autre Wi-Fi) et « connexion impossible » n'est plus répété.
- **Pour l'application** : prévoir un moyen de retrouver la console même si son adresse change (QR code à scanner, ou annonce UDP), puisque mDNS échoue sur Android et souvent sur Windows.

**Compilation automatique (4 novembre)** : les tâches Mac restaient en attente puis étaient annulées par GitHub au bout de 15 minutes (macos-15, puis macos-26), alors que Linux et Windows tournaient. Dépôt `lems-vj-player` rendu **public** par son propriétaire : la tâche Mac est passée aussitôt (2 min 40 sur macos-26). Les compilations des dépôts publics sont gratuites et sans quota de minutes.

**Essai 5 en v16 (Mac console + Android écran) : réussi, défauts corrigés.**
- **Mac (console)** : la vidéo démarre **au premier clic**, en 2 s, sans relance. Correctif confirmé.
- **Android (écran) : 11 ms d'écart médian avec la lecture réelle du Mac** (p95 12 ms, max 13 ms), 161 mesures, 102 positions ; 2 sauts et 1 rattrapage au démarrage, puis plus rien (3,3 s hors 1×, contre 85 s en v15). Correctif « une seule boucle » confirmé.
- Le lecteur Android met environ 7 s à démarrer (4 relances automatiques, puis deux chargements) : à prévoir dans l'application (préparer la vidéo sur les écrans avant le lancement).

**Bilan de l'essai 5 : validé sur les trois systèmes.** Écart d'un écran avec la console : PC 2 à 6 ms, Android 11 à 17 ms, toujours sous la durée d'une image. Méthode retenue pour l'application : console référence (sans correction), position réelle diffusée deux fois par seconde, écrans corrigés par rattrapage doux et sauts rares, reconnexion automatique, écran gardé allumé.

**Essai 1 sur Android (v16, téléphone 25062RN2DA, Android 16) : quatre lecteurs YouTube tiennent.** Risque n° 1 du plan levé pour un téléphone récent.
- **4 lecteurs simultanés** : chargés en 1,7 à 1,8 s chacun, lecture des quatre sans erreur, mémoire JavaScript 19,6 Mo.
- **Vitesses : mêmes règles que sur Mac** — pas de 0,05, arrondi vers le bas (1,01 à 1,04 → 1 ; 0,97 à 0,99 → 0,95) ; vitesses jouées exactes (1,0495 à 1,0541 pour 1,05). **Pas de SYNC fin sur YouTube**, confirmé sur Android.
- **Position** : écart-type 3 à 7 ms (meilleur que sur Mac, 16 à 18 ms), mais **la position annoncée n'avance que par pas d'environ 80 ms** (78 à 84 ms) : il faut lisser ou interpoler, ce que fait déjà la correction des écrans (11 ms d'écart médian à l'essai 5).
- Dérive pendant la mesure : 25 à 45 ms de retard. Saut vers un repère : 0,36 à 0,67 s.
- À refaire plus tard sur une tablette ou un téléphone d'entrée de gamme (l'Android console complète est prévue après la version 1).
