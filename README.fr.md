# CommonCrop

**Un script PixInsight qui recadre tous vos masters intégrés sur le seul rectangle couvert par
toutes les brutes de tous les canaux, à partir des masters seuls.**
Chargez L, R, G, B, SII, Ha, OIII (et jusqu'à deux canaux supplémentaires), Calculer, contrôle,
Appliquer : vous obtenez `L_crop`, `R_crop`, ... tous de la même taille, sans bande partiellement
intégrée dans aucun d'eux. Le script dit aussi, filtre par filtre, combien de champ votre
acquisition a perdu en dithering, en dérive de pointage et en rotation entre les nuits.

*English version: [README.md](README.md)*

## Pourquoi

Quand une pile de brutes est intégrée en composition *full* (Astro Pixel Processor par exemple), le
canevas est l'union de toutes les brutes. Le long des bords, et surtout dans les coins, il reste une
bande de pixels que seule une partie des brutes couvre : dithering, écarts de pointage d'une nuit à
l'autre, session faite avec la caméra légèrement tournée. Ces pixels sont plus bruités, et la bande
est différente pour chaque filtre. On recadre alors les masters à la main, un par un, sans jamais
être sûr que le cadre est à la fois serré et propre, ni que les sept canaux sont bien alignés.

Tester les pixels nuls ne suffit pas : ça ne donne que le bord extérieur de l'union, alors que les
pixels juste à l'intérieur sont couverts par une, deux, trois sessions sur cinq. La zone couverte par
toutes les brutes commence à la marche la plus intérieure de « l'escalier » qu'on voit dans un coin
à fort zoom, et cette marche est invisible pour un test de nullité.

## Ce que fait le script

1. **Géométrie, par canal.** La boîte englobante des pixels non nuls est l'union des brutes. Son
   excédent par rapport à la taille d'une brute est l'étalement des brutes. La zone couverte par
   toutes les brutes est la boîte réduite de cet excédent de chaque côté : exact pour des
   translations pures et pour une rotation autour du centre, proche sinon. Sur le jeu de test de
   l'auteur, le résultat tombe à 1 à 15 px de la limite de bruit mesurée sur les canaux RVB, 10 à
   47 px sur les canaux à bande étroite (une session tournée de 0,8°).
2. **Recadrage commun.** L'intersection de ces zones sur tous les canaux, moins une marge de
   sécurité (10 px proposés, de 2 à 200). Le rapport dit quel canal limite chaque côté.
3. **Contrôle de sortie.** Sur chaque canal et chaque côté, le bruit (écart-type robuste des
   différences entre pixels voisins) sur une bande de 16 px au bord du recadrage est divisé par le
   bruit 300 px plus loin, en médiane sur 20 tronçons. Un côté encore dans la bande partiellement
   intégrée ressort au-dessus du seuil (1,10 par défaut, soit environ 83 % du poids d'intégration).
   Si un côté est signalé, augmentez la marge et recalculez.
4. **Perte de champ par filtre.** La part du champ d'une brute qui n'est pas couverte par toutes
   les brutes de ce filtre, classée du pire au meilleur, avec la moyenne sur les filtres et la perte
   du recadrage final. Un indicateur de qualité de l'acquisition : sur le champ du Sorcier de
   l'auteur, 0,7 % sur les canaux RVB (quatre nuits) et environ 3,1 % sur SII, Ha et OIII (cinq à
   huit nuits, dont une tournée).
5. **Previews.** Après Calculer, un preview nommé `CommonCrop` est créé sur chaque master, au cadre
   exact du recadrage, pour un contrôle visuel.
6. **Appliquer.** Crée `<filtre>_crop` pour chaque master chargé, dans le format d'échantillon du
   master, avec une STF automatique et un zoom réduit. Les entrées sont renommées `<filtre>_master`
   (optionnel) et leurs pixels ne sont jamais modifiés. Les mots-clés FITS sont copiés, plus une
   ligne HISTORY avec le recadrage.

Sur six masters de 63 mégapixels, la géométrie et le contrôle prennent environ une seconde, la
création des six images recadrées une quinzaine de secondes.

## Prérequis

| Fichier | PixInsight |
|---|---|
| `scripts/CommonCrop.js` (1.0.1) | 1.9.4 et plus (moteur JavaScript V8) |

Entrées : des masters intégrés de la même cible, **tous intégrés sur la même brute de référence en
composition *full***, pour qu'ils aient les mêmes dimensions et que les zones non couvertes soient
à 0. C'est la sortie par défaut d'Astro Pixel Processor. Des masters intégrés en composition
*reference* n'ont pas de bord nul : le script ne trouve alors aucun étalement et n'applique que la
marge de sécurité.

Le script a besoin de la **taille d'une brute registrée** (résolution de la caméra au binning
utilisé). Il la lit dans les mots-clés `INSTRUME` et `XBINNING` pour quelques caméras (QHY600,
ASI6200, ASI2600, QHY268), sinon saisissez-la une fois dans les réglages : elle est mémorisée. Sans
rien, la taille est estimée par le plus grand rectangle inscrit dans la zone non nulle, à 30 px près
environ, et le rapport le signale.

