import { Players, TweenService } from "@rbxts/services";
import { GameConfig } from "shared/config";
import { DEFAULT_UI_KIT, UI_KITS, type UiKit, type UiOrnament, type UiPress } from "./kits.generated";

/**
 * UI kit — one of the design systems of `src/ui/kits.generated.ts` (paper cartoon, candy pop, neon
 * cyber, holo HUD, grim horror, pixel retro, arcade synth, clean modern, soft glass, parchment
 * fantasy, stone & rune, military stencil, steampunk brass, wood & leaf, black & gold, kawaii
 * pastel…). `GameConfig.ui.kit` picks the library; everything here — panels, buttons, text, pills,
 * badges, bars, icons, tooltips — reads its tokens (colours, fonts) and its shape language (corner
 * radius, outline weight, gradients, shadow, bevel, text outline, panel transparency), draws the
 * kit's ornament on every panel (rivets, scanlines, brackets, filigree, stripes, glow, grain, notch)
 * and uses its button feedback. Switching library = one field, no other change.
 */
export interface Theme {
	/** id / display name of the library in use */
	kit: string;
	kitName: string;
	paper: Color3;
	paperDark: Color3;
	ink: Color3;
	inkSoft: Color3;
	text: Color3;
	textDark: Color3;
	/** primary gradient (buttons, featured banner): top → bottom */
	primary: [Color3, Color3];
	/** premium / bundle gradient */
	gold: [Color3, Color3];
	danger: [Color3, Color3];
	info: [Color3, Color3];
	/** price pills */
	pill: Color3;
	pillStroke: Color3;
	/** dark item tiles */
	tile: Color3;
	tileStroke: Color3;
	font: Enum.Font;
	fontBody: Enum.Font;
	radius: number;
	/** outline weight of panels and tiles */
	strokeThickness: number;
	/** vertical gradients on panels, buttons and bars */
	gradients: boolean;
	/** drop shadow offset (0 = flat kit) */
	shadowOffset: number;
	shadowTransparency: number;
	/** darker band at the bottom of buttons */
	bevel: boolean;
	/** text outline thickness (0 = flat type) */
	textOutline: number;
	/** panel background transparency (glass kits) */
	panelTransparency: number;
	ornament: UiOrnament;
	press: UiPress;
	/** accent colour of the world's style family (GameConfig.ui.accentColor) */
	accent: Color3;
}

const hex = (h: string) => Color3.fromHex(h);
const UI = GameConfig.ui as { kit?: string; style?: string; accentColor?: string };
const ACCENT = hex(UI.accentColor ?? "#7ed957");

function lighten(c: Color3, k: number): Color3 {
	return c.Lerp(new Color3(1, 1, 1), k);
}
function darken(c: Color3, k: number): Color3 {
	return c.Lerp(new Color3(0, 0, 0), k);
}

/** The kit library the game uses (falls back to the default when the id is unknown). */
export const kitDef: UiKit = UI_KITS[UI.kit ?? DEFAULT_UI_KIT] ?? UI_KITS[DEFAULT_UI_KIT]!;

function makeTheme(): Theme {
	const t = kitDef.tokens;
	const s = kitDef.shape;
	const pair = (v: [string, string]): [Color3, Color3] => [hex(v[0]), hex(v[1])];
	return {
		kit: kitDef.id,
		kitName: kitDef.name,
		paper: hex(t.paper),
		paperDark: hex(t.paperDark),
		ink: hex(t.ink),
		inkSoft: hex(t.inkSoft),
		text: hex(t.text),
		textDark: hex(t.textDark),
		primary: pair(t.primary),
		gold: pair(t.gold),
		danger: pair(t.danger),
		info: pair(t.info),
		pill: hex(t.pill),
		pillStroke: hex(t.pillStroke),
		tile: hex(t.tile),
		tileStroke: hex(t.tileStroke),
		font: s.font,
		fontBody: s.fontBody,
		radius: s.radius,
		strokeThickness: s.strokeThickness,
		gradients: s.gradients,
		shadowOffset: s.shadow,
		shadowTransparency: s.shadowTransparency,
		bevel: s.bevel,
		textOutline: s.textOutline,
		panelTransparency: s.panelTransparency,
		ornament: s.ornament,
		press: s.press,
		accent: ACCENT,
	};
}

export const theme = makeTheme();

// ---------------------------------------------------------------- primitives

export function corner(parent: GuiObject, radius = theme.radius): UICorner {
	const c = new Instance("UICorner");
	c.CornerRadius = new UDim(0, radius);
	c.Parent = parent;
	return c;
}

export function stroke(parent: GuiObject, color: Color3, thickness = theme.strokeThickness, transparency = 0): UIStroke {
	const s = new Instance("UIStroke");
	s.Color = color;
	s.Thickness = thickness;
	s.Transparency = transparency;
	s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border;
	s.LineJoinMode = Enum.LineJoinMode.Round;
	s.Parent = parent;
	return s;
}

/** Vertical gradient (top → bottom). */
export function gradient(parent: GuiObject, top: Color3, bottom: Color3, rotation = 90): UIGradient {
	const g = new Instance("UIGradient");
	g.Color = new ColorSequence(top, bottom);
	g.Rotation = rotation;
	g.Parent = parent;
	return g;
}

export function padding(parent: GuiObject, all: number, left = all, right = all): UIPadding {
	const p = new Instance("UIPadding");
	p.PaddingTop = new UDim(0, all);
	p.PaddingBottom = new UDim(0, all);
	p.PaddingLeft = new UDim(0, left);
	p.PaddingRight = new UDim(0, right);
	p.Parent = parent;
	return p;
}

/** Drop shadow: a dark rounded frame behind `target` (same size, offset). Returns the shadow. */
export function shadow(target: GuiObject, offset = theme.shadowOffset, transparency = theme.shadowTransparency): Frame {
	const s = new Instance("Frame");
	s.Name = "Shadow";
	s.Size = target.Size;
	s.Position = target.Position.add(new UDim2(0, offset, 0, offset));
	s.AnchorPoint = target.AnchorPoint;
	s.BackgroundColor3 = new Color3(0, 0, 0);
	s.BackgroundTransparency = transparency;
	s.BorderSizePixel = 0;
	s.ZIndex = math.max(1, target.ZIndex - 1);
	corner(s, cornerRadiusOf(target));
	s.Parent = target.Parent;
	return s;
}

