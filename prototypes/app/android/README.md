# Clé de signature des essais Android

`essais-test.jks` signe l'APK des **essais** (mot de passe `lems-essais`, alias `essais`).
Elle est publique : elle sert seulement à ce que chaque nouvelle version d'essai
s'installe par-dessus la précédente. **Ne jamais l'utiliser pour l'application
publiée** : la vraie clé se crée à l'étape 6 (distribution) et reste secrète.
