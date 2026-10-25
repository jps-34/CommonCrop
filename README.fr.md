# CommonCrop

**Script PixInsight : recadre tous vos masters intégrés sur le seul rectangle couvert par toutes
les brutes de tous les canaux.**

*English version: [README.md](README.md)*

Les masters intégrés en composition *full* (Astro Pixel Processor par exemple) ont une bordure où
seule une partie des brutes contribue : dithering, dérive de pointage entre les nuits, session
tournée. Cette bordure est plus bruitée et change d'un filtre à l'autre. CommonCrop la trouve à
partir des seuls masters et vous donne `L_crop`, `R_crop`, ... tous de la même taille et
pleinement intégrés.

## Principe

* **Par canal** : la zone non nulle du master est l'union des brutes. Son excédent sur la taille
  d'une brute est l'étalement ; en le retirant de chaque côté, il reste la zone couverte par
  toutes les brutes.
* **Tous canaux** : intersection de ces zones, plus une marge de sécurité (10 px par défaut).
* **Contrôle de sortie** : bruit à chaque bord du recadrage comparé au bruit plus à l'intérieur.
  Autour de 1,00 le bord est propre ; au-dessus de 1,10, augmentez la marge.
* **Contrôle visuel** : après Calculer, un preview `CommonCrop` montre le cadre exact du
  recadrage sur chaque master. Zoomez dans les coins pour vérifier par vous-même que le cadre est
  bien dans la zone pleinement intégrée, avant que rien ne soit recadré.
* **Perte de champ par filtre** : part du champ perdue à cause de l'étalement, du pire au
  meilleur. Un indicateur rapide de votre acquisition, filtre par filtre.
* **Appliquer** : crée `<filtre>_crop` avec une STF automatique ; les entrées sont renommées
  `<filtre>_master`. Les masters ne sont jamais modifiés. Option **Recadrer sur place** : recadre
  directement les masters (une étape d'historique annulable par master).

## Prérequis

* PixInsight 1.9.4 ou plus.
* Des masters de la même cible, tous intégrés sur la même brute de référence en composition
  *full* (mêmes dimensions, zéro là où rien n'est couvert).
* La taille d'une brute : lue dans l'en-tête FITS pour les QHY600, ASI6200, ASI2600 et QHY268,
  sinon à saisir une fois dans les réglages.

## Installation

1. *Resources > Updates > Manage Repositories*, ajouter `https://jps-34.github.io/CommonCrop/`
2. *Check for Updates*, redémarrer PixInsight (activer *Allow unsigned update repositories* tant
   que le dépôt n'est pas signé).
3. *Script > Utilities > CommonCrop*.

Ou télécharger `scripts/CommonCrop.js` et le lancer par *Script > Execute Script File*.

## Utilisation

1. **Ouvrir des fichiers...** ou **Ranger les vues ouvertes** : les masters sont placés dans leur
   emplacement d'après le mot-clé `FILTER` (ou le nom du fichier). Les filtres inconnus vont en
   AUX1/AUX2.
2. **Calculer** : rapport et contrôle de sortie.
3. **Vérifier les previews `CommonCrop`** sur les masters, surtout les coins. Ajuster la marge et
   recalculer si besoin.
4. **Appliquer**.

Interface en français ou en anglais (menu *Langue / Language*). Survoler un réglage pour l'aide.

## Licence

Copyright (c) 2026 Jacques Pouyaud. [Licence MIT](LICENSE).
Rapports de bogues et suggestions bienvenus dans les issues GitHub.

*Code écrit par Claude (Anthropic), sous la direction de Jacques Pouyaud.*
