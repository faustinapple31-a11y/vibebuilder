import { TweenService } from "@rbxts/services";
import { GameConfig } from "shared/config";

/**
 * UI kit — the look of mobile-game shops and HUDs: cream paper panels with a thick dark ink outline and a
 * drop shadow, rounded bold type with an outline, vertical gradients on banners and buttons with a darker
 * bevel, pill prices with a coin / Robux icon, rotated promo badges, tooltips. Everything is Instances
 * (no asset ids needed: icons are drawn with frames), themed from GameConfig.ui.
 */
export interface Theme {
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
}

const hex = (h: string) => Color3.fromHex(h);
const UI_STYLE = (GameConfig as { ui?: { style?: string; accentColor?: string } }).ui?.style ?? "stylized";
const ACCENT = hex((GameConfig as { ui?: { accentColor?: string } }).ui?.accentColor ?? "#7ed957");

function lighten(c: Color3, k: number): Color3 {
	return c.Lerp(new Color3(1, 1, 1), k);
}
function darken(c: Color3, k: number): Color3 {
	return c.Lerp(new Color3(0, 0, 0), k);
}

function makeTheme(): Theme {
	const base: Theme = {
		paper: hex("#f6efdc"),
		paperDark: hex("#e6d8b6"),
		ink: hex("#3b2a1a"),
		inkSoft: hex("#6a5140"),
		text: hex("#ffffff"),
		textDark: hex("#3b2a1a"),
		primary: [hex("#8ff05a"), hex("#2f9a2c")],
		gold: [hex("#ffd965"), hex("#d4901f")],
		danger: [hex("#ff6b5e"), hex("#c8332b")],
		info: [hex("#7fd0ff"), hex("#2f7fd0")],
		pill: hex("#2b4a2e"),
		pillStroke: hex("#173018"),
		tile: hex("#3d3229"),
		tileStroke: hex("#1e1710"),
		font: Enum.Font.FredokaOne,
		fontBody: Enum.Font.GothamBold,
		radius: 14,
	};
	switch (UI_STYLE) {
		case "sci-fi":
			return { ...base, paper: hex("#141a2a"), paperDark: hex("#0d1220"), ink: hex("#5ad7ff"), inkSoft: hex("#2e6f8a"), textDark: hex("#dff6ff"), primary: [hex("#6ff0ff"), hex("#1f7fd6")], gold: [hex("#ffd965"), hex("#e07a1f")], pill: hex("#0e2a3a"), pillStroke: hex("#5ad7ff"), tile: hex("#1b2338"), tileStroke: hex("#5ad7ff"), font: Enum.Font.GothamBlack, radius: 8 };
		case "horror":
			return { ...base, paper: hex("#1b1416"), paperDark: hex("#120d0f"), ink: hex("#6b1d1d"), inkSoft: hex("#8a3a3a"), textDark: hex("#e9dcd6"), primary: [hex("#c0392b"), hex("#5a1010")], gold: [hex("#d9a441"), hex("#7a4d0f")], pill: hex("#2a0f0f"), pillStroke: hex("#6b1d1d"), tile: hex("#241a1c"), tileStroke: hex("#6b1d1d"), font: Enum.Font.Creepster, radius: 6 };
		case "minimal":
		case "modern":
			return { ...base, paper: hex("#ffffff"), paperDark: hex("#eef1f5"), ink: hex("#1f2937"), inkSoft: hex("#6b7280"), textDark: hex("#1f2937"), primary: [lighten(ACCENT, 0.25), darken(ACCENT, 0.2)], gold: [hex("#fbbf24"), hex("#d97706")], pill: hex("#1f2937"), pillStroke: hex("#111827"), tile: hex("#2b3441"), tileStroke: hex("#111827"), font: Enum.Font.GothamBlack, fontBody: Enum.Font.Gotham, radius: 12 };
		case "candy":
			return { ...base, paper: hex("#fff1f8"), paperDark: hex("#ffd6ea"), ink: hex("#7a2a5a"), inkSoft: hex("#b05a8a"), textDark: hex("#7a2a5a"), primary: [hex("#ff9ad5"), hex("#e0489a")], gold: [hex("#ffe27a"), hex("#f0a020")], pill: hex("#7a2a5a"), pillStroke: hex("#4d1538"), tile: hex("#5a2a4a"), tileStroke: hex("#2d1224") };
		case "military":
			return { ...base, paper: hex("#2b2f26"), paperDark: hex("#1f221b"), ink: hex("#9aa06a"), inkSoft: hex("#6f7450"), textDark: hex("#e8e6d6"), primary: [hex("#9dbf5a"), hex("#4d6b23")], gold: [hex("#e8c25a"), hex("#a8781a")], pill: hex("#1f2a16"), pillStroke: hex("#9aa06a"), tile: hex("#1f221b"), tileStroke: hex("#9aa06a"), font: Enum.Font.GothamBlack, radius: 6 };
		case "fantasy":
			return { ...base, paper: hex("#f3e7c9"), paperDark: hex("#dcc89a"), ink: hex("#4a2f14"), primary: [hex("#a8e063"), hex("#3f8f2c")], gold: [hex("#ffd36a"), hex("#c98a1c")] };
		case "retro":
			return { ...base, paper: hex("#f7e8b0"), paperDark: hex("#e2c986"), ink: hex("#2b2b2b"), primary: [hex("#7ee787"), hex("#2f9e44")], font: Enum.Font.Arcade, fontBody: Enum.Font.Arcade, radius: 4 };
		default:
			return base;
	}
}