/** The shadow frame created last under `parent` (right after a panel() / shadow() call). */
export function lastShadow(parent: Instance): Frame | undefined {
	let last: Frame | undefined;
	for (const c of parent.GetChildren()) if (c.Name === "Shadow" && c.IsA("Frame")) last = c;
	return last;
}

function cornerRadiusOf(g: GuiObject): number {
	const c = g.FindFirstChildOfClass("UICorner");
	return c ? c.CornerRadius.Offset : theme.radius;
}

export interface PanelOptions {
	color?: Color3;
	/** false to skip the library's ornament (small pills, tiles) */
	ornament?: boolean;
	strokeColor?: Color3;
	strokeThickness?: number;
	radius?: number;
	shadow?: boolean;
	transparency?: number;
	zIndex?: number;
}

/**
 * Panel of the kit: its paper colour and transparency, its outline weight, its gradient (when the
 * library uses gradients), its drop shadow (when it has one) and its ornament.
 */
export function panel(size: UDim2, position: UDim2, parent: Instance, opts: PanelOptions = {}): Frame {
	const f = new Instance("Frame");
	f.Size = size;
	f.Position = position;
	const color = opts.color ?? theme.paper;
	f.BackgroundColor3 = color;
	f.BackgroundTransparency = opts.transparency ?? theme.panelTransparency;
	f.BorderSizePixel = 0;
	f.ZIndex = opts.zIndex ?? 2;
	corner(f, opts.radius ?? theme.radius);
	stroke(f, opts.strokeColor ?? theme.ink, opts.strokeThickness ?? theme.strokeThickness);
	if (theme.gradients && opts.color === undefined) gradient(f, lighten(color, 0.06), darken(color, 0.08));
	f.Parent = parent;
	if (opts.shadow !== false && theme.shadowOffset > 0) shadow(f);
	// ornaments only on real panels: they would swallow a 40×26 count badge
	const roomy = (size.X.Offset >= 240 || size.X.Scale >= 0.6) && (size.Y.Offset >= 90 || size.Y.Scale >= 0.4);
	if (opts.ornament ?? roomy) ornament(f);
	return f;
}

/**
 * Draws the library's ornament inside a panel: bolts, CRT scanlines, corner brackets, filigree
 * diamonds, a hazard band, a neon outer glow, grain speckles or a carved notch. Decorative children
 * stay at ZIndex 1–2 so the panel's content (3+) always draws over them.
 */
export function ornament(target: GuiObject, kind: UiOrnament = theme.ornament): void {
	if (kind === "none") return;
	const decor = (child: GuiObject, z = 1) => {
		child.BorderSizePixel = 0;
		child.ZIndex = z;
		child.Parent = target;
	};
	if (kind === "rivets") {
		for (const [ax, ay] of [[0, 0], [1, 0], [0, 1], [1, 1]] as [number, number][]) {
			const bolt = new Instance("Frame");
			bolt.Size = new UDim2(0, 10, 0, 10);
			bolt.Position = new UDim2(ax, ax === 0 ? 9 : -19, ay, ay === 0 ? 9 : -19);
			bolt.BackgroundColor3 = lighten(theme.inkSoft, 0.25);
			corner(bolt, 5);
			stroke(bolt, theme.ink, 1.5);
			decor(bolt, 2);
		}
		return;
	}
	if (kind === "scanlines") {
		const lines = new Instance("Frame");
		lines.Size = new UDim2(1, 0, 1, 0);
		lines.BackgroundTransparency = 1;
		lines.ClipsDescendants = true;
		corner(lines, cornerRadiusOf(target));
		decor(lines, 2);
		// proportional so the lines cover the panel whatever its height
		for (let i = 0; i < 48; i++) {
			const line = new Instance("Frame");
			line.Size = new UDim2(1, 0, 0, 1);
			line.Position = new UDim2(0, 0, i / 48, 0);
			line.BackgroundColor3 = new Color3(1, 1, 1);
			line.BackgroundTransparency = 0.88;
			line.BorderSizePixel = 0;
			line.ZIndex = 2;
			line.Parent = lines;
		}
		return;
	}
	if (kind === "brackets") {
		for (const [ax, ay] of [[0, 0], [1, 0], [0, 1], [1, 1]] as [number, number][]) {
			const h = new Instance("Frame");
			h.Size = new UDim2(0, 22, 0, 3);
			h.Position = new UDim2(ax, ax === 0 ? 6 : -28, ay, ay === 0 ? 6 : -9);
			h.BackgroundColor3 = theme.ink;
			decor(h, 2);
			const v = new Instance("Frame");
			v.Size = new UDim2(0, 3, 0, 22);
			v.Position = new UDim2(ax, ax === 0 ? 6 : -9, ay, ay === 0 ? 6 : -28);
			v.BackgroundColor3 = theme.ink;
			decor(v, 2);
		}
		return;
	}
	if (kind === "filigree") {
		for (const y of [0, 1]) {
			for (let i = 0; i < 3; i++) {
				const gem = new Instance("Frame");
				gem.Size = new UDim2(0, 8, 0, 8);
				gem.Position = new UDim2(0.5, -60 + i * 60 - 4, y, y === 0 ? 5 : -13);
				gem.BackgroundColor3 = theme.gold[0];
				gem.Rotation = 45;
				stroke(gem, theme.ink, 1.5);
				decor(gem, 2);
			}
		}
		return;
	}
	if (kind === "stripes") {
		const band = new Instance("Frame");
		band.Size = new UDim2(1, 0, 0, 10);
		band.Position = new UDim2(0, 0, 0, 0);
		band.BackgroundTransparency = 1;
		band.ClipsDescendants = true;
		decor(band, 2);
		for (let i = 0; i < 24; i++) {
			const bar = new Instance("Frame");
			bar.Size = new UDim2(0, 12, 1, 8);
			bar.Position = new UDim2(0, i * 26 - 6, 0, -4);
			bar.BackgroundColor3 = i % 2 === 0 ? theme.gold[1] : theme.ink;
			bar.Rotation = 24;
			bar.BorderSizePixel = 0;
			bar.ZIndex = 2;
			bar.Parent = band;
		}
		return;
	}
	if (kind === "glow") {
		const glow = new Instance("UIStroke");
		glow.Color = theme.ink;
		glow.Thickness = theme.strokeThickness + 4;
		glow.Transparency = 0.72;
		glow.ApplyStrokeMode = Enum.ApplyStrokeMode.Border;
		glow.LineJoinMode = Enum.LineJoinMode.Round;
		glow.Parent = target;
		return;
	}
	if (kind === "grain") {
		const holder = new Instance("Frame");
		holder.Size = new UDim2(1, 0, 1, 0);
		holder.BackgroundTransparency = 1;
		holder.ClipsDescendants = true;
		corner(holder, cornerRadiusOf(target));
		decor(holder, 2);
		for (let i = 0; i < 26; i++) {
			const speck = new Instance("Frame");
			speck.Size = new UDim2(0, 2, 0, 2);
			speck.Position = new UDim2(math.random(), 0, math.random(), 0);
			speck.BackgroundColor3 = i % 3 === 0 ? theme.ink : new Color3(1, 1, 1);
			speck.BackgroundTransparency = 0.72;
			speck.BorderSizePixel = 0;
			speck.ZIndex = 2;
			speck.Parent = holder;
		}
		return;
	}
	// notch: a carved line under the top edge and a cut corner
	const notch = new Instance("Frame");
	notch.Size = new UDim2(1, -28, 0, 2);
	notch.Position = new UDim2(0, 14, 0, 8);
	notch.BackgroundColor3 = theme.ink;
	notch.BackgroundTransparency = 0.45;
	decor(notch, 2);
	const cut = new Instance("Frame");
	cut.Size = new UDim2(0, 16, 0, 16);
	cut.Position = new UDim2(1, -12, 0, -4);
	cut.BackgroundColor3 = theme.ink;
	cut.Rotation = 45;
	decor(cut, 2);
}

