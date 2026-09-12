import { Players, SoundService, Workspace } from "@rbxts/services";
import { AudioConfig } from "shared/audio";
import { getRemoteEvent, Remotes } from "shared/net";

/**
 * Music & sounds: a looping ambient track, per-zone ambience (village / forest / ruins…) attached to the
 * world zones, and short SFX fired to clients (collect, purchase, error, notify). Asset ids come from
 * design/game.spec.json (generated or uploaded through WorldForge, or picked from the Creator Store).
 */
const sfxRemote = getRemoteEvent(Remotes.PlaySfx);

function makeSound(name: string, id: string, volume: number, looped: boolean, parent: Instance): Sound {
	const s = new Instance("Sound");
	s.Name = name;
	s.SoundId = id;
	s.Volume = volume;
	s.Looped = looped;
	s.RollOffMode = Enum.RollOffMode.InverseTapered;
	s.Parent = parent;
	return s;
}

export function playSfx(player: Player, kind: keyof typeof AudioConfig.sfx): void {
	const id = AudioConfig.sfx[kind];
	if (id !== undefined && id !== "") sfxRemote.FireClient(player, id);
}

export function start(): void {
	// ambient music: SoundService-level loop (clients hear it everywhere)
	if (AudioConfig.ambientMusic !== undefined && AudioConfig.ambientMusic !== "") {
		const music = makeSound("AmbientMusic", AudioConfig.ambientMusic, AudioConfig.musicVolume, true, SoundService);
		music.Play();
	}
	// zone ambience: positional loops at the zone centres (village chatter, forest birds, ruins wind…)
	const world = Workspace.WaitForChild("World", 60);
	if (!world) return;
	const attach = () => {
		for (const z of AudioConfig.zoneAmbience) {
			const zone = (world.FindFirstChild("Zones") as Folder | undefined)?.FindFirstChild(z.zone) as BasePart | undefined;
			const anchor = zone ?? (world.FindFirstChildWhichIsA("BasePart", true) as BasePart | undefined);
			if (!anchor) continue;
			const s = makeSound(`Ambience_${z.zone}`, z.soundId, z.volume, true, anchor);
			s.RollOffMaxDistance = 260;
			s.RollOffMinDistance = 40;
			s.Play();
		}
	};
	if (Workspace.GetAttribute("WorldReady") === true) attach();
	else Workspace.GetAttributeChangedSignal("WorldReady").Once(() => attach());
	void Players;
}
