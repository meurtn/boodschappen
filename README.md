# Lijstjes

Gedeelde gezinslijstjes als installeerbare web-app (PWA). Versie 1: boodschappen.
Zonder Firebase-configuratie draait de app in demomodus (alleen lokaal), zodat je direct kunt proberen: open `index.html`.

## Bestanden

| Bestand | Doel |
|---|---|
| `index.html` | De hele app (opmaak, logica, productcatalogus) |
| `firebase-config.js` | Jouw Firebase-configuratie; blijft staan bij updates van `index.html` |
| `firestore.local.rules` | Toegangsregels met de vaste lijst mailadressen. Staat bewust niet op GitHub (zie `.gitignore`) |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | Installeren op het beginscherm en offline starten |
| `firebase.json` | Instellingen voor `firebase deploy` |

## Eenmalig koppelen (ongeveer 10 minuten)

1. Maak op https://console.firebase.google.com een project aan.
2. **Authentication > Sign-in method**: zet Google aan.
3. **Firestore Database**: maak een database aan (productiemodus, regio `eur3` of `europe-west4`).
4. **Projectinstellingen > Jouw apps > Web-app toevoegen** en plak de waarden in `firebase-config.js`.
5. Zet in `firestore.local.rules` de Google-adressen van je gezin.
6. Publiceer vanuit deze map:
   ```
   npm install -g firebase-tools
   firebase login
   firebase use --add
   firebase deploy
   ```
   De app staat daarna op `https://<project-id>.web.app`. Firebase Hosting is de aanbevolen plek, omdat Google-login daar op iPhone het betrouwbaarst werkt.
7. Op de telefoon: open de link, log in, en kies Deel > Zet op beginscherm.

Liever GitHub Pages? Dat kan ook: voeg dan het Pages-domein toe onder **Authentication > Settings > Authorized domains** en publiceer alleen de regels met `firebase deploy --only firestore:rules`.

## Beveiliging

De toegang wordt afgedwongen door `firestore.local.rules` op de server, niet in de app. Wie niet in de lijst staat kan wel inloggen met Google, maar krijgt niets te zien en kan niets schrijven. De waarden in `firebase-config.js` zijn geen geheim.

## Gegevensmodel (Firestore)

- `lists/boodschappen/items/{sleutel}`: naam, cat, qty, note, checked, by. De sleutel is de genormaliseerde productnaam, waardoor hetzelfde product nooit dubbel op de lijst komt en gelijktijdig ophogen veilig optelt.
- `products/{sleutel}`: eigen producten, geleerde schap en hoe vaak gekocht (voor suggesties).
- `products/{sleutel}` bevat ook: eenheid en standaardhoeveelheid, vaste winkel, de laatste aankoopmomenten (koopritme) en of het in Bijna op staat.
- `stores/{id}`: naam en schapvolgorde (looproute) per winkel. Welke winkels je vandaag bezoekt en in welke volgorde wordt per apparaat onthouden.
- `templates/{id}`: naam, optionele winkel en producten.
- `history/{tijdstip}`: de laatste 10 winkelbezoeken (Vorige lijsten).

Nieuwe lijstsoorten (to-do's, cadeaus, klusjes) passen later als extra documenten onder `lists/`.