export interface TextOptions {
	size?: number;
	color?: Color3;
	font?: Enum.Font;
	/** outline thickness (0 = none) */
	outline?: number;
	outlineColor?: Color3;
	align?: Enum.TextXAlignment;
	valign?: Enum.TextYAlignment;
	wrap?: boolean;
	rich?: boolean;
	scaled?: boolean;
	zIndex?: number;
}

/** Rounded bold text with an ink outline (the "sticker" look). */
export function text(str: string, size: UDim2, position: UDim2, parent: Instance, opts: TextOptions = {}): TextLabel {
	const l = new Instance("TextLabel");
	l.BackgroundTransparency = 1;
	l.Size = size;
	l.Position = position;
	l.Text = str;
	l.TextSize = opts.size ?? 18;
	l.TextColor3 = opts.color ?? theme.text;
	l.Font = opts.font ?? theme.font;
	l.TextXAlignment = opts.align ?? Enum.TextXAlignment.Left;
	l.TextYAlignment = opts.valign ?? Enum.TextYAlignment.Center;
	l.TextWrapped = opts.wrap ?? true;
	l.RichText = opts.rich ?? false;
	l.TextScaled = opts.scaled ?? false;
	l.ZIndex = opts.zIndex ?? 3;
	const o = opts.outline ?? (opts.color === undefined || opts.color === theme.text ? theme.textOutline : 0);
	if (o > 0) {
		const s = new Instance("UIStroke");
		s.Color = opts.outlineColor ?? theme.ink;
		s.Thickness = o;
		s.ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual;
		s.LineJoinMode = Enum.LineJoinMode.Round;
		s.Parent = l;
	}
	l.Parent = parent;
	return l;
}

/** Body copy (no outline, ink colour). */
export function body(str: string, size: UDim2, position: UDim2, parent: Instance, opts: TextOptions = {}): TextLabel {
	return text(str, size, position, parent, { font: theme.fontBody, color: theme.textDark, outline: 0, size: 14, ...opts });
}

export interface ButtonOptions {
	colors?: [Color3, Color3];
	size?: number;
	radius?: number;
	zIndex?: number;
	icon?: (parent: GuiObject) => GuiObject;
	textColor?: Color3;
}

/** Button of the kit: gradient or flat fill, optional bevel band and highlight, outlined label, press feedback. */
export function button(str: string, size: UDim2, position: UDim2, parent: Instance, opts: ButtonOptions = {}): TextButton {
	const [top, bottom] = opts.colors ?? theme.primary;
	const b = new Instance("TextButton");
	b.Size = size;
	b.Position = position;
	b.BackgroundColor3 = theme.gradients ? new Color3(1, 1, 1) : bottom;
	b.BorderSizePixel = 0;
	b.Text = "";
	b.AutoButtonColor = false;
	b.ZIndex = opts.zIndex ?? 3;
	const radius = opts.radius ?? math.max(2, theme.radius - 2);
	corner(b, radius);
	if (theme.gradients) gradient(b, top, bottom);
	stroke(b, theme.ink, theme.strokeThickness);
	if (theme.bevel) {
		// bevel: darker band at the bottom
		const bevel = new Instance("Frame");
		bevel.Size = new UDim2(1, 0, 0, 6);
		bevel.Position = new UDim2(0, 0, 1, -6);
		bevel.BackgroundColor3 = darken(bottom, 0.25);
		bevel.BorderSizePixel = 0;
		bevel.ZIndex = b.ZIndex;
		corner(bevel, radius);
		bevel.Parent = b;
		// highlight line at the top
		const hi = new Instance("Frame");
		hi.Size = new UDim2(1, -16, 0, 3);
		hi.Position = new UDim2(0, 8, 0, 4);
		hi.BackgroundColor3 = new Color3(1, 1, 1);
		hi.BackgroundTransparency = 0.55;
		hi.BorderSizePixel = 0;
		hi.ZIndex = b.ZIndex + 1;
		corner(hi, 2);
		hi.Parent = b;
	}
	const label = text(str, new UDim2(1, -12, 1, -6), new UDim2(0, 6, 0, -1), b, { size: opts.size ?? 20, align: Enum.TextXAlignment.Center, color: opts.textColor ?? theme.text, zIndex: b.ZIndex + 2 });
	label.Name = "Label";
	if (opts.icon) {
		const ic = opts.icon(b);
		ic.ZIndex = b.ZIndex + 2;
		ic.Position = new UDim2(0, 12, 0.5, -math.floor(ic.AbsoluteSize.Y / 2) - 2);
		ic.AnchorPoint = new Vector2(0, 0);
		task.defer(() => (ic.Position = new UDim2(0, 12, 0.5, -math.floor(ic.AbsoluteSize.Y / 2) - 2)));
		label.Position = new UDim2(0, 30, 0, -1);
		label.Size = new UDim2(1, -36, 1, -6);
	}
	if (theme.shadowOffset > 0) shadow(b, math.max(3, theme.shadowOffset - 1), math.min(0.85, theme.shadowTransparency + 0.1));
	pressAnimation(b);
	return b;
}

