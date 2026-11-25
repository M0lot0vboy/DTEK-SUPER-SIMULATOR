import { i as __toESM } from "../_runtime.mjs";
import { K as require_react, b as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as ZapOff, t as Zap } from "../_libs/lucide-react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-DsWzlxTv.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var SLICES = [
	{
		id: "off",
		label: "ОТКЛЮЧИЛИ"
	},
	{
		id: "on",
		label: "НЕ ОТКЛЮЧИЛИ"
	},
	{
		id: "off",
		label: "ОТКЛЮЧИЛИ"
	},
	{
		id: "on",
		label: "НЕ ОТКЛЮЧИЛИ"
	},
	{
		id: "off",
		label: "ОТКЛЮЧИЛИ"
	},
	{
		id: "on",
		label: "НЕ ОТКЛЮЧИЛИ"
	},
	{
		id: "off",
		label: "ОТКЛЮЧИЛИ"
	},
	{
		id: "on",
		label: "НЕ ОТКЛЮЧИЛИ"
	}
];
var EMPTY = {
	spins: 0,
	off: 0,
	on: 0,
	last: []
};
var KEY = "dtek-roulette-v1";
var SLICE = 360 / SLICES.length;
function loadStats() {
	if (typeof window === "undefined") return EMPTY;
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return EMPTY;
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed.spins !== "number") return EMPTY;
		return {
			spins: parsed.spins,
			off: parsed.off ?? 0,
			on: parsed.on ?? 0,
			last: Array.isArray(parsed.last) ? parsed.last.slice(0, 8) : []
		};
	} catch {
		return EMPTY;
	}
}
function Home() {
	const [rotation, setRotation] = (0, import_react.useState)(0);
	const [spinning, setSpinning] = (0, import_react.useState)(false);
	const [result, setResult] = (0, import_react.useState)(null);
	const [stats, setStats] = (0, import_react.useState)(EMPTY);
	const [ready, setReady] = (0, import_react.useState)(false);
	const [flash, setFlash] = (0, import_react.useState)(null);
	const timer = (0, import_react.useRef)(null);
	const audio = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		setStats(loadStats());
		setReady(true);
		return () => {
			if (timer.current) window.clearTimeout(timer.current);
		};
	}, []);
	const wheelPath = (0, import_react.useMemo)(() => buildWheel(), []);
	function tick(freq, dur = .04) {
		const ctx = audio.current;
		if (!ctx) return;
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = "square";
		osc.frequency.value = freq;
		gain.gain.setValueAtTime(.04, ctx.currentTime);
		gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + dur);
		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.start();
		osc.stop(ctx.currentTime + dur);
	}
	function spin() {
		if (spinning) return;
		if (!audio.current) {
			const Ctx = window.AudioContext || window.webkitAudioContext;
			audio.current = new Ctx();
		}
		audio.current.resume();
		const index = Math.floor(Math.random() * SLICES.length);
		const outcome = SLICES[index].id;
		const turns = 5 + Math.floor(Math.random() * 3);
		const jitter = (Math.random() - .5) * (SLICE * .5);
		const currentMod = (rotation % 360 + 360) % 360;
		let delta = ((360 - (index * SLICE + SLICE / 2) + jitter) % 360 + 360) % 360 - currentMod;
		if (delta < 0) delta += 360;
		const next = rotation + turns * 360 + delta;
		setSpinning(true);
		setResult(null);
		setFlash(null);
		setRotation(next);
		const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 80 : 4600;
		let clicks = 0;
		const clickTimer = window.setInterval(() => {
			clicks += 1;
			tick(180 + clicks % 4 * 40, .03);
			if (clicks > 18) window.clearInterval(clickTimer);
		}, 180);
		timer.current = window.setTimeout(() => {
			window.clearInterval(clickTimer);
			tick(outcome === "off" ? 110 : 440, .18);
			setSpinning(false);
			setResult(outcome);
			setFlash(outcome);
			setStats((prev) => {
				const updated = {
					spins: prev.spins + 1,
					off: prev.off + (outcome === "off" ? 1 : 0),
					on: prev.on + (outcome === "on" ? 1 : 0),
					last: [outcome, ...prev.last].slice(0, 8)
				};
				localStorage.setItem(KEY, JSON.stringify(updated));
				return updated;
			});
			window.setTimeout(() => setFlash(null), 700);
		}, duration);
	}
	const offShare = stats.spins ? Math.round(stats.off / stats.spins * 100) : 50;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "relative mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6 sm:px-6 sm:py-10",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				"aria-hidden": true,
				className: `pointer-events-none absolute inset-0 transition-opacity duration-300 ${flash === "off" ? "bg-off/25 opacity-100" : flash === "on" ? "bg-amber/20 opacity-100" : "opacity-0"}`
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "relative mb-6 flex items-end justify-between gap-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "font-display text-xs tracking-[0.22em] text-amber uppercase",
						children: "график не обещан"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "font-display mt-1 text-3xl leading-none font-extrabold sm:text-5xl",
						children: "Рулетка ДТЕК"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-3 max-w-md text-sm leading-relaxed text-muted sm:text-base",
						children: "Как раньше шутили про РКН — только про розетку. Крутишь, и либо свет есть, либо уже пипец."
					})
				] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "hidden shrink-0 rounded-full border border-line bg-surface px-3 py-2 text-right sm:block",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[11px] tracking-widest text-muted uppercase",
						children: "сегодня"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "font-display text-lg text-amber",
						children: [offShare, "% тьмы"]
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "relative flex flex-1 flex-col items-center",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "relative aspect-square w-full max-w-[min(100%,26rem)]",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "absolute top-0 left-1/2 z-20 -translate-x-1/2 -translate-y-1",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-0 w-0 border-x-[14px] border-t-[26px] border-x-transparent border-t-amber drop-shadow-[0_6px_0_#1a1612]" })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "absolute inset-3 rounded-full border border-line bg-ink shadow-[0_20px_60px_rgba(0,0,0,0.45)]",
							style: {
								transform: `rotate(${rotation}deg)`,
								transition: spinning ? "transform 4.6s cubic-bezier(0.12, 0.72, 0.08, 1)" : "none"
							},
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
								viewBox: "0 0 100 100",
								className: "h-full w-full",
								children: [
									wheelPath,
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
										cx: "50",
										cy: "50",
										r: "8",
										fill: "#141210",
										stroke: "#e8a317",
										strokeWidth: "1.4"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
										x: "50",
										y: "51.4",
										textAnchor: "middle",
										fill: "#e8a317",
										fontSize: "4.2",
										fontFamily: "Unbounded, sans-serif",
										children: "ДТЕК"
									})
								]
							})
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: spin,
						disabled: spinning,
						className: "font-display relative z-10 mt-8 min-h-14 w-full max-w-xs rounded-full bg-amber px-8 text-base font-extrabold tracking-wide text-ink transition-transform enabled:hover:scale-[1.02] enabled:active:scale-[0.98] disabled:opacity-60",
						children: spinning ? "считаем график…" : result ? "ещё раз" : "крутить"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-6 min-h-28 w-full max-w-md text-center",
						"aria-live": "polite",
						children: [
							!ready || !result && !spinning ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-muted",
								children: "Четыре «отключили» и четыре «не отключили». Шансы честные. Реальность — нет."
							}) : null,
							spinning ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "font-display text-lg text-amber",
								children: "колёсико думает…"
							}) : null,
							result === "off" && !spinning ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "rounded-2xl border border-off/40 bg-surface px-5 py-4",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "font-display flex items-center justify-center gap-2 text-2xl text-off",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ZapOff, {
										className: "size-6",
										"aria-hidden": true
									}), "ОТКЛЮЧИЛИ"]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-2 text-sm text-muted",
									children: "Плановые работы. Свечи уже в моде, чайник — нет."
								})]
							}) : null,
							result === "on" && !spinning ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "rounded-2xl border border-amber/40 bg-surface px-5 py-4",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "font-display flex items-center justify-center gap-2 text-2xl text-amber",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Zap, {
										className: "size-6",
										"aria-hidden": true
									}), "НЕ ОТКЛЮЧИЛИ"]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-2 text-sm text-muted",
									children: "Чудо. Розетка ещё жива. Не верь до конца."
								})]
							}) : null
						]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("footer", {
				className: "relative mt-4 grid grid-cols-3 gap-2 text-center",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "круток",
						value: String(stats.spins)
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "тьмы",
						value: String(stats.off),
						tone: "off"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "света",
						value: String(stats.on),
						tone: "on"
					}),
					stats.last.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "col-span-3 mt-2 flex flex-wrap justify-center gap-1.5",
						children: stats.last.map((item, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: `rounded-full px-2.5 py-1 text-[11px] tracking-wide uppercase ${item === "off" ? "bg-off/15 text-off" : "bg-amber/15 text-amber"}`,
							children: item === "off" ? "выкл" : "вкл"
						}, `${item}-${i}`))
					}) : null
				]
			})
		]
	});
}
function Stat({ label, value, tone }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-2xl border border-line bg-surface px-2 py-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: `font-display text-2xl ${tone === "off" ? "text-off" : tone === "on" ? "text-amber" : "text-fg"}`,
			children: value
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-[11px] tracking-widest text-muted uppercase",
			children: label
		})]
	});
}
function buildWheel() {
	return SLICES.map((slice, i) => {
		const start = (i * SLICE - 90) * (Math.PI / 180);
		const end = ((i + 1) * SLICE - 90) * (Math.PI / 180);
		const large = SLICE > 180 ? 1 : 0;
		const x1 = 50 + 46 * Math.cos(start);
		const y1 = 50 + 46 * Math.sin(start);
		const x2 = 50 + 46 * Math.cos(end);
		const y2 = 50 + 46 * Math.sin(end);
		const midDeg = i * SLICE + SLICE / 2;
		const mid = (midDeg - 90) * (Math.PI / 180);
		const tx = 50 + 31 * Math.cos(mid);
		const ty = 50 + 31 * Math.sin(mid);
		const fill = slice.id === "off" ? "#d64545" : "#e8a317";
		const ink = slice.id === "off" ? "#f4efe6" : "#1a1612";
		const upright = midDeg;
		return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: `M50 50 L${x1} ${y1} A46 46 0 ${large} 1 ${x2} ${y2} Z`,
			fill
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
			x: tx,
			y: ty,
			fill: ink,
			fontSize: "3.15",
			fontFamily: "Unbounded, sans-serif",
			fontWeight: "700",
			textAnchor: "middle",
			dominantBaseline: "middle",
			transform: `rotate(${upright} ${tx} ${ty})`,
			children: slice.id === "off" ? "ВЫКЛ" : "ВКЛ"
		})] }, i);
	});
}
//#endregion
export { Home as component };
