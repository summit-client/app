"use client";

/**
 * Sign once, here, and it appears on your receipts and signed documents.
 *
 * Drawing rather than uploading is the default path because it is the one that
 * produces a usable image: a photograph of a signature on paper arrives at two
 * megabytes, cropped wrong, on a grey background. Upload stays available for
 * anyone who already has a clean transparent PNG.
 *
 * Pointer events, not mouse+touch: one code path covers a mouse, a finger and
 * a stylus, and a stylus is what most people will reach for.
 */

import * as React from "react";
import { useIdentity } from "@/components/session-provider";
import {
  MAX_SIGNATURE_BYTES, currentSignature, isSupportedSignature, saveSignature,
  type StoredSignature,
} from "@/lib/signature";
import { credentialLine } from "@/lib/hr-store";

const W = 520;
const H = 160;

export function SignaturePad() {
  const identity = useIdentity();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const drawing = React.useRef(false);
  const dirty = React.useRef(false);

  const [existing, setExisting] = React.useState<StoredSignature | null>(null);
  const [signedName, setSignedName] = React.useState("");
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    currentSignature(identity)
      .then((s) => { setExisting(s); setSignedName(s?.signedName ?? identity.fullName ?? ""); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [identity]);

  const ctx = () => {
    const c = canvasRef.current;
    if (!c) return null;
    const g = c.getContext("2d");
    if (!g) return null;
    g.lineWidth = 2.2;
    g.lineCap = "round";
    g.lineJoin = "round";
    // A fixed ink colour, not a theme token: this image is rendered onto a
    // white receipt, so a signature that followed dark mode would arrive
    // invisible.
    g.strokeStyle = "#12233a";
    return g;
  };

  const pointAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    // The canvas is laid out responsively but has a fixed backing size, so a
    // point has to be scaled or the ink lands away from the pointer.
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    const g = ctx(); if (!g) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    dirty.current = true;
    const p = pointAt(e);
    g.beginPath();
    g.moveTo(p.x, p.y);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const g = ctx(); if (!g) return;
    const p = pointAt(e);
    g.lineTo(p.x, p.y);
    g.stroke();
  }
  function up() { drawing.current = false; }

  function clear() {
    const g = ctx(); if (!g || !canvasRef.current) return;
    g.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    dirty.current = false;
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_SIGNATURE_BYTES) {
      setError("That image is too large. Draw your signature here instead, or upload a smaller PNG.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const uri = String(reader.result);
      if (!isSupportedSignature(uri)) { setError("That file is not a PNG, JPEG or SVG image."); return; }
      const g = ctx(); const c = canvasRef.current;
      if (!g || !c) return;
      const img = new Image();
      img.onload = () => {
        g.clearRect(0, 0, c.width, c.height);
        // Fit inside the box, never stretched: a stretched signature is not
        // the mark the person made.
        const scale = Math.min(c.width / img.width, c.height / img.height, 1);
        const w = img.width * scale, h = img.height * scale;
        g.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
        dirty.current = true;
        setError(null);
      };
      img.src = uri;
    };
    reader.readAsDataURL(file);
  }

  async function save() {
    const c = canvasRef.current;
    if (!c) return;
    if (!dirty.current) { setError("Draw or upload your signature first."); return; }
    setBusy(true); setError(null); setSaved(false);
    try {
      const row = await saveSignature(identity, c.toDataURL("image/png"), signedName);
      setExisting(row);
      setEditing(false);
      setSaved(true);
      clear();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  const cred = credentialLine();

  return (
    <section className="card card-pad" style={{ marginTop: 16, display: "grid", gap: 12 }}>
      <div>
        <b>Signature</b>
        <p className="sub" style={{ margin: "6px 0 0", maxWidth: "70ch" }}>
          Appears on client receipts and signed documents, alongside your name and
          registration number. Only you can set it — nobody else in the organization
          can sign on your behalf.
        </p>
      </div>

      {error ? (
        <div className="card card-pad" role="alert" style={{ borderColor: "var(--bad)" }}>{error}</div>
      ) : null}
      {saved ? <p className="sub" role="status" style={{ margin: 0, color: "var(--good)" }}>Signature saved.</p> : null}

      {existing && !editing ? (
        <>
          <div style={{
            background: "#fff", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)",
            padding: 12, maxWidth: W, display: "grid", gap: 6,
          }}>
            {/* White ground on purpose: this is how it will sit on a receipt. */}
            <img src={existing.imageDataUri} alt={`Signature of ${existing.signedName}`}
              style={{ maxWidth: "100%", height: "auto" }} />
            <div style={{ borderTop: "1px solid #d4e2e8", paddingTop: 6, color: "#22333f", fontSize: 13 }}>
              <b>{existing.signedName}</b>
              {cred ? <span style={{ marginLeft: 8 }}>{cred}</span> : null}
            </div>
          </div>
          <p className="sub" style={{ margin: 0, fontSize: 12 }}>
            In use since {existing.effectiveFrom}.
            {cred
              ? " Your registration number is read from My Credentials."
              : " Add a credential on My Credentials so your registration number appears here too."}
          </p>
          <div>
            <button className="btn ghost" onClick={() => { setEditing(true); setSaved(false); }}>
              Replace signature
            </button>
          </div>
          <p className="sub" style={{ margin: 0, fontSize: 11 }}>
            Replacing keeps the old one on file. Documents already issued keep the
            signature that was current when they were issued.
          </p>
        </>
      ) : (
        <>
          <canvas
            ref={canvasRef} width={W} height={H}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
            aria-label="Signature drawing area. Draw your signature with a mouse, finger or stylus."
            role="img"
            style={{
              width: "100%", maxWidth: W, height: "auto", aspectRatio: `${W} / ${H}`,
              background: "#fff", border: "1px dashed var(--line-strong, var(--line))",
              borderRadius: "var(--radius-sm)", touchAction: "none", cursor: "crosshair",
            }}
          />
          <div style={{ display: "grid", gap: 10, maxWidth: W }}>
            <label className="field" style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Printed name</span>
              <input className="input" value={signedName} onChange={(e) => setSignedName(e.target.value)}
                placeholder="As it should read under your signature" />
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btn" onClick={save} disabled={busy}>
                {busy ? "Saving…" : "Save signature"}
              </button>
              <button className="btn ghost" onClick={clear} disabled={busy}>Clear</button>
              {existing ? (
                <button className="btn ghost" onClick={() => { setEditing(false); clear(); setError(null); }}>
                  Cancel
                </button>
              ) : null}
              <label className="btn ghost" style={{ cursor: "pointer", marginLeft: "auto" }}>
                Upload an image
                <input type="file" accept="image/png,image/jpeg,image/svg+xml"
                  onChange={onUpload} style={{ display: "none" }} />
              </label>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