/**
 * Button feedback of the library: `squash` (bouncy mobile-game), `pulse` (bigger overshoot, candy /
 * kawaii), `slide` (flat kits: a short lift and a brightness dip), `flicker` (neon blink) or `none`
 * (a single brightness step — horror, military, pixel consoles).
 */
export function pressAnimation(b: GuiButton, press: UiPress = theme.press): void {
	if (press === "none") {
		const dim = (v: number) => TweenService.Create(b, new TweenInfo(0.08), { BackgroundTransparency: v }).Play();
		b.MouseButton1Down.Connect(() => dim(0.25));
		b.MouseButton1Up.Connect(() => dim(0));
		b.MouseLeave.Connect(() => dim(0));
		return;
	}
	if (press === "flicker") {
		const blink = () => {
			task.spawn(() => {
				for (const t of [0.55, 0, 0.35, 0]) {
					b.BackgroundTransparency = t;
					task.wait(0.04);
				}
			});
		};
		b.MouseButton1Down.Connect(blink);
		b.MouseEnter.Connect(blink);
		return;
	}
	if (press === "slide") {
		const base = b.Position;
		const to = (offset: number) => TweenService.Create(b, new TweenInfo(0.1, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Position: base.add(new UDim2(0, 0, 0, offset)) }).Play();
		b.MouseButton1Down.Connect(() => to(2));
		b.MouseButton1Up.Connect(() => to(0));
		b.MouseEnter.Connect(() => to(-2));
		b.MouseLeave.Connect(() => to(0));
		return;
	}
	const scale = new Instance("UIScale");
	scale.Parent = b;
	const big = press === "pulse" ? 1.09 : 1.04;
	const to = (v: number, t = 0.08) => TweenService.Create(scale, new TweenInfo(t, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale: v }).Play();
	b.MouseButton1Down.Connect(() => to(press === "pulse" ? 0.88 : 0.93));
	b.MouseButton1Up.Connect(() => to(big, 0.12));
	b.MouseEnter.Connect(() => to(big));
	b.MouseLeave.Connect(() => to(1));
}

/** Dark pill with an icon and a value (prices, currency counters). */
export function pill(value: string, size: UDim2, position: UDim2, parent: Instance, icon: "coin" | "robux" | "none" = "coin", opts: { color?: Color3; strokeColor?: Color3; textSize?: number; zIndex?: number } = {}): { frame: Frame; label: TextLabel } {
	const f = new Instance("Frame");
	f.Size = size;
	f.Position = position;
	f.BackgroundColor3 = opts.color ?? theme.pill;
	f.BorderSizePixel = 0;
	f.ZIndex = opts.zIndex ?? 4;
	corner(f, math.max(2, math.min(12, theme.radius)));
	stroke(f, opts.strokeColor ?? theme.pillStroke, math.max(1.5, theme.strokeThickness - 0.5));
	f.Parent = parent;
	let left = 10;
	if (icon !== "none") {
		const ic = icon === "coin" ? coinIcon(22, f) : robuxIcon(20, f);
		ic.Position = new UDim2(0, 8, 0.5, -ic.Size.Y.Offset / 2);
		ic.ZIndex = f.ZIndex + 1;
		left = 8 + ic.Size.X.Offset + 6;
	}
	const label = text(value, new UDim2(1, -left - 8, 1, 0), new UDim2(0, left, 0, 0), f, { size: opts.textSize ?? 18, align: Enum.TextXAlignment.Left, zIndex: f.ZIndex + 1, outline: 1.5 });
	label.Name = "Value";
	return { frame: f, label };
}

/** Rotated promo sticker ("-97%", "NEW", "x2"). */
export function badge(str: string, position: UDim2, parent: Instance, color: Color3 = theme.accent, rotation = -10, size = 22): TextLabel {
	const l = text(str, new UDim2(0, str.size() * size * 0.65 + 16, 0, size + 8), position, parent, { size, align: Enum.TextXAlignment.Center, color, outline: 3, zIndex: 8 });
	l.Rotation = rotation;
	return l;
}

/** Struck-through old price (red line). */
export function strike(str: string, position: UDim2, parent: Instance, size = 18): TextLabel {
	const l = text(str, new UDim2(0, str.size() * size * 0.62 + 8, 0, size + 6), position, parent, { size, align: Enum.TextXAlignment.Center, color: hex("#e9e2cf"), outline: 2, zIndex: 6 });
	const line = new Instance("Frame");
	line.Size = new UDim2(1, 4, 0, 3);
	line.Position = new UDim2(0, -2, 0.5, -1);
	line.BackgroundColor3 = hex("#e5352b");
	line.BorderSizePixel = 0;
	line.Rotation = -8;
	line.ZIndex = 7;
	line.Parent = l;
	return l;
}

// ---------------------------------------------------------------- drawn icons (no assets)

function disc(parent: Instance, size: number, color: Color3, position: UDim2, strokeColor?: Color3, z = 5): Frame {
	const d = new Instance("Frame");
	d.Size = new UDim2(0, size, 0, size);
	d.Position = position;
	d.BackgroundColor3 = color;
	d.BorderSizePixel = 0;
	d.ZIndex = z;
	corner(d, size);
	if (strokeColor) stroke(d, strokeColor, 2);
	d.Parent = parent;
	return d;
}

export function coinIcon(size: number, parent: Instance): Frame {
	const c = disc(parent, size, hex("#ffcf3f"), new UDim2(0, 0, 0, 0), hex("#a86a12"));
	gradient(c, hex("#ffe27a"), hex("#f0a020"));
	const inner = disc(c, math.floor(size * 0.62), hex("#f5b52a"), new UDim2(0.5, -math.floor(size * 0.31), 0.5, -math.floor(size * 0.31)), hex("#a86a12"), 6);
	inner.BackgroundTransparency = 0.15;
	return c;
}

export function robuxIcon(size: number, parent: Instance): ImageLabel {
	const i = new Instance("ImageLabel");
	i.Size = new UDim2(0, size, 0, size);
	i.BackgroundTransparency = 1;
	i.Image = "rbxasset://textures/ui/common/robux.png";
	i.ImageColor3 = new Color3(1, 1, 1);
	i.Parent = parent;
	return i;
}

