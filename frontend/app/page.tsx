"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useConnection } from "wagmi";
import { formatUnits } from "viem";
import { ConnectButton } from "@/components/ConnectButton";
import { useWalletRole } from "@/hooks/useWalletRole";

const TICKER = [
  "Perceptual hash matching",
  "On-chain provenance",
  "Automated DMCA filing",
  "ERC-1155 license tokens",
  "Automatic USDC payouts",
  "Publisher escrow",
  "Real-time detection",
  "Ethereum Sepolia",
];

export default function Home() {
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("visible"); }),
      { threshold: 0.1 }
    );
    document.querySelectorAll(".ew-fade").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <main className="min-h-screen bg-[#0a0806] overflow-x-hidden">
      {/* Nav */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-8 py-5 border-b border-white/[0.07] bg-[#0a0806]/88 backdrop-blur-md">
        <div className="font-bold text-lg tracking-tight text-[#f5f0eb]">
          Eye<span className="text-orange-500">:</span>Witness
        </div>
        <div className="hidden md:flex items-center gap-7">
          <a href="#how" className="text-sm text-[#a89f96] hover:text-[#f5f0eb] transition-colors">How it works</a>
          <a href="#roles" className="text-sm text-[#a89f96] hover:text-[#f5f0eb] transition-colors">Pricing</a>
        </div>
        <ConnectButton />
      </nav>

      {/* Role-aware banner — shown only when a wallet is connected */}
      <RoleBanner />

      {/* Hero */}
      <section className="relative min-h-[88vh] flex flex-col items-center justify-center text-center px-6 py-24 overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute w-[520px] h-[520px] rounded-full -top-32 -left-24 bg-[#c2410c] opacity-[0.13] blur-[90px]" />
          <div className="absolute w-[420px] h-[420px] rounded-full -bottom-20 -right-20 bg-[#7c2d12] opacity-[0.12] blur-[90px]" />
          <div className="absolute w-[360px] h-[360px] rounded-full top-[35%] left-1/2 -translate-x-1/2 bg-[#ea580c] opacity-[0.08] blur-[80px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[720px] h-[720px]">
            <div className="w-full h-full rounded-full border border-white/[0.04] ew-spin-slow" />
          </div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px]">
            <div className="w-full h-full rounded-full border border-dashed border-orange-500/[0.09] ew-spin-rev" />
          </div>
        </div>

        {/* Badge */}
        <div className="relative inline-flex items-center gap-2.5 bg-white/[0.05] border border-white/[0.1] rounded-full px-4 py-1.5 text-xs text-[#a89f96] mb-7 ew-fadein">
          <span className="w-2 h-2 rounded-full bg-orange-500 ew-pulse-ring" />
          Autonomous photo rights enforcement
        </div>

        {/* Headline */}
        <h1
          className="relative text-[clamp(44px,6vw,82px)] font-bold leading-[1.06] tracking-[-2.5px] mb-6 ew-fadein"
          style={{ animationDelay: "100ms", fontFamily: "var(--font-display, inherit)" }}
        >
          Your photos.<br />
          <span className="ew-text-dawn">Enforced automatically.</span>
        </h1>

        <p
          className="relative text-[17px] text-[#a89f96] max-w-[540px] leading-relaxed mb-10 ew-fadein"
          style={{ animationDelay: "200ms" }}
        >
          An autonomous agent crawls the web, detects unlicensed use via perceptual hashing,
          and triggers on-chain micropayments to your wallet — with zero human involvement.
        </p>

        <div
          className="relative flex gap-3 flex-wrap justify-center ew-fadein"
          style={{ animationDelay: "300ms" }}
        >
          <Link
            href="/register"
            className="rounded-xl bg-orange-500 px-7 py-3.5 font-semibold text-white hover:bg-orange-600 transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(249,115,22,0.3)]"
          >
            Register a Photo
          </Link>
          <Link
            href="/dashboard/photographer"
            className="rounded-xl border border-white/[0.14] bg-transparent px-7 py-3.5 font-semibold text-[#f5f0eb] hover:bg-white/[0.05] transition-all hover:-translate-y-0.5"
          >
            View Dashboard
          </Link>
        </div>

        {/* Stats */}
        <div
          className="relative flex gap-14 mt-20 ew-fadein"
          style={{ animationDelay: "500ms" }}
        >
          <div className="text-center">
            <div className="text-[30px] font-extrabold text-[#f5f0eb]"><span className="text-orange-400">24</span>/7</div>
            <div className="text-xs text-[#6b6259] mt-1">Autonomous monitoring</div>
          </div>
          <div className="text-center">
            <div className="text-[30px] font-extrabold text-[#f5f0eb]">$<span className="text-orange-400">0</span></div>
            <div className="text-xs text-[#6b6259] mt-1">Manual effort required</div>
          </div>
          <div className="text-center">
            <div className="text-[30px] font-extrabold text-[#f5f0eb]"><span className="text-orange-400">100</span>%</div>
            <div className="text-xs text-[#6b6259] mt-1">On-chain provenance</div>
          </div>
        </div>
      </section>

      {/* Ticker */}
      <div className="overflow-hidden border-y border-white/[0.07] py-4 bg-[#0c0a08]">
        <div className="flex whitespace-nowrap ew-ticker">
          {[...TICKER, ...TICKER].map((item, i) => (
            <span key={i} className="inline-flex items-center gap-2.5 px-10 text-xs text-[#6b6259]">
              <span className="w-1 h-1 rounded-full bg-orange-500 flex-shrink-0" />
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* How it works */}
      <section id="how" className="px-6 py-24">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14 ew-fade">
            <div className="inline-block text-[11px] font-semibold text-orange-400 tracking-widest uppercase bg-orange-500/[0.08] border border-orange-500/[0.18] rounded-full px-3 py-1 mb-4">
              How it works
            </div>
            <h2 className="text-[clamp(28px,4vw,46px)] font-bold tracking-tight leading-tight">
              Register once.<br />The agent does the rest.
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-white/[0.07] border border-white/[0.07] rounded-2xl overflow-hidden ew-fade">
            {[
              { step: "01", icon: "📷", title: "Register your photo", desc: "Upload a photo — we extract timestamp and GPS from EXIF, compute image + metadata hashes, and commit both on-chain with your wallet and license prices." },
              { step: "02", icon: "🔍", title: "Agent crawls the web", desc: "The autonomous agent runs 24/7 — visiting pages, extracting images, and computing perceptual hashes to find your photo even if resized or compressed." },
              { step: "03", icon: "🔒", title: "Provenance verified", desc: "On a match, the agent re-extracts EXIF from the found image and recomputes the metadata hash. It must match the on-chain record — tampered copies fail." },
              { step: "04", icon: "⚡", title: "Payment or enforcement", desc: "Publishers with escrow are charged automatically — USDC hits your wallet. All others receive an instant DMCA takedown notice, resolved by paying on-chain." },
            ].map((card) => (
              <div key={card.step} className="bg-[#0c0a08] p-8 hover:bg-[#131009] transition-colors">
                <div className="text-[11px] font-bold text-orange-500 tracking-widest uppercase mb-5">Step {card.step}</div>
                <div className="w-11 h-11 bg-orange-500/[0.1] border border-orange-500/[0.2] rounded-xl flex items-center justify-center text-xl mb-4">{card.icon}</div>
                <h3 className="text-[15px] font-semibold text-[#f5f0eb] mb-2.5">{card.title}</h3>
                <p className="text-sm text-[#a89f96] leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature sections */}
      <section className="px-6 py-16 bg-[#0c0a08]">
        <div className="max-w-5xl mx-auto space-y-24">

          {/* Detection agent */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center ew-fade">
            <div>
              <div className="inline-block text-[11px] font-semibold text-orange-400 tracking-widest uppercase bg-orange-500/[0.08] border border-orange-500/[0.18] rounded-full px-3 py-1 mb-5">
                Detection agent
              </div>
              <h2 className="text-[clamp(22px,3vw,36px)] font-bold tracking-tight leading-tight mb-5">
                Fully autonomous.<br />No humans in the loop.
              </h2>
              <ul className="space-y-3.5">
                {[
                  "Perceptual hashing matches crops, resizes, and edits — not just exact copies",
                  "Double verification: pHash match + metadata hash provenance check against EXIF",
                  "Automatic use-type detection: editorial, commercial, or AI training",
                  "No external AI dependencies — runs standalone with zero setup",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-[#a89f96] leading-relaxed">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-orange-500/[0.1] border border-orange-500/[0.25] flex items-center justify-center flex-shrink-0">
                      <span className="w-2 h-2 rounded-full bg-orange-500" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            {/* Agent log mock */}
            <div className="bg-[#0a0806] border border-white/[0.08] rounded-2xl p-6 relative overflow-hidden">
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: "radial-gradient(circle at 70% 30%, rgba(249,115,22,0.05), transparent 60%)" }}
              />
              <div className="text-[11px] text-[#6b6259] font-mono mb-4">AGENT LOG — LIVE</div>
              <div className="space-y-2.5 font-mono text-xs">
                {[
                  { time: "09:14:22", msg: <>crawling <span className="text-orange-400">techblog.com/article-42</span></> },
                  { time: "09:14:23", msg: <>found <span className="text-orange-400">7 images</span>, computing pHash...</> },
                  { time: "09:14:24", msg: <><span className="text-emerald-400">MATCH</span> — img_3 distance=4 (threshold 10)</> },
                  { time: "09:14:24", msg: <>verifying metadata hash <span className="text-sky-400">on-chain...</span></> },
                  { time: "09:14:25", msg: <><span className="text-emerald-400">VERIFIED</span> — provenance confirmed</> },
                  { time: "09:14:25", msg: <>publisher escrow found: <span className="text-orange-400">$12.50</span></> },
                  { time: "09:14:26", msg: <><span className="text-emerald-400">PAID</span> — $1.00 → 0xF3a2...8B1c</> },
                ].map((line, i) => (
                  <div key={i} className="flex gap-3 text-[#6b6259]">
                    <span className="shrink-0">{line.time}</span>
                    <span className="text-[#a89f96]">{line.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Enforcement */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center ew-fade">
            {/* Detection feed mock */}
            <div className="bg-[#0a0806] border border-white/[0.08] rounded-2xl p-6">
              <div className="text-[11px] text-[#6b6259] font-mono mb-4">DETECTION FEED</div>
              <div className="space-y-2.5">
                {[
                  { dot: "bg-orange-500", label: "randomsite.com/hero.jpg", badge: "Match", bc: "text-orange-400 bg-orange-500/[0.1] border-orange-500/20" },
                  { dot: "bg-[#3a3530]", label: "metadata hash check", badge: "Verified", bc: "text-sky-400 bg-sky-500/[0.1] border-sky-500/20" },
                  { dot: "bg-[#3a3530]", label: "escrow balance: $0.00", badge: "No escrow", bc: "text-violet-400 bg-violet-500/[0.1] border-violet-500/20" },
                  { dot: "bg-orange-500", label: "DMCA → cloudflare.com", badge: "Sent", bc: "text-violet-400 bg-violet-500/[0.1] border-violet-500/20" },
                ].map((row, i) => (
                  <div key={i} className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-2.5">
                    <div className={`w-2 h-2 rounded-full ${row.dot} shrink-0`} />
                    <span className="flex-1 text-xs text-[#a89f96] font-mono">{row.label}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${row.bc}`}>{row.badge}</span>
                  </div>
                ))}
                <div className="h-px bg-white/[0.06] my-1" />
                <div className="text-[11px] text-[#6b6259] font-mono mb-2">RESOLUTION</div>
                {[
                  { label: "publisher deposits escrow + claims domain", badge: "Setup" },
                  { label: "on-chain payment executed automatically", badge: "$1.00" },
                ].map((row, i) => (
                  <div key={i} className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-2.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <span className="flex-1 text-xs text-[#a89f96] font-mono">{row.label}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border text-emerald-400 bg-emerald-500/[0.1] border-emerald-500/20">{row.badge}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="inline-block text-[11px] font-semibold text-orange-400 tracking-widest uppercase bg-orange-500/[0.08] border border-orange-500/[0.18] rounded-full px-3 py-1 mb-5">
                Enforcement
              </div>
              <h2 className="text-[clamp(22px,3vw,36px)] font-bold tracking-tight leading-tight mb-5">
                Unknown infringers face<br />automatic DMCA.
              </h2>
              <ul className="space-y-3.5">
                {[
                  "DMCA takedown filed to hosting provider automatically — no lawyer needed",
                  "On-chain license record serves as immutable legal evidence",
                  "Publishers resolve by depositing escrow and claiming their domain",
                  "Next crawl cycle auto-pays — DMCA resolved without manual intervention",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-[#a89f96] leading-relaxed">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-orange-500/[0.1] border border-orange-500/[0.25] flex items-center justify-center flex-shrink-0">
                      <span className="w-2 h-2 rounded-full bg-orange-500" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Roles / Pricing */}
      <section id="roles" className="px-6 py-24">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14 ew-fade">
            <div className="inline-block text-[11px] font-semibold text-orange-400 tracking-widest uppercase bg-orange-500/[0.08] border border-orange-500/[0.18] rounded-full px-3 py-1 mb-4">
              Pricing
            </div>
            <h2 className="text-[clamp(28px,4vw,46px)] font-bold tracking-tight">Simple, on-chain splits.</h2>
            <p className="text-[#a89f96] mt-3 max-w-md mx-auto text-[15px]">
              Every license fee splits automatically in the smart contract. No invoices. No manual payouts.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-2xl mx-auto ew-fade">
            {[
              {
                tag: "Photographer", title: "Creator", href: "/dashboard/photographer",
                featured: true, amount: "$0", sub: "/setup",
                desc: "Register photos once. Earn on every detected use.",
                features: ["Unlimited photo registration", "Public provenance page", "Real-time payment dashboard", "85% of every license fee", "DMCA enforcement notifications"],
                cta: "Open Dashboard",
              },
              {
                tag: "Publisher", title: "Publisher", href: "/publisher",
                featured: false, amount: "Escrow", sub: " USDC",
                desc: "Deposit once. Auto-licensed on every detected use.",
                features: ["Auto-pay on detection", "ERC-1155 license receipts", "License history dashboard", "Provenance verification", "DMCA-safe coverage"],
                cta: "Deposit Escrow",
              },
            ].map((card) => (
              <div
                key={card.tag}
                className={`rounded-2xl border p-7 transition-all hover:-translate-y-1 ${
                  card.featured
                    ? "border-orange-500/[0.3] bg-[#131009]"
                    : "border-white/[0.08] bg-[#0c0a08]"
                }`}
              >
                <div className="text-[11px] font-semibold text-orange-400 tracking-widest uppercase mb-4">{card.tag}</div>
                <div className="text-[22px] font-bold mb-2 text-[#f5f0eb]">{card.title}</div>
                <div className="text-[36px] font-extrabold text-[#f5f0eb] mb-1">
                  {card.amount}<span className="text-sm font-normal text-[#6b6259]">{card.sub}</span>
                </div>
                <p className="text-sm text-[#a89f96] mb-6 leading-relaxed">{card.desc}</p>
                <div className="h-px bg-white/[0.06] mb-5" />
                <ul className="space-y-2.5 mb-7">
                  {card.features.map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm text-[#a89f96]">
                      <span className="w-4 h-4 rounded-full bg-orange-500/[0.1] border border-orange-500/[0.2] flex items-center justify-center shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={card.href}
                  className={`block w-full py-3 text-center rounded-xl text-sm font-semibold transition-all ${
                    card.featured
                      ? "bg-orange-500 text-white hover:bg-orange-600"
                      : "border border-white/[0.14] text-[#f5f0eb] hover:bg-white/[0.05]"
                  }`}
                >
                  {card.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <div className="text-center px-6 py-20 ew-fade">
        <div className="max-w-lg mx-auto">
          <div className="relative w-36 h-36 mx-auto mb-10 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-orange-500/[0.18] ew-spin-slow" />
            <div className="absolute inset-4 rounded-full border border-dashed border-orange-500/[0.1] ew-spin-rev" />
            <div className="absolute inset-8 rounded-full border border-orange-500/[0.06]" />
            <div className="w-16 h-16 bg-orange-500/[0.1] border border-orange-500/[0.2] rounded-2xl flex items-center justify-center text-xl font-extrabold text-orange-400">
              E:W
            </div>
          </div>
          <h2
            className="text-[clamp(28px,4vw,46px)] font-bold tracking-tight leading-tight mb-4"
            style={{ fontFamily: "var(--font-display, inherit)" }}
          >
            Your photography,<br />
            finally <span className="text-orange-400">self-enforcing.</span>
          </h2>
          <p className="text-[#a89f96] text-lg mb-9">Register a photo in under 2 minutes. The agent starts monitoring immediately.</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link
              href="/register"
              className="rounded-xl bg-orange-500 px-7 py-3.5 font-semibold text-white hover:bg-orange-600 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(249,115,22,0.3)] transition-all"
            >
              Register a Photo
            </Link>
            <Link
              href="/dashboard/photographer"
              className="rounded-xl border border-white/[0.14] px-7 py-3.5 font-semibold text-[#f5f0eb] hover:bg-white/[0.05] hover:-translate-y-0.5 transition-all"
            >
              View Dashboard
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/[0.07] px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="font-bold text-[#f5f0eb]">Eye<span className="text-orange-500">:</span>Witness</div>
        <div className="text-xs text-[#6b6259]">Verified Photography. Automatic Enforcement. On-Chain Payments.</div>
      </footer>
    </main>
  );
}

function RoleBanner() {
  const { isConnected, address } = useConnection();
  const { role, photoCount, escrowBalance, loading } = useWalletRole();

  if (!isConnected || !address) return null;
  if (loading && role === "none") {
    return (
      <div className="border-b border-white/[0.07] bg-[#0c0a08] px-8 py-3 text-xs text-[#6b6259]">
        Detecting role for {address.slice(0, 6)}…{address.slice(-4)}…
      </div>
    );
  }

  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const balanceDisplay = `$${formatUnits(escrowBalance, 6)}`;

  const cards: Array<{ href: string; title: string; sub: string; primary?: boolean }> = [];
  if (role === "photographer" || role === "both") {
    cards.push({
      href: "/dashboard/photographer",
      title: "Photographer Dashboard",
      sub: `${photoCount} photo${photoCount === 1 ? "" : "s"} registered`,
      primary: role === "photographer",
    });
  }
  if (role === "publisher" || role === "both") {
    cards.push({
      href: "/publisher",
      title: "Publisher Dashboard",
      sub: `${balanceDisplay} in escrow`,
      primary: role === "publisher",
    });
  }
  if (role === "none") {
    cards.push(
      { href: "/register", title: "I'm a photographer", sub: "Register your first photo" },
      { href: "/publisher", title: "I'm a publisher", sub: "Deposit USDC to license photos" },
    );
  }

  const heading =
    role === "both" ? "Welcome back. You can act as either role."
    : role === "photographer" ? "Welcome back, photographer."
    : role === "publisher" ? "Welcome back, publisher."
    : "What would you like to do?";

  return (
    <div className="border-b border-white/[0.07] bg-[#0c0a08]">
      <div className="max-w-5xl mx-auto px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs text-[#6b6259] uppercase tracking-widest mb-1">
            Connected as <span className="font-mono text-[#a89f96]">{short}</span>
          </p>
          <p className="text-sm text-[#f5f0eb]">{heading}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {cards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-all hover:-translate-y-0.5 ${
                c.primary
                  ? "bg-orange-500 text-white hover:bg-orange-600"
                  : "border border-white/[0.14] text-[#f5f0eb] hover:bg-white/[0.05]"
              }`}
            >
              <span className="block">{c.title}</span>
              <span className={`block text-[11px] mt-0.5 ${c.primary ? "text-orange-100/80" : "text-[#6b6259]"}`}>
                {c.sub}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
