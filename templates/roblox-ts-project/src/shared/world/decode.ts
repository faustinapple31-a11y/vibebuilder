/**
 * Base64 → Luau buffer decoding + typed readers for the WorldBake payload.
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LUT = new Array<number>(256, 0);
for (let i = 0; i < 64; i++) {
	const [code] = ALPHABET.byte(i + 1, i + 1);
	LUT[code] = i;
}

export function base64ToBuffer(s: string): buffer {
	const len = s.size();
	let pad = 0;
	if (len >= 1 && s.sub(len, len) === "=") pad++;
	if (len >= 2 && s.sub(len - 1, len - 1) === "=") pad++;
	const outLen = math.floor((len * 3) / 4) - pad;
	const out = buffer.create(math.max(0, outLen));
	let o = 0;
	for (let i = 1; i <= len; i += 4) {
		const [a, b, c, d] = s.byte(i, i + 3);
		const va = LUT[a] ?? 0;
		const vb = LUT[b] ?? 0;
		const vc = c !== undefined ? (LUT[c] ?? 0) : 0;
		const vd = d !== undefined ? (LUT[d] ?? 0) : 0;
		const n = (va << 18) | (vb << 12) | (vc << 6) | vd;
		if (o < outLen) buffer.writeu8(out, o++, (n >>> 16) & 255);
		if (o < outLen) buffer.writeu8(out, o++, (n >>> 8) & 255);
		if (o < outLen) buffer.writeu8(out, o++, n & 255);
	}
	return out;
}

export function readF32(buf: buffer, index: number): number {
	return buffer.readf32(buf, index * 4);
}

export function readU8(buf: buffer, index: number): number {
	return buffer.readu8(buf, index);
}

export function f32Count(buf: buffer): number {
	return math.floor(buffer.len(buf) / 4);
}

export function hexToColor3(hex: string): Color3 {
	const [ok, c] = pcall(() => Color3.fromHex(hex));
	return ok ? (c as Color3) : new Color3(1, 0, 1);
}