/** Four-leaf clover (luck). */
export function cloverIcon(size: number, parent: Instance): Frame {
	const f = new Instance("Frame");
	f.Size = new UDim2(0, size, 0, size);
	f.BackgroundTransparency = 1;
	f.Parent = parent;
	const leaf = math.floor(size * 0.46);
	const c = hex("#4fd44a");
	const s = hex("#1f7a1e");
	for (const [x, y] of [[0.5, 0.05], [0.05, 0.5], [0.5, 0.5], [0.95, 0.5]] as [number, number][]) {
		const d = disc(f, leaf, c, new UDim2(x, -leaf / 2, y, -leaf / 2 + (y === 0.5 && x === 0.5 ? leaf * 0.45 : 0)), s);
		gradient(d, hex("#8ff05a"), hex("#3aa833"));
	}
	const stem = new Instance("Frame");
	stem.Size = new UDim2(0, math.max(3, size * 0.09), 0, size * 0.32);
	stem.Position = new UDim2(0.55, 0, 0.68, 0);
	stem.Rotation = -25;
	stem.BackgroundColor3 = s;
	stem.BorderSizePixel = 0;
	stem.ZIndex = 4;
	corner(stem, 3);
	stem.Parent = f;
	return f;
}

/** Potion bottle (buffs). */
export function potionIcon(size: number, parent: Instance, liquid: Color3 = hex("#7ee23f")): Frame {
	const f = new Instance("Frame");
	f.Size = new UDim2(0, size, 0, size);
	f.BackgroundTransparency = 1;
	f.Parent = parent;
	const body = disc(f, math.floor(size * 0.7), hex("#d8f3ff"), new UDim2(0.5, -size * 0.35, 1, -size * 0.72), theme.ink);
	body.BackgroundTransparency = 0.15;
	const fill = disc(body, math.floor(size * 0.6), liquid, new UDim2(0.5, -size * 0.3, 0.5, -size * 0.3 + size * 0.05), undefined, 6);
	gradient(fill, lighten(liquid, 0.3), darken(liquid, 0.2));
	const neck = new Instance("Frame");
	neck.Size = new UDim2(0, size * 0.26, 0, size * 0.3);
	neck.Position = new UDim2(0.5, -size * 0.13, 0, size * 0.04);
	neck.BackgroundColor3 = hex("#d8f3ff");
	neck.BorderSizePixel = 0;
	neck.ZIndex = 5;
	corner(neck, 4);
	stroke(neck, theme.ink, 2);
	neck.Parent = f;
	const cork = new Instance("Frame");
	cork.Size = new UDim2(0, size * 0.32, 0, size * 0.12);
	cork.Position = new UDim2(0.5, -size * 0.16, 0, 0);
	cork.BackgroundColor3 = hex("#b07a3a");
	cork.BorderSizePixel = 0;
	cork.ZIndex = 6;
	corner(cork, 3);
	stroke(cork, theme.ink, 2);
	cork.Parent = f;
	return f;
}

/** Rounded die with pips (upgrades / chance). */
export function diceIcon(size: number, parent: Instance, color: Color3 = hex("#ffd24a")): Frame {
	const f = new Instance("Frame");
	f.Size = new UDim2(0, size, 0, size);
	f.BackgroundColor3 = color;
	f.BorderSizePixel = 0;
	f.ZIndex = 5;
	corner(f, math.floor(size * 0.22));
	stroke(f, theme.ink, 2.5);
	gradient(f, lighten(color, 0.25), darken(color, 0.15));
	f.Parent = parent;
	const pip = math.max(3, math.floor(size * 0.16));
	for (const [x, y] of [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]] as [number, number][]) disc(f, pip, theme.ink, new UDim2(x, -pip / 2, y, -pip / 2), undefined, 6);
	return f;
}

/** Drumstick (food). */
export function foodIcon(size: number, parent: Instance): Frame {
	const f = new Instance("Frame");
	f.Size = new UDim2(0, size, 0, size);
	f.BackgroundTransparency = 1;
	f.Parent = parent;
	const meat = disc(f, math.floor(size * 0.58), hex("#f08a2a"), new UDim2(0, size * 0.02, 0, size * 0.12), theme.ink);
	gradient(meat, hex("#ffb35a"), hex("#d9651a"));
	const bone = new Instance("Frame");
	bone.Size = new UDim2(0, size * 0.42, 0, size * 0.16);
	bone.Position = new UDim2(0, size * 0.5, 0, size * 0.62);
	bone.Rotation = -40;
	bone.BackgroundColor3 = hex("#fff4e0");
	bone.BorderSizePixel = 0;
	bone.ZIndex = 4;
	corner(bone, 6);
	stroke(bone, theme.ink, 2);
	bone.Parent = f;
	return f;
}

/** Bolt / speed. */
export function boltIcon(size: number, parent: Instance): TextLabel {
	return text("⚡", new UDim2(0, size, 0, size), new UDim2(0, 0, 0, 0), parent, { size: math.floor(size * 0.8), align: Enum.TextXAlignment.Center, color: hex("#ffe14a"), outline: 2, zIndex: 5 });
}

/** Crown (VIP / passes). */
export function crownIcon(size: number, parent: Instance): Frame {
	const f = new Instance("Frame");
	f.Size = new UDim2(0, size, 0, size);
	f.BackgroundTransparency = 1;
	f.Parent = parent;
	const base = new Instance("Frame");
	base.Size = new UDim2(0, size * 0.8, 0, size * 0.42);
	base.Position = new UDim2(0.1, 0, 0.5, 0);
	base.BackgroundColor3 = hex("#ffd24a");
	base.BorderSizePixel = 0;
	base.ZIndex = 5;
	corner(base, 4);
	stroke(base, theme.ink, 2.5);
	gradient(base, hex("#ffe27a"), hex("#e0a020"));
	base.Parent = f;
	for (const x of [0.16, 0.5, 0.84]) {
		const spike = new Instance("Frame");
		spike.Size = new UDim2(0, size * 0.2, 0, size * 0.34);
		spike.Position = new UDim2(x, -size * 0.1, 0, size * 0.2);
		spike.BackgroundColor3 = hex("#ffd24a");
		spike.BorderSizePixel = 0;
		spike.ZIndex = 5;
		corner(spike, 3);
		stroke(spike, theme.ink, 2.5);
		spike.Parent = f;
		disc(f, math.floor(size * 0.14), hex("#ff4f7a"), new UDim2(x, -size * 0.07, 0, size * 0.1), theme.ink, 6);
	}
	return f;
}