export const theme = makeTheme();

// ---------------------------------------------------------------- primitives

export function corner(parent: GuiObject, radius = theme.radius): UICorner {
	const c = new Instance("UICorner");
	c.CornerRadius = new UDim(0, radius);
	c.Parent = parent;
	return c;
}

export function stroke(parent: GuiObject, color: Color3, thickness = 3, transparency = 0): UIStroke {
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
export function shadow(target: GuiObject, offset = 5, transparency = 0.55): Frame {
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
	strokeColor?: Color3;
	strokeThickness?: number;
	radius?: number;
	shadow?: boolean;
	transparency?: number;
	zIndex?: number;
}

/** Paper panel: rounded, outlined, shadowed. */
export function panel(size: UDim2, position: UDim2, parent: Instance, opts: PanelOptions = {}): Frame {
	const f = new Instance("Frame");
	f.Size = size;
	f.Position = position;
	f.BackgroundColor3 = opts.color ?? theme.paper;
	f.BackgroundTransparency = opts.transparency ?? 0;
	f.BorderSizePixel = 0;
	f.ZIndex = opts.zIndex ?? 2;
	corner(f, opts.radius ?? theme.radius);
	stroke(f, opts.strokeColor ?? theme.ink, opts.strokeThickness ?? 3);
	f.Parent = parent;
	if (opts.shadow !== false) shadow(f);
	return f;
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
	const o = opts.outline ?? (opts.color === undefined || opts.color === theme.text ? 2.5 : 0);
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

/** Chunky gradient button with a bevel band, outline, outlined label and a press animation. */
export function button(str: string, size: UDim2, position: UDim2, parent: Instance, opts: ButtonOptions = {}): TextButton {
	const [top, bottom] = opts.colors ?? theme.primary;
	const b = new Instance("TextButton");
	b.Size = size;
	b.Position = position;
	b.BackgroundColor3 = new Color3(1, 1, 1);
	b.BorderSizePixel = 0;
	b.Text = "";
	b.AutoButtonColor = false;
	b.ZIndex = opts.zIndex ?? 3;
	corner(b, opts.radius ?? 12);
	gradient(b, top, bottom);
	stroke(b, theme.ink, 3);
	// bevel: darker band at the bottom
	const bevel = new Instance("Frame");
	bevel.Size = new UDim2(1, 0, 0, 6);
	bevel.Position = new UDim2(0, 0, 1, -6);
	bevel.BackgroundColor3 = darken(bottom, 0.25);
	bevel.BorderSizePixel = 0;
	bevel.ZIndex = b.ZIndex;
	corner(bevel, opts.radius ?? 12);
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
	shadow(b, 4, 0.5);
	pressAnimation(b);
	return b;
}

/** Squash on press, spring back on release (also on hover: slight grow). */
export function pressAnimation(b: GuiButton): void {
	const scale = new Instance("UIScale");
	scale.Parent = b;
	const to = (v: number, t = 0.08) => TweenService.Create(scale, new TweenInfo(t, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale: v }).Play();
	b.MouseButton1Down.Connect(() => to(0.93));
	b.MouseButton1Up.Connect(() => to(1.04, 0.12));
	b.MouseEnter.Connect(() => to(1.04));
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
	corner(f, 10);
	stroke(f, opts.strokeColor ?? theme.pillStroke, 2.5);
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
export function badge(str: string, position: UDim2, parent: Instance, color: Color3 = hex("#ff4f7a"), rotation = -10, size = 22): TextLabel {
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
