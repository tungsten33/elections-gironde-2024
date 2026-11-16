# Observatoire électoral — Législatives 2024 en Gironde

Site statique (HTML/CSS/JS, sans build). Fichiers : `index.html`, `style.css`, `app.js`, `lab.js`, `data/*`.

## Lancer en local (VS Code)
Installer l'extension « Live Server », clic droit sur `index.html` → « Open with Live Server ».
(Ne pas ouvrir le fichier directement : les données ne se chargent pas en `file://`.)

## Déployer
1. Pousser le dossier sur GitHub (GitHub Desktop ou `git`).
2. Netlify → « Add new site » → « Import from Git » → choisir le dépôt → laisser build vide, publish = `.`.

## Données (sources officielles)
- Résultats par circonscription et par commune, 1er et 2nd tours : ministère de l'Intérieur via data.gouv.fr.
- Contours des circonscriptions : data.gouv.fr ; communes : geo.api.gouv.fr ; population : INSEE.
- Fonds de carte : IGN Géoplateforme (Plan IGN, photographies aériennes), OpenStreetMap.
- L'onglet « Données » compare les totaux du site à l'API data.gouv.fr en direct.

## Méthode (voir l'onglet « Données »)
Les redécoupages sont des simulations : reports de voix du 2nd tour estimés à partir des duels réels observés en Gironde.
Le modèle reproduit exactement les 12 élus de 2024. Le duel NFP–Ensemble, quasi absent, est reconstitué.
