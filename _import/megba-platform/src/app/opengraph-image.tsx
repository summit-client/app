import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Mount Etna Global Behaviour Academy";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #14261B 0%, #1E3A2B 60%, #24462F 100%)",
          padding: "72px",
          color: "#FAF6EC",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              background: "#9DB29A",
              display: "flex",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 26, letterSpacing: 2, color: "#9DB29A" }}>MOUNT ETNA</span>
            <span style={{ fontSize: 14, letterSpacing: 4, color: "#CDBBA6" }}>
              GLOBAL BEHAVIOUR ACADEMY
            </span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.05 }}>
            Behaviour Science
          </span>
          <span style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.05, color: "#C25A34" }}>
            Without Borders.
          </span>
        </div>
        <span style={{ fontSize: 24, color: "rgba(250,246,236,0.8)", maxWidth: 820 }}>
          International behaviour-science education, consultation, and multilingual learning.
        </span>
      </div>
    ),
    { ...size },
  );
}
