# Maintenance : développement, publication et signature

Notes pour l'auteur. Rien ici n'est nécessaire pour utiliser le script. Même organisation que
Badassium238.

## 1. Mise en ligne initiale

1. Le nom d'utilisateur `jps-34` est en place partout (README, page du dépôt, en-tête du script) et
   le dépôt de mises à jour est construit dans `docs/`. Pour le reconstruire après une modification
   du script :

   ```bash
   python3 tools/build_repo.py --user jps-34
   ```

2. Créer le dépôt `CommonCrop` sur GitHub (public), puis :

   ```bash
   git init && git add . && git commit -m "CommonCrop 1.0.0"
   git branch -M main
   git remote add origin git@github.com:jps-34/CommonCrop.git
   git push -u origin main
   git switch -c dev && git push -u origin dev
   ```

3. Sur GitHub : *Settings > Pages > Build and deployment > Deploy from a branch*, branche `main`,
   dossier `/docs`. Le dépôt PixInsight est alors servi à `https://jps-34.github.io/CommonCrop/`.

4. Test : dans PixInsight, *Resources > Updates > Manage Repositories*, ajouter cette URL, puis
   *Check for Updates*. Tant que ce n'est pas signé, il faut l'option de sécurité
   *Allow unsigned update repositories*.

## 2. Signature (une fois pour toutes)

Référence : [Script code signing](https://pixinsight.com/doc/docs/ScriptCodeSigning/ScriptCodeSigning.html)
et [Update repositories](https://pixinsight.com/doc/docs/PIRepositoryReference/PIRepositoryReference.html).
Mêmes clés `.xssk` que pour Badassium238 ; le fichier reste hors de Git (`.gitignore`).

## 3. Branche dev, puis passage en prod

`main` = la production : GitHub Pages sert `docs/` depuis `main`, donc tout ce qui arrive sur `main`
part chez les utilisateurs PixInsight. Une nouvelle version va d'abord sur `dev`.

**Seule source à modifier : `scripts/CommonCrop.js`** (V8, PixInsight 1.9.4 et plus). `docs/`
(zip, empreinte, `updates.xri`) est généré par `python3 tools/build_repo.py --user jps-34`.

Mettre une nouvelle version sur dev (exemple avec le zip de la 1.0.0) :

```bash
cd <dossier du dépôt local>/CommonCrop
git switch dev
git rm -rq .
unzip -o <dossier de téléchargement>/CommonCrop-v1.0.0.zip -d /tmp/cc
cp -a /tmp/cc/CommonCrop/. .
git add -A
git status                     # vérifier la liste avant de valider
git commit -m "CommonCrop 1.0.0"
git push
```

Tester dans PixInsight : *Script > Execute Script File*, choisir `scripts/CommonCrop.js` dans le
dépôt local. Le script tourne sans être installé, la version de prod reste en place.

Passer en prod une fois validée :

```bash
git switch main
git merge dev
git tag -a v1.0.0 -m "CommonCrop 1.0.0"
git push origin main --tags
git switch dev
```

Puis, dans PixInsight, *Resources > Updates > Check for Updates*.

Avec la signature, l'ordre compte : signer `scripts/CommonCrop.js` avec **CodeSign**, lancer
`python3 tools/build_repo.py --user jps-34`, signer `docs/updates.xri` en dernier, puis commit.

## 4. Versions et historique

* Numérotation `MAJEUR.MINEUR.CORRECTIF` : correctif = bug corrigé sans changement de résultat
  voulu, mineur = nouvelle fonction, majeur = réglages ou résultats incompatibles.
* Chaque version publiée a son étiquette `vX.Y.Z` et sa page *Release* avec son zip. Les anciennes
  versions restent téléchargeables là ; le dépôt PixInsight (`docs/`) ne sert que la dernière.
* Récupérer un fichier d'une ancienne version :
  `git show v1.0.0:scripts/CommonCrop.js > CommonCrop-1.0.0.js`

## 5. Ajouter une caméra

La table `CAMERA_SIZES` en tête de `scripts/CommonCrop.js` donne la résolution native (bin 1) de
quelques caméras, reconnues par le mot-clé `INSTRUME`. Ajouter une ligne `{ match: /.../i, w, h }`
suffit ; le binning est lu dans `XBINNING`.
