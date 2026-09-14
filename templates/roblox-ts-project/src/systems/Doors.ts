import { TweenService, Workspace } from "@rbxts/services";
import { registerDevCommand } from "./PlayerData";

/**
 * Doors: every part named "Door" in the generated world (house/shop/apartment door leaves, gate
 * leaves) gets a ProximityPrompt and swings open around its hinge edge (local -X side) with a tween.
 * Doors close again after a delay so interiors stay sheltered from wandering enemies.
 */
const OPEN_ANGLE = -105;
const AUTO_CLOSE = 10;
const TWEEN = new TweenInfo(0.45, Enum.EasingStyle.Quad, Enum.EasingDirection.Out);
const toggles = new Map<BasePart, () => boolean>();

function hook(door: BasePart): void {
	if (door.FindFirstChildOfClass("ProximityPrompt")) return;
	const closed = door.CFrame;
	const hinge = closed.mul(new CFrame(-door.Size.X / 2, 0, 0));
	const opened = hinge.mul(CFrame.Angles(0, math.rad(OPEN_ANGLE), 0)).mul(new CFrame(door.Size.X / 2, 0, 0));
	const prompt = new Instance("ProximityPrompt");
	prompt.ActionText = "Open";
	prompt.ObjectText = "Door";
	prompt.KeyboardKeyCode = Enum.KeyCode.E;
	prompt.MaxActivationDistance = 9;
	prompt.HoldDuration = 0;
	prompt.RequiresLineOfSight = false;
	prompt.Parent = door;
	let isOpen = false;
	let closeToken = 0;
	const setOpen = (open: boolean) => {
		if (isOpen === open) return;
		isOpen = open;
		door.CanCollide = !open;
		prompt.ActionText = open ? "Close" : "Open";
		TweenService.Create(door, TWEEN, { CFrame: open ? opened : closed }).Play();
		if (open) {
			const token = ++closeToken;
			task.delay(AUTO_CLOSE, () => {
				if (token === closeToken && isOpen) setOpen(false);
			});
		}
	};
	prompt.Triggered.Connect(() => setOpen(!isOpen));
	toggles.set(door, () => {
		setOpen(!isOpen);
		return isOpen;
	});
}

export function start(): void {
	// Studio QA: ServerStorage.WorldForgeDev:Invoke("toggleDoor", doorPart) → true when the door is now open
	registerDevCommand("toggleDoor", (door) => (typeIs(door, "Instance") && door.IsA("BasePart") ? toggles.get(door)?.() : undefined));
	task.spawn(() => {
		while (Workspace.GetAttribute("WorldReady") !== true) task.wait(1);
		const world = Workspace.FindFirstChild("World");
		if (!world) return;
		let count = 0;
		for (const d of world.GetDescendants()) {
			if (d.IsA("BasePart") && d.Name === "Door") {
				hook(d);
				count++;
			}
		}
		world.DescendantAdded.Connect((d) => {
			if (d.IsA("BasePart") && d.Name === "Door") hook(d);
		});
		print(`[WorldForge] ${count} doors`);
	});
}
