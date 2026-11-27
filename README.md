# Digitale Leihquittung

Der Prototyp hält fest, wer eine Ausleihe und ihre Rückgabe bestätigt hat. Er speichert die beiden Wallet-Adressen, eine Werkzeug-ID, den Rückgabetermin und den Status. Wallet-Adressen und Werkzeug-ID sind öffentlich einsehbar. Verwende für die Demo ausschließlich Test-Wallets und neutrale IDs wie `bohrmaschine-01`. Der Vertrag hält keine Kaution.

## Bereits getestete Demo auf Base Sepolia

- [ToolLoan auf BaseScan](https://sepolia.basescan.org/address/0xc889B2eB2204F5CcA399d81922497aCecad28565)
- Ausleihnummer **1**, Werkzeug-ID **bohrmaschine-01**, Status **Zurückgegeben**
- Öffne `index.html` über eine lokale oder öffentliche Webadresse. Füge die Vertragsadresse ein und lade Quittung **1**. Dafür brauchst du keine Wallet.

Beim Probelauf haben zwei Test-Wallets alle vier Schritte auf Base Sepolia abgeschlossen. Der Vertrag protokolliert ihre Bestätigungen. Den tatsächlichen Erhalt und Zustand des Werkzeugs beurteilen die Beteiligten.

## Eigene Demo auf Base Sepolia

1. Kompiliere `ToolLoan.sol` mit Solidity 0.8.20 und stelle den Vertrag mit einer Test-Wallet auf Base Sepolia bereit.
2. Öffne `index.html` über eine lokale oder öffentliche Webadresse in einem Browser mit Wallet-Erweiterung. Trage die Vertragsadresse ein und verbinde die Test-Wallet des Verleihers.
3. Lege eine Ausleihe mit der zweiten Test-Wallet und einem zukünftigen Rückgabetermin an. Teile der anderen Person die Vertragsadresse und die Ausleihnummer mit.
4. Die leihende Person lädt die Quittung, nimmt die Ausleihe an und meldet später die Rückgabe.
5. Der Verleiher lädt die Quittung erneut und bestätigt den Erhalt. Der Status lautet **Zurückgegeben**.

Die Quittung lässt sich mit Vertragsadresse und Ausleihnummer auch ohne Wallet lesen. Für die vier Aktionen braucht jede Test-Wallet Base-Sepolia-ETH für die Netzwerkgebühren.

## Lokale Tests

Führe diese Befehle im Verzeichnis mit den drei Dateien aus:

```sh
npm install --no-save solc@0.8.20 ethers@5.7.2 ganache@7.9.2
node --test ToolLoan.test.cjs
```