## Charger les masters

Les scripts PixInsight tournent dans une fenêtre modale : on ne peut pas glisser des images de
l'espace de travail vers le script. Trois voies à la place :

* **Ouvrir des fichiers...** : choisissez un ou plusieurs fichiers ; chacun est ouvert et rangé dans
  son emplacement d'après le mot-clé FITS `FILTER` (Red, Green, Blue, Luminance, Hydrogen-alpha,
  Oxygen III, Sulphur II ou leurs abréviations), sinon d'après le nom du fichier. Un filtre inconnu
  ou en double va dans AUX1, puis AUX2.
* **Ranger les vues ouvertes** : le même tri appliqué aux images déjà ouvertes dans PixInsight.
* La liste à côté de chaque emplacement, pour choisir ou corriger à la main.

## Langue

L'interface existe en **anglais et en français**. Au premier lancement elle prend la langue du
système, l'anglais sinon. Le menu **Langue / Language** change à tout moment : le dialogue se
rouvre aussitôt, en gardant les images et les réglages, et le choix est mémorisé.

## Installation

### Par le dépôt de mises à jour PixInsight (recommandé)

1. *Resources > Updates > Manage Repositories*, ajouter
   `https://jps-34.github.io/CommonCrop/`
2. *Resources > Updates > Check for Updates*, puis redémarrer PixInsight.
3. Le script apparaît dans *Script > Utilities > CommonCrop*.

Tant que le dépôt n'est pas signé, PixInsight ne l'accepte qu'avec la préférence de sécurité
*Allow unsigned update repositories* activée.

### Manuelle

Télécharger `scripts/CommonCrop.js`, puis soit l'exécuter par *Script > Execute Script File*, soit
ajouter son dossier par *Script > Feature Scripts > Add* pour qu'il apparaisse dans le menu
*Script > Utilities*.

## Réglages

| Réglage | Sens |
|---|---|
| **Marge de sécurité** | Pixels retirés de chaque côté en plus du résultat géométrique. 10 px proposés ; le contrôle de sortie dit si ça suffit. De 2 à 200. Revient à la valeur proposée à chaque lancement. |
| **Taille des brutes** | Largeur et hauteur d'une brute registrée. 0 = lue dans l'en-tête quand la caméra est connue, sinon estimée. Mémorisée. |
| **Seuil de contrôle** | Ratio de bruit au-delà duquel un côté est signalé. 1,10 par défaut. |
| **Preview du cadre** | Crée ou met à jour le preview `CommonCrop` sur chaque master après Calculer. |
| **Renommer les entrées** | Renomme les masters `<filtre>_master` à Appliquer. |

## Lire le rapport

* **Étalement x/y** : excédent de la zone non nulle sur une brute, en pixels. Le dithering seul
  donne quelques dizaines de pixels ; une session tournée ajoute la hauteur de la brute multipliée
  par le sinus de l'angle (environ 134 px pour 0,8° sur une brute de 6388 px de haut).
* **Marges** : pixels à retirer de chaque bord du canevas pour ne garder que la zone couverte par
  toutes les brutes de ce filtre.
* **Perte de champ** : `1 - (W - étalement_x)(H - étalement_y) / (W H)` avec W et H la taille de la
  brute. Pire filtre en premier. La moyenne sur les filtres et la perte du recadrage final (qui
  ajoute la marge) sont données dessous.
* **Contrôle de sortie** : autour de 1,00, le bord est dans la zone pleinement intégrée. Lire la
  médiane ; le maximum entre parenthèses réagit aux étoiles brillantes et aux nébulosités et n'est
  là qu'à titre indicatif.

## Licence

Copyright (c) 2026 Jacques Pouyaud. Publié sous [licence MIT](LICENSE).

Si vous construisez dessus, une mention et un lien vers ce dépôt sont appréciés.
Rapports de bogues et suggestions bienvenus dans les issues GitHub.

*Code écrit par Claude (Anthropic), sous la direction de Jacques Pouyaud,
qui a défini le besoin, testé sur ses propres données et validé les résultats. La méthode a d'abord
été vérifiée en Python sur les masters de l'auteur (six canaux, 13 nuits) avant d'être écrite en
script PixInsight.*
