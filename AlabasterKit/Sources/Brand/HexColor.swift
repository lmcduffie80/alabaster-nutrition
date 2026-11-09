public struct RGBA: Equatable, Sendable {
    public var red: Double
    public var green: Double
    public var blue: Double
    public var alpha: Double
}

public enum HexColor {
    /// Accepts `RRGGBB` or `RRGGBBAA`, with or without a leading `#`.
    public static func parse(_ string: String) -> RGBA? {
        var hex = Substring(string)
        if hex.hasPrefix("#") { hex = hex.dropFirst() }
        guard hex.count == 6 || hex.count == 8,
              hex.allSatisfy(\.isHexDigit),
              let value = UInt64(hex, radix: 16) else { return nil }
        func channel(_ shift: UInt64) -> Double { Double((value >> shift) & 0xFF) / 255 }
        if hex.count == 6 {
            return RGBA(red: channel(16), green: channel(8), blue: channel(0), alpha: 1)
        }
        return RGBA(red: channel(24), green: channel(16), blue: channel(8), alpha: channel(0))
    }
}