/** Icon for a shop item by its effect (or a decal when the catalog has one). */
export function itemIcon(item: { iconAssetId?: number; effect?: { type: string; stat?: string }; kind?: string; color?: string }, size: number, parent: Instance): GuiObject {
	if (item.iconAssetId !== undefined && item.iconAssetId > 0) {
		const i = new Instance("ImageLabel");
		i.Size = new UDim2(0, size, 0, size);
		i.BackgroundTransparency = 1;
		i.Image = `rbxassetid://${item.iconAssetId}`;
		i.ZIndex = 5;
		i.Parent = parent;
		return i;
	}
	if (item.kind === "gamepass") return crownIcon(size, parent);
	if (item.kind === "product" || item.effect?.type === "grant_coins") return coinIcon(size, parent);
	const stat = item.effect?.stat ?? "";
	if (stat === "luck") return item.effect?.type === "multiplier" ? diceIcon(size, parent) : cloverIcon(size, parent);
	if (stat === "food") return foodIcon(size, parent);
	if (stat === "speed") return boltIcon(size, parent);
	if (stat === "coins") return item.effect?.type === "multiplier" ? diceIcon(size, parent, hex("#ffd24a")) : coinIcon(size, parent);
	if (item.effect?.type === "buff") return potionIcon(size, parent, item.color !== undefined ? Color3.fromHex(item.color) : undefined);
	return diceIcon(size, parent, item.color !== undefined ? Color3.fromHex(item.color) : hex("#cfd6e6"));
}

// ---------------------------------------------------------------- tooltip

let tip: Frame | undefined;
let tipTitle: TextLabel | undefined;
let tipBody: TextLabel | undefined;

/** Dark tooltip following the cursor while hovering `target`. */
export function tooltip(target: GuiObject, title: string, description: string, root: ScreenGui): void {
	const ensure = () => {
		if (tip && tip.Parent) return;
		tip = new Instance("Frame");
		tip.Size = new UDim2(0, 240, 0, 84);
		tip.BackgroundColor3 = hex("#2a2320");
		tip.BackgroundTransparency = 0.05;
		tip.BorderSizePixel = 0;
		tip.ZIndex = 50;
		tip.Visible = false;
		corner(tip, 12);
		stroke(tip, hex("#5a4a40"), 3);
		tip.Parent = root;
		tipTitle = text("", new UDim2(1, -16, 0, 26), new UDim2(0, 8, 0, 6), tip, { size: 20, align: Enum.TextXAlignment.Center, color: hex("#ffd24a"), outline: 2, zIndex: 51 });
		tipBody = text("", new UDim2(1, -16, 0, 44), new UDim2(0, 8, 0, 34), tip, { size: 14, align: Enum.TextXAlignment.Center, valign: Enum.TextYAlignment.Top, color: hex("#f2eadb"), outline: 0, font: theme.fontBody, zIndex: 51 });
	};
	target.MouseEnter.Connect(() => {
		ensure();
		tipTitle!.Text = title;
		tipBody!.Text = description;
		tip!.Visible = true;
	});
	target.MouseMoved.Connect((x, y) => {
		if (tip) tip.Position = new UDim2(0, x + 14, 0, y + 14);
	});
	target.MouseLeave.Connect(() => {
		if (tip) tip.Visible = false;
	});
}

// ---------------------------------------------------------------- window shell (screens)

export interface WindowOptions {
	width?: number;
	height?: number;
	/** ScreenGui.DisplayOrder — screens above the HUD, tooltips above the screens. */
	displayOrder?: number;
	/** Right-hand pill in the header (coins counter). */
	coinPill?: boolean;
	/** Vertical list in the body (default) or a free-form body the caller lays out. */
	list?: boolean;
}

/**
 * Modal window: dim backdrop, paper panel scaled to fit small screens, outlined title, red X and a
 * scrolling body with a list layout. Every screen of the template is built on it, so they all open,
 * close and scale the same way.
 */
export class Window {
	public readonly gui: ScreenGui;
	public readonly window: Frame;
	/** Scrolling body (list layout when `opts.list !== false`). */
	public readonly body: ScrollingFrame;
	public readonly coins: TextLabel | undefined;
	public open = false;
	/** Called every time the window is opened (refresh the contents here). */
	public onOpen: (() => void) | undefined;
	private scale: UIScale;
	private width: number;
	private height: number;

	constructor(name: string, title: string, opts: WindowOptions = {}) {
		const w = opts.width ?? 620;
		const h = opts.height ?? 620;
		this.width = w;
		this.height = h;
		const pg = Players.LocalPlayer.WaitForChild("PlayerGui") as PlayerGui;
		this.gui = new Instance("ScreenGui");
		this.gui.Name = `WorldForge${name}`;
		this.gui.ResetOnSpawn = false;
		this.gui.IgnoreGuiInset = true;
		this.gui.DisplayOrder = opts.displayOrder ?? 5;
		this.gui.Enabled = false;
		this.gui.Parent = pg;

		const dim = new Instance("TextButton");
		dim.Text = "";
		dim.AutoButtonColor = false;
		dim.Size = new UDim2(1, 0, 1, 0);
		dim.BackgroundColor3 = new Color3(0, 0, 0);
		dim.BackgroundTransparency = 0.45;
		dim.BorderSizePixel = 0;
		dim.ZIndex = 1;
		dim.Parent = this.gui;
		dim.MouseButton1Click.Connect(() => this.setOpen(false));

		this.window = panel(new UDim2(0, w, 0, h), new UDim2(0.5, -w / 2, 0.5, -h / 2), this.gui, { radius: 20, strokeThickness: 4, zIndex: 2 });
		this.window.Name = "Window";
		this.scale = new Instance("UIScale");
		this.scale.Parent = this.window;
		const fit = () => {
			const vp = this.gui.AbsoluteSize;
			this.scale.Scale = math.clamp(math.min(vp.X / (w + 40), vp.Y / (h + 40)), 0.55, 1);
		};
		this.gui.GetPropertyChangedSignal("AbsoluteSize").Connect(fit);
		task.defer(fit);

		text(title, new UDim2(0, w - 260, 0, 56), new UDim2(0, 24, 0, 10), this.window, { size: 38 });
		if (opts.coinPill !== false) {
			const cp = pill("0", new UDim2(0, 150, 0, 40), new UDim2(1, -232, 0, 18), this.window, "coin", { textSize: 20 });
			this.coins = cp.label;
		}
		const close = button("X", new UDim2(0, 52, 0, 52), new UDim2(1, -68, 0, 12), this.window, { colors: theme.danger, size: 26, radius: 12, zIndex: 4 });
		close.MouseButton1Click.Connect(() => this.setOpen(false));

		this.body = new Instance("ScrollingFrame");
		this.body.Size = new UDim2(1, -36, 1, -92);
		this.body.Position = new UDim2(0, 18, 0, 76);
		this.body.BackgroundTransparency = 1;
		this.body.BorderSizePixel = 0;
		this.body.ScrollBarThickness = 8;
		this.body.ScrollBarImageColor3 = theme.ink;
		this.body.CanvasSize = new UDim2(0, 0, 0, 0);
		this.body.AutomaticCanvasSize = opts.list === false ? Enum.AutomaticSize.None : Enum.AutomaticSize.Y;
		this.body.ZIndex = 3;
		this.body.Parent = this.window;
		if (opts.list !== false) {
			const layout = new Instance("UIListLayout");
			layout.Padding = new UDim(0, 12);
			layout.SortOrder = Enum.SortOrder.LayoutOrder;
			layout.Parent = this.body;
			padding(this.body, 4, 4, 12);
		}
	}

