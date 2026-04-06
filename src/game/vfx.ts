// ============================================================
// Periodic Breaker – Visual Effects System
// Decoupled from game logic. Receives spawn commands and
// renders particles / flashes / overlays each frame.
// ============================================================

import type { VfxKey } from "./elements";

// ── Particle ──────────────────────────────────────────────

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  type: "spark" | "smoke" | "shard" | "lightning" | "ring" | "text";
  text?: string;
}

// ── Screen flash ──────────────────────────────────────────

interface ScreenFlash {
  color: string;
  alpha: number;
  decay: number;
}

// ── Lightning bolt segment ────────────────────────────────

interface LightningBolt {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  maxLife: number;
  color: string;
}

// ── Shield bar (floor) ───────────────────────────────────

export interface ShieldBar {
  endTime: number;
}

// ── Gas zone overlay ─────────────────────────────────────

export interface GasZone {
  endTime: number;
  height: number;
}

// ── VFX Manager ──────────────────────────────────────────

export class VfxManager {
  particles: Particle[] = [];
  flashes: ScreenFlash[] = [];
  bolts: LightningBolt[] = [];
  shield: ShieldBar | null = null;
  gasZone: GasZone | null = null;

  /** Spawn a VFX by key at position */
  spawn(
    key: VfxKey,
    x: number,
    y: number,
    extra?: Record<string, unknown>,
  ) {
    switch (key) {
      case "explosion_red":
        this.spawnExplosion(x, y, "#f87171", "#fca5a5", extra?.radius as number ?? 100);
        break;
      case "explosion_orange":
        this.spawnExplosion(x, y, "#fb923c", "#fbbf24", extra?.radius as number ?? 140);
        this.spawnExplosion(x, y, "#fbbf24", "#fef08a", (extra?.radius as number ?? 140) * 0.6);
        break;
      case "fast_explosion":
        this.spawnExplosion(x, y, "#fb923c", "#ef4444", extra?.radius as number ?? 170);
        this.spawnExplosion(x, y, "#fbbf24", "#ffffff", (extra?.radius as number ?? 170) * 0.5);
        this.flashes.push({ color: "rgba(251,191,36,0.15)", alpha: 0.4, decay: 0.03 });
        break;
      // ── Element-specific colored explosions (BIG) ──
      case "explosion_hydrogen":
        this.spawnExplosion(x, y, "#60a5fa", "#93c5fd", 200);
        this.spawnExplosion(x, y, "#ffffff", "#bfdbfe", 130);
        this.spawnExplosion(x, y, "#3b82f6", "#60a5fa", 80);
        this.spawnRing(x, y, "#60a5fa", 90);
        this.spawnRing(x, y, "#93c5fd", 50);
        this.flashes.push({ color: "rgba(96,165,250,0.25)", alpha: 0.5, decay: 0.015 });
        break;
      case "explosion_lithium":
        this.spawnExplosion(x, y, "#dc2626", "#f87171", 220);
        this.spawnExplosion(x, y, "#fca5a5", "#ffffff", 140);
        this.spawnExplosion(x, y, "#b91c1c", "#dc2626", 90);
        this.spawnRing(x, y, "#dc2626", 100);
        this.spawnRing(x, y, "#f87171", 55);
        this.flashes.push({ color: "rgba(220,38,38,0.25)", alpha: 0.5, decay: 0.015 });
        break;
      case "explosion_sodium":
        this.spawnExplosion(x, y, "#eab308", "#fbbf24", 250);
        this.spawnExplosion(x, y, "#fde047", "#ffffff", 160);
        this.spawnExplosion(x, y, "#ca8a04", "#eab308", 100);
        this.spawnRing(x, y, "#eab308", 110);
        this.spawnRing(x, y, "#fde047", 60);
        this.flashes.push({ color: "rgba(234,179,8,0.35)", alpha: 0.6, decay: 0.012 });
        break;
      case "explosion_potassium":
        this.spawnExplosion(x, y, "#a855f7", "#c084fc", 260);
        this.spawnExplosion(x, y, "#e9d5ff", "#ffffff", 170);
        this.spawnExplosion(x, y, "#7c3aed", "#a855f7", 110);
        this.spawnRing(x, y, "#a855f7", 120);
        this.spawnRing(x, y, "#c084fc", 65);
        this.flashes.push({ color: "rgba(168,85,247,0.3)", alpha: 0.55, decay: 0.012 });
        break;
      case "explosion_rubidium":
        this.spawnExplosion(x, y, "#dc2626", "#f87171", 280);
        this.spawnExplosion(x, y, "#fbbf24", "#fef08a", 180);
        this.spawnExplosion(x, y, "#ef4444", "#fb923c", 120);
        this.spawnRing(x, y, "#ef4444", 130);
        this.spawnRing(x, y, "#fbbf24", 70);
        this.flashes.push({ color: "rgba(220,38,38,0.3)", alpha: 0.6, decay: 0.01 });
        break;
      case "explosion_cesium":
        this.spawnExplosion(x, y, "#2563eb", "#60a5fa", 300);
        this.spawnExplosion(x, y, "#93c5fd", "#ffffff", 200);
        this.spawnExplosion(x, y, "#1d4ed8", "#3b82f6", 130);
        this.spawnRing(x, y, "#3b82f6", 140);
        this.spawnRing(x, y, "#60a5fa", 75);
        this.flashes.push({ color: "rgba(37,99,235,0.35)", alpha: 0.65, decay: 0.01 });
        break;
      case "paddle_grow":
        this.spawnSparks(x, y, 10, "#4ade80");
        this.spawnRing(x, y, "#22c55e", 30);
        break;
      case "chain_lightning":
        this.spawnLightning(x, y, extra?.tx as number ?? x, extra?.ty as number ?? y);
        break;
      case "shard_splash":
        this.spawnShards(x, y, extra?.count as number ?? 4, extra?.range as number ?? 80);
        break;
      case "sharp_reflect":
        this.spawnSparks(x, y, 6, "#60a5fa");
        break;
      case "shield_blue":
        this.shield = { endTime: performance.now() + (extra?.duration as number ?? 4000) };
        this.spawnSparks(x, y, 8, "#38bdf8");
        break;
      case "lift_white":
        this.spawnLiftParticles(x, y);
        break;
      case "slow_blue":
        this.spawnRing(x, y, "#818cf8", 30);
        break;
      case "powerup_gold":
        this.spawnSparks(x, y, 12, "#fbbf24");
        this.spawnRing(x, y, "#fbbf24", 25);
        break;
      case "neon_bounce":
        this.spawnSparks(x, y, 8, "#a78bfa");
        this.flashes.push({ color: "rgba(139,92,246,0.1)", alpha: 0.25, decay: 0.02 });
        break;
      case "trajectory_line":
        this.spawnSparks(x, y, 6, "#a78bfa");
        break;
      case "trail_fire":
        this.spawnSparks(x, y, 8, "#f97316");
        break;
      case "corrosion_green":
        this.spawnSmoke(x, y, extra?.radius as number ?? 120, "#84cc16", "#65a30d");
        break;
      case "gas_yellow": {
        const dur = extra?.duration as number ?? 3000;
        const h = extra?.height as number ?? 100;
        this.gasZone = { endTime: performance.now() + dur, height: h };
        this.spawnSmoke(x, y, 80, "#eab308", "#ca8a04");
        break;
      }
      case "paddle_shrink":
        this.spawnSparks(x, y, 6, "#84cc16");
        break;
      case "freeze_ice":
        this.spawnIce(x, y, extra?.radius as number ?? 120);
        break;
      case "flash_white": {
        this.flashes.push({ color: "rgba(255,255,255,0.25)", alpha: 0.5, decay: 0.04 });
        const bonus = extra?.bonus as number;
        if (bonus) {
          this.particles.push({
            x, y, vx: 0, vy: -1.5,
            life: 50, maxLife: 50,
            color: "#fbbf24", size: 14,
            type: "text", text: `+${bonus}`,
          });
        }
        break;
      }
      case "boss_shatter":
        this.spawnExplosion(x, y, "#fb923c", "#dc2626", 200);
        this.spawnExplosion(x, y, "#fbbf24", "#ffffff", 120);
        this.spawnShards(x, y, 12, 150);
        this.flashes.push({ color: "rgba(234,88,12,0.3)", alpha: 0.6, decay: 0.015 });
        break;
      // ── New category-based VFX ──
      case "metal_reflect":
        this.spawnSparks(x, y, 5, "#94a3b8");
        this.spawnSparks(x, y, 3, "#cbd5e1");
        break;
      case "dense_block":
        this.spawnSparks(x, y, 4, "#a1a1aa");
        break;
      case "radiation_burst":
        this.spawnExplosion(x, y, "#a3e635", "#4ade80", extra?.radius as number ?? 130);
        this.spawnRing(x, y, "#a3e635", 35);
        this.flashes.push({ color: "rgba(163,230,53,0.1)", alpha: 0.3, decay: 0.02 });
        break;
      case "rare_sparkle": {
        this.spawnSparks(x, y, 10, "#c084fc");
        this.spawnSparks(x, y, 6, "#e879f9");
        this.spawnRing(x, y, "#c084fc", 20);
        const rb = extra?.bonus as number;
        if (rb) {
          this.particles.push({
            x, y, vx: 0, vy: -1.5,
            life: 45, maxLife: 45,
            color: "#e879f9", size: 12,
            type: "text", text: `+${rb}`,
          });
        }
        break;
      }
      case "conduct_pulse":
        this.spawnRing(x, y, "#fbbf24", extra?.range as number ?? 120 * 0.3);
        this.spawnSparks(x, y, 6, "#fbbf24");
        break;
      case "heavy_impact":
        this.spawnShards(x, y, 6, 60);
        this.spawnSparks(x, y, 4, "#71717a");
        break;
      case "score_glow": {
        this.spawnSparks(x, y, 6, "#facc15");
        const sb = extra?.bonus as number;
        if (sb) {
          this.particles.push({
            x, y, vx: 0, vy: -1.3,
            life: 40, maxLife: 40,
            color: "#facc15", size: 11,
            type: "text", text: `+${sb}`,
          });
        }
        break;
      }
      case "phase_through":
        this.spawnRing(x, y, "#38bdf8", 25);
        this.spawnSparks(x, y, 5, "#7dd3fc");
        break;
      case "none":
      default:
        break;
    }
  }

