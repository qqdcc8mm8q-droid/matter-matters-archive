import Foundation

/// Was in der Ausstellung passiert ist. Steht in der App und in protokoll.log.
@MainActor
final class Protokoll: ObservableObject {
    static let shared = Protokoll()

    enum Art: String { case info, warnung, fehler }

    struct Eintrag: Identifiable {
        let id = UUID()
        let zeit: Date
        let text: String
        let art: Art
    }

    @Published private(set) var eintraege: [Eintrag] = []
    private static let MAX = 1000
    private nonisolated static let schreiber = DispatchQueue(label: "protokoll")

    /// Von überall aufrufbar.
    nonisolated static func melde(_ text: String, art: Art = .info) {
        let zeit = Date()
        schreiber.async { anhaengen(zeit: zeit, text: text, art: art) }
        Task { @MainActor in
            shared.eintraege.insert(Eintrag(zeit: zeit, text: text, art: art), at: 0)
            if shared.eintraege.count > MAX { shared.eintraege.removeLast(shared.eintraege.count - MAX) }
        }
    }

    private nonisolated static func anhaengen(zeit: Date, text: String, art: Art) {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        f.timeZone = .current
        let zeile = "\(f.string(from: zeit)) [\(art.rawValue)] \(text)\n"
        let url = Pfade.protokoll
        if let h = try? FileHandle(forWritingTo: url) {
            defer { try? h.close() }
            _ = try? h.seekToEnd()
            try? h.write(contentsOf: Data(zeile.utf8))
        } else {
            try? Data(zeile.utf8).write(to: url)
        }
    }
}