	setCoins(value: number): void {
		if (this.coins) this.coins.Text = `${math.floor(value)}`;
	}

	setOpen(value: boolean): void {
		if (value === this.open) return;
		this.open = value;
		if (value) {
			this.gui.Enabled = true;
			this.onOpen?.();
			this.window.Position = new UDim2(0.5, -this.width / 2, 0.5, -this.height / 2 + 24);
			TweenService.Create(this.window, new TweenInfo(0.22, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Position: new UDim2(0.5, -this.width / 2, 0.5, -this.height / 2) }).Play();
		} else {
			this.gui.Enabled = false;
		}
	}

	toggle(): void {
		this.setOpen(!this.open);
	}

	/** Removes every row of the body (keeps the layout / padding). */
	clearBody(): void {
		for (const child of this.body.GetChildren()) if (child.IsA("GuiObject")) child.Destroy();
	}
}

/** Section title inside a window body (list layout). */
export function sectionHeader(str: string, parent: Instance, order: number): TextLabel {
	const holder = new Instance("Frame");
	holder.Size = new UDim2(1, 0, 0, 34);
	holder.BackgroundTransparency = 1;
	holder.LayoutOrder = order;
	holder.ZIndex = 3;
	holder.Parent = parent;
	const line = new Instance("Frame");
	line.Size = new UDim2(1, 0, 0, 3);
	line.Position = new UDim2(0, 0, 1, -4);
	line.BackgroundColor3 = theme.inkSoft;
	line.BackgroundTransparency = 0.4;
	line.BorderSizePixel = 0;
	line.ZIndex = 3;
	line.Parent = holder;
	return text(str.upper(), new UDim2(1, -8, 0, 28), new UDim2(0, 4, 0, 0), holder, { size: 24, color: theme.textDark, outline: 0, zIndex: 4 });
}

/** Rounded gradient row for a list body; returns the card (the holder carries the layout order). */
export function card(height: number, order: number, parent: Instance, colors: [Color3, Color3] = [theme.paperDark, darken(theme.paperDark, 0.12)], radius = 16): Frame {
	const holder = new Instance("Frame");
	holder.Size = new UDim2(1, 0, 0, height + 6);
	holder.BackgroundTransparency = 1;
	holder.LayoutOrder = order;
	holder.ZIndex = 3;
	holder.Parent = parent;
	const f = new Instance("Frame");
	f.Size = new UDim2(1, 0, 0, height);
	f.BackgroundColor3 = colors[1];
	f.BorderSizePixel = 0;
	f.ZIndex = 4;
	corner(f, radius);
	gradient(f, colors[0], colors[1]);
	stroke(f, theme.ink, 3);
	f.Parent = holder;
	return f;
}

export interface BarHandle {
	/** sets the filled fraction (0…1) */
	set: (fraction: number) => void;
	fill: Frame;
	label: TextLabel;
}

/** Outlined progress bar with a centred label ("3 / 5"). */
export function progressBar(size: UDim2, position: UDim2, parent: Instance, colors: [Color3, Color3] = theme.primary, zIndex = 5): BarHandle {
	const bg = new Instance("Frame");
	bg.Size = size;
	bg.Position = position;
	bg.BackgroundColor3 = darken(theme.ink, 0.15);
	bg.BorderSizePixel = 0;
	bg.ZIndex = zIndex;
	corner(bg, 9);
	stroke(bg, theme.ink, 2.5);
	bg.Parent = parent;
	const fill = new Instance("Frame");
	fill.Size = new UDim2(0, 0, 1, 0);
	fill.BackgroundColor3 = colors[1];
	fill.BorderSizePixel = 0;
	fill.ZIndex = zIndex + 1;
	corner(fill, 9);
	gradient(fill, colors[0], colors[1]);
	fill.Parent = bg;
	const label = text("", new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), bg, { size: 14, align: Enum.TextXAlignment.Center, zIndex: zIndex + 2, outline: 2 });
	return {
		fill,
		label,
		set: (fraction: number) => {
			TweenService.Create(fill, new TweenInfo(0.2), { Size: new UDim2(math.clamp(fraction, 0, 1), 0, 1, 0) }).Play();
		},
	};
}

/** Pill switch (settings): dark track, sliding knob, ON / OFF label. */
export function toggle(value: boolean, size: UDim2, position: UDim2, parent: Instance, onChange: (v: boolean) => void): TextButton {
	const b = new Instance("TextButton");
	b.Size = size;
	b.Position = position;
	b.Text = "";
	b.AutoButtonColor = false;
	b.BackgroundColor3 = theme.pill;
	b.BorderSizePixel = 0;
	b.ZIndex = 5;
	corner(b, 14);
	stroke(b, theme.ink, 2.5);
	b.Parent = parent;
	const knob = new Instance("Frame");
	knob.Size = new UDim2(0, size.Y.Offset - 8, 0, size.Y.Offset - 8);
	knob.BackgroundColor3 = theme.paper;
	knob.BorderSizePixel = 0;
	knob.ZIndex = 7;
	corner(knob, 12);
	stroke(knob, theme.ink, 2);
	knob.Parent = b;
	const label = text("", new UDim2(1, -12, 1, 0), new UDim2(0, 6, 0, 0), b, { size: 13, align: Enum.TextXAlignment.Center, zIndex: 6, outline: 1.5 });
	let on = value;
	const render = () => {
		const pad = 4;
		const x = on ? size.X.Offset - knob.Size.X.Offset - pad : pad;
		TweenService.Create(knob, new TweenInfo(0.14, Enum.EasingStyle.Quad), { Position: new UDim2(0, x, 0, pad) }).Play();
		b.BackgroundColor3 = on ? theme.primary[1] : theme.pill;
		label.Text = on ? "ON" : "OFF";
		label.TextXAlignment = on ? Enum.TextXAlignment.Left : Enum.TextXAlignment.Right;
	};
	render();
	b.MouseButton1Click.Connect(() => {
		on = !on;
		render();
		onChange(on);
	});
	return b;
}