  // ── Spawn helpers ─────────────────────────────────────

  private spawnExplosion(x: number, y: number, c1: string, c2: string, radius: number) {
    const count = Math.floor(radius / 4);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: Math.random() > 0.5 ? c1 : c2,
        size: 2 + Math.random() * 3,
        type: "spark",
      });
    }
  }

  private spawnSparks(x: number, y: number, count: number, color: string) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 2;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color,
        size: 1.5 + Math.random() * 2,
        type: "spark",
      });
    }
  }

  private spawnShards(x: number, y: number, count: number, range: number) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 2;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: "#94a3b8",
        size: 3 + Math.random() * (range / 30),
        type: "shard",
      });
    }
  }

  private spawnSmoke(x: number, y: number, radius: number, c1: string, c2: string) {
    const count = Math.floor(radius / 8);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius * 0.5;
      this.particles.push({
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5 - 0.3,
        life: 40 + Math.random() * 20,
        maxLife: 60,
        color: Math.random() > 0.5 ? c1 : c2,
        size: 5 + Math.random() * 6,
        type: "smoke",
      });
    }
  }

  private spawnIce(x: number, y: number, radius: number) {
    const count = Math.floor(radius / 6);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 2;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 35 + Math.random() * 15,
        maxLife: 50,
        color: Math.random() > 0.5 ? "#7dd3fc" : "#bae6fd",
        size: 2 + Math.random() * 3,
        type: "spark",
      });
    }
    this.spawnRing(x, y, "#38bdf8", radius * 0.3);
  }

  private spawnLiftParticles(x: number, y: number) {
    for (let i = 0; i < 10; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 20,
        y,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -(1.5 + Math.random() * 2),
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: Math.random() > 0.5 ? "#e2e8f0" : "#f8fafc",
        size: 2 + Math.random() * 2,
        type: "spark",
      });
    }
  }

  private spawnLightning(x1: number, y1: number, x2: number, y2: number) {
    this.bolts.push({
      x1, y1, x2, y2,
      life: 15,
      maxLife: 15,
      color: "#93c5fd",
    });
    // Spark at target
    this.spawnSparks(x2, y2, 5, "#93c5fd");
  }

  private spawnRing(x: number, y: number, color: string, size: number) {
    this.particles.push({
      x, y, vx: 0, vy: 0,
      life: 20, maxLife: 20,
      color, size,
      type: "ring",
    });
  }

  // ── Per-frame update & render ─────────────────────────

  update() {
    const now = performance.now();

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 1;
      if (p.type === "smoke") {
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.size *= 1.01;
      }
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // Update bolts
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      this.bolts[i].life -= 1;
      if (this.bolts[i].life <= 0) this.bolts.splice(i, 1);
    }

    // Update flashes
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].alpha -= this.flashes[i].decay;
      if (this.flashes[i].alpha <= 0) this.flashes.splice(i, 1);
    }

    // Shield expiry
    if (this.shield && now > this.shield.endTime) this.shield = null;
    // Gas zone expiry
    if (this.gasZone && now > this.gasZone.endTime) this.gasZone = null;
  }

  render(ctx: CanvasRenderingContext2D, gameWidth: number, gameHeight: number) {
    // ── Screen flashes (behind everything) ──
    for (const f of this.flashes) {
      ctx.fillStyle = f.color;
      ctx.globalAlpha = f.alpha;
      ctx.fillRect(0, 0, gameWidth, gameHeight);
      ctx.globalAlpha = 1;
    }

    // ── Gas zone overlay ──
    if (this.gasZone) {
      const progress = Math.max(
        0,
        (this.gasZone.endTime - performance.now()) /
          ((this.gasZone.endTime - performance.now()) + 1000),
      );
      ctx.fillStyle = "rgba(234,179,8,0.08)";
      ctx.globalAlpha = 0.3 * progress + 0.1;
      ctx.fillRect(0, gameHeight - this.gasZone.height, gameWidth, this.gasZone.height);
      ctx.globalAlpha = 1;
    }

    // ── Lightning bolts ──
    for (const bolt of this.bolts) {
      const alpha = bolt.life / bolt.maxLife;
      ctx.strokeStyle = bolt.color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 2;

      // Jagged line
      ctx.beginPath();
      ctx.moveTo(bolt.x1, bolt.y1);
      const segs = 5;
      const dx = (bolt.x2 - bolt.x1) / segs;
      const dy = (bolt.y2 - bolt.y1) / segs;
      for (let s = 1; s < segs; s++) {
        ctx.lineTo(
          bolt.x1 + dx * s + (Math.random() - 0.5) * 12,
          bolt.y1 + dy * s + (Math.random() - 0.5) * 12,
        );
      }
      ctx.lineTo(bolt.x2, bolt.y2);
      ctx.stroke();

      // Glow
      ctx.shadowBlur = 10;
      ctx.shadowColor = bolt.color;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // ── Particles ──
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;

      if (p.type === "text" && p.text) {
        ctx.fillStyle = p.color;
        ctx.font = `bold ${p.size}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(p.text, p.x, p.y);
      } else if (p.type === "ring") {
        const progress = 1 - p.life / p.maxLife;
        const radius = p.size + progress * p.size * 2;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2 * (1 - progress);
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.type === "smoke") {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === "shard") {
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.fillRect(-p.size, -1, p.size * 2, 2);
        ctx.restore();
      } else {
        // spark
        ctx.shadowBlur = 6;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      ctx.globalAlpha = 1;
    }

    // ── Floor shield bar ──
    if (this.shield) {
      const remaining = Math.max(0, this.shield.endTime - performance.now());
      const total = 4000;
      const pct = remaining / total;
      ctx.shadowBlur = 12;
      ctx.shadowColor = "rgba(56,189,248,0.6)";
      ctx.fillStyle = `rgba(56,189,248,${0.3 + pct * 0.4})`;
      ctx.fillRect(0, gameHeight - 4, gameWidth * pct, 4);
      ctx.shadowBlur = 0;
    }
  }

  clear() {
    this.particles = [];
    this.flashes = [];
    this.bolts = [];
    this.shield = null;
    this.gasZone = null;
  }
}
