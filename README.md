# Lijstjes

Gedeelde gezinslijstjes als installeerbare web-app (PWA): een lijst per winkel, losse lijsten, templates, Bijna op, koopritme, een winkelronde langs meerdere winkels en live meekijken.
Zonder Firebase-configuratie draait de app in demomodus (alleen lokaal), zodat je direct kunt proberen: open `index.html`.

## Bestanden

| Bestand | Doel |
|---|---|
| `index.html` | De hele app (opmaak, logica en de vaste catalogus van ongeveer 380 bekende producten) |
| `firebase-config.js` | Jouw Firebase-configuratie; blijft staan bij updates van `index.html` |
| `firestore.local.rules` | Toegangsregels met de vaste lijst mailadressen. Staat bewust niet op GitHub (zie `.gitignore`) |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | Installeren op het beginscherm en offline starten (bij slecht bereik na 2,5 seconden de opgeslagen versie) |
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

- `lists/boodschappen/items/{sleutel}`: de producten op de winkellijsten: naam, cat, qty, unit, note, store (op welke winkellijst), checked, missing en wie het deed. De sleutel is de genormaliseerde productnaam, waardoor hetzelfde product nooit dubbel op een lijst komt en gelijktijdig ophogen veilig optelt.
- `products/{sleutel}`: alleen producten die jullie gebruiken: naam, schap, vaste winkel, eenheid en standaardhoeveelheid, hoe vaak toegevoegd, de laatste aankoopmomenten (koopritme), Bijna op en tijdelijk verborgen. De bekende producten staan als catalogus in `index.html`; wat hier staat gaat daarvoor.
- `stores/{id}`: naam, logo, looproute (schapvolgorde) en of de winkel schappen gebruikt.
- `xlists/{id}` en `xitems/{lijst|sleutel}`: de losse lijsten (zonder winkel) en hun items.
- `cats/{id}`: eigen schappen en aanpassingen aan de standaardschappen.
- `templates/{id}`: naam en producten, met per product de winkel.
- `history/{tijdstip}`: de laatste 10 winkelbezoeken (Vorige lijsten).
- `state/tour`: de lopende winkelronde (winkels in volgorde, wie, wanneer) en de onthouden route. Gedeeld, zodat meekijken werkt.
- `state/cfg`: of de lijst Boodschappen aan staat en de standaardwinkel. `state/mig`: welke eenmalige omzetting al gedaan is.

Per apparaat (niet gedeeld) worden alleen het thema, de compactheid en de laatst geopende lijst onthouden.