/** Draggable slider (0…1): outlined track, gradient fill, round knob, percentage label. */
export function slider(value: number, size: UDim2, position: UDim2, parent: Instance, onChange: (v: number) => void): Frame {
	const track = new Instance("Frame");
	track.Size = size;
	track.Position = position;
	track.BackgroundColor3 = darken(theme.ink, 0.15);
	track.BorderSizePixel = 0;
	track.ZIndex = 5;
	corner(track, 10);
	stroke(track, theme.ink, 2.5);
	track.Parent = parent;
	const fill = new Instance("Frame");
	fill.Size = new UDim2(math.clamp(value, 0, 1), 0, 1, 0);
	fill.BackgroundColor3 = theme.primary[1];
	fill.BorderSizePixel = 0;
	fill.ZIndex = 6;
	corner(fill, 10);
	gradient(fill, theme.primary[0], theme.primary[1]);
	fill.Parent = track;
	const knob = new Instance("Frame");
	knob.Size = new UDim2(0, size.Y.Offset + 6, 0, size.Y.Offset + 6);
	knob.Position = new UDim2(math.clamp(value, 0, 1), -(size.Y.Offset + 6) / 2, 0.5, -(size.Y.Offset + 6) / 2);
	knob.BackgroundColor3 = theme.paper;
	knob.BorderSizePixel = 0;
	knob.ZIndex = 8;
	corner(knob, 14);
	stroke(knob, theme.ink, 2.5);
	knob.Parent = track;
	const label = text(`${math.floor(math.clamp(value, 0, 1) * 100)}%`, new UDim2(0, 60, 1, 0), new UDim2(1, 10, 0, 0), track, { size: 15, align: Enum.TextXAlignment.Left, zIndex: 7, outline: 2 });
	// invisible button over the track captures the drag (works with touch and mouse)
	const grab = new Instance("TextButton");
	grab.Text = "";
	grab.AutoButtonColor = false;
	grab.BackgroundTransparency = 1;
	grab.Size = new UDim2(1, 24, 1, 24);
	grab.Position = new UDim2(0, -12, 0, -12);
	grab.ZIndex = 9;
	grab.Parent = track;
	let dragging = false;
	const apply = (x: number) => {
		const left = track.AbsolutePosition.X;
		const w = math.max(1, track.AbsoluteSize.X);
		const v = math.clamp((x - left) / w, 0, 1);
		fill.Size = new UDim2(v, 0, 1, 0);
		knob.Position = new UDim2(v, -knob.Size.X.Offset / 2, 0.5, -knob.Size.Y.Offset / 2);
		label.Text = `${math.floor(v * 100)}%`;
		onChange(v);
	};
	grab.InputBegan.Connect((input) => {
		if (input.UserInputType === Enum.UserInputType.MouseButton1 || input.UserInputType === Enum.UserInputType.Touch) {
			dragging = true;
			apply(input.Position.X);
		}
	});
	grab.InputChanged.Connect((input) => {
		if (dragging && (input.UserInputType === Enum.UserInputType.MouseMovement || input.UserInputType === Enum.UserInputType.Touch)) apply(input.Position.X);
	});
	grab.InputEnded.Connect((input) => {
		if (input.UserInputType === Enum.UserInputType.MouseButton1 || input.UserInputType === Enum.UserInputType.Touch) dragging = false;
	});
	return track;
}

/**
 * Icon for an inventory / recipe item id: the drawn kit icons for the ones we recognise (food, ore,
 * wood, cloth, potion…), otherwise a coloured tile with the initials — no asset ids either way.
 */
export function resourceIcon(id: string, size: number, parent: Instance): GuiObject {
	const key = id.lower();
	const has = (s: string) => key.find(s, 1, true)[0] !== undefined;
	if (has("coin") || has("cash") || has("gold")) return coinIcon(size, parent);
	if (has("potion") || has("elixir") || has("flask")) return potionIcon(size, parent);
	if (has("clover") || has("luck")) return cloverIcon(size, parent);
	if (has("food") || has("carrot") || has("crop") || has("fish") || has("meat") || has("bread") || has("apple")) return foodIcon(size, parent);
	if (has("speed") || has("bolt") || has("energy")) return boltIcon(size, parent);
	if (has("vip") || has("crown") || has("trophy")) return crownIcon(size, parent);
	const palette: Record<string, string> = { wood: "#a5742f", plank: "#c08a3e", log: "#8a5a22", stone: "#9aa0a6", rock: "#8a9096", ore: "#c0c6cc", iron: "#b8bec4", copper: "#c87a3a", cloth: "#e0d6bc", scrap: "#8a8f95", gem: "#6fd0ff", crystal: "#9ad8ff", torch: "#ffb347", bandage: "#f2eadb", key: "#ffd24a", seed: "#7fd07a", egg: "#f6efdc", pet: "#ffb3d1" };
	let color = hex("#cfd6e6");
	for (const [k, v] of pairs(palette)) if (has(k as string)) color = hex(v as string);
	const f = new Instance("Frame");
	f.Size = new UDim2(0, size, 0, size);
	f.BackgroundColor3 = color;
	f.BorderSizePixel = 0;
	f.ZIndex = 5;
	corner(f, math.floor(size * 0.25));
	stroke(f, theme.ink, 2.5);
	gradient(f, lighten(color, 0.25), darken(color, 0.2));
	f.Parent = parent;
	text(id.sub(1, 2).upper(), new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), f, { size: math.floor(size * 0.46), align: Enum.TextXAlignment.Center, zIndex: 6, outline: 2 });
	return f;
}

/** Title-cased label from an item id ("wild_carrot" → "Wild Carrot"). */
export function prettyName(id: string): string {
	const parts = id.split("_");
	const out: string[] = [];
	for (const p of parts) if (p !== "") out.push(p.sub(1, 1).upper() + p.sub(2));
	return out.join(" ");
}
