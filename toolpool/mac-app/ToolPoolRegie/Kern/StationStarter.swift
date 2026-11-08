import Foundation

/// Schreibt für jede Station eine Startdatei, die den Browser im Vollbild öffnet.
enum StationStarter {
    static func mac(adresse: String, station: Int) -> String {
        let url = "http://\(adresse):8431/?station=\(station)"
        return """
        #!/bin/zsh
        # Tool Pool, Station \(station). Doppelklick öffnet die Station im Vollbild.
        # Wartet, bis der Mac mini antwortet. Beenden im Vollbild: Cmd+Q.
        URL="\(url)"
        echo "Warte auf den Mac mini ..."
        until curl -s -m 2 -o /dev/null "$URL"; do sleep 2; done
        CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        if [ -x "$CHROME" ]; then
          exec caffeinate -dims "$CHROME" --kiosk --noerrdialogs --disable-session-crashed-bubble --no-first-run --user-data-dir="$HOME/.toolpool-chrome" "$URL"
        fi
        open -a Safari "$URL"

        """
    }

    static func windows(adresse: String, station: Int) -> String {
        let url = "http://\(adresse):8431/?station=\(station)"
        return [
            "@echo off",
            "rem Tool Pool, Station \(station). Doppelklick oeffnet die Station im Vollbild. Beenden: Alt+F4.",
            "set URL=\(url)",
            "echo Warte auf den Mac mini ...",
            ":warte",
            "curl -s -m 2 -o NUL \"%URL%\" || (timeout /t 2 >NUL & goto warte)",
            "start \"\" \"%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe\" --kiosk --noerrdialogs --disable-session-crashed-bubble --no-first-run --user-data-dir=\"%LOCALAPPDATA%\\toolpool-chrome\" \"%URL%\"",
            "",
        ].joined(separator: "\r\n")
    }

    /// Legt einen Ordner mit den Startdateien aller Stationen an.
    static func schreibe(nach ordner: URL, adresse: String, anzahl: Int) throws {
        let fm = FileManager.default
        try fm.createDirectory(at: ordner, withIntermediateDirectories: true)
        for i in 1...anzahl {
            let m = ordner.appendingPathComponent("Station \(i) starten.command")
            try mac(adresse: adresse, station: i).write(to: m, atomically: true, encoding: .utf8)
            try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: m.path)
            try windows(adresse: adresse, station: i).write(to: ordner.appendingPathComponent("Station \(i) starten.bat"), atomically: true, encoding: .utf8)
        }
    }
}
