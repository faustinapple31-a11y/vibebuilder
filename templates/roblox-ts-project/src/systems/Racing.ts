import { Players, Workspace } from "@rbxts/services";
import { GameConfig } from "shared/config";
import { getRemoteEvent, Remotes } from "shared/net";
import { findZone, sortedZones, type ZoneInfo } from "shared/zones";
import * as PlayerData from "./PlayerData";
import * as Progression from "./Progression";

/**
 * Vehicles + racing. `spawnVehicle()` builds a simple physics car (VehicleSeat, wheels with
 * cylinder constraints, motor via VehicleSeat torque) at a spawn pad; the racing loop watches
 * checkpoint gates (`race_cp_N` zones) in order, counts laps at `race_start`, records best times.
 * Roleplay / battle-royale genres reuse `spawnVehicle` for free-roam cars.
 */
const cfg = GameConfig.racing;
const notify = getRemoteEvent(Remotes.Notify);
const hudValue = getRemoteEvent(Remotes.HudValue);
const action = getRemoteEvent(Remotes.Action);
const vehicles = new Map<Player, Model>();

export function spawnVehicle(player: Player, at: CFrame, color?: Color3): Model {
	vehicles.get(player)?.Destroy();
	const model = new Instance("Model");
	model.Name = `${player.Name}_car`;
	const body = new Instance("Part");
	body.Name = "Body";
	body.Size = new Vector3(6, 2, 11);
	body.Color = color ?? Color3.fromHSV(math.random(), 0.7, 0.9);
	body.Material = Enum.Material.SmoothPlastic;
	body.CFrame = at.mul(new CFrame(0, 3, 0));
	body.Parent = model;
	const seat = new Instance("VehicleSeat");
	seat.Size = new Vector3(3, 1, 3);
	seat.MaxSpeed = 90;
	seat.Torque = 40;
	seat.TurnSpeed = 1.6;
	seat.HeadsUpDisplay = false;
	seat.CFrame = body.CFrame.mul(new CFrame(0, 1.5, 0.5));
	seat.Parent = model;
	const weld = new Instance("WeldConstraint");
	weld.Part0 = body;
	weld.Part1 = seat;
	weld.Parent = seat;
	const cabin = new Instance("Part");
	cabin.Size = new Vector3(5, 1.8, 5);
	cabin.Color = body.Color;
	cabin.Transparency = 0.3;
	cabin.CFrame = body.CFrame.mul(new CFrame(0, 1.9, 0));
	cabin.Parent = model;
	const w2 = new Instance("WeldConstraint");
	w2.Part0 = body;
	w2.Part1 = cabin;
	w2.Parent = cabin;
	// wheels: cylinders on hinge constraints driven by the seat's throttle
	const wheels: { part: Part; hinge: HingeConstraint; steer: boolean }[] = [];
	for (const sx of [-1, 1]) {
		for (const sz of [-1, 1]) {
			const wheel = new Instance("Part");
			wheel.Shape = Enum.PartType.Cylinder;
			wheel.Size = new Vector3(1.2, 2.8, 2.8);
			wheel.Color = Color3.fromRGB(30, 30, 30);
			wheel.Material = Enum.Material.Rubber;
			wheel.CFrame = body.CFrame.mul(new CFrame(sx * 3.3, -1, sz * 3.5));
			wheel.Parent = model;
			const a0 = new Instance("Attachment");
			a0.CFrame = new CFrame(sx * 3.3, -1, sz * 3.5).mul(CFrame.Angles(0, 0, math.rad(90)));
			a0.Parent = body;
			const a1 = new Instance("Attachment");
			a1.CFrame = CFrame.Angles(0, 0, math.rad(90));
			a1.Parent = wheel;
			const hinge = new Instance("HingeConstraint");
			hinge.Attachment0 = a0;
			hinge.Attachment1 = a1;
			hinge.ActuatorType = Enum.ActuatorType.Motor;
			hinge.MotorMaxTorque = 20000;
			hinge.MotorMaxAcceleration = 60;
			hinge.Parent = body;
			wheels.push({ part: wheel, hinge, steer: sz < 0 });
		}
	}
	model.PrimaryPart = body;
	model.Parent = Workspace;
	body.SetNetworkOwner(player);
	// drive loop
	task.spawn(() => {
		while (model.Parent) {
			const throttle = seat.ThrottleFloat;
			const steer = seat.SteerFloat;
			for (const w of wheels) {
				const dir = w.part.Position.sub(body.Position).Dot(body.CFrame.RightVector) > 0 ? -1 : 1;
				w.hinge.AngularVelocity = throttle * 24 * dir;
			}
			body.AssemblyAngularVelocity = new Vector3(0, -steer * throttle * 1.4, 0).add(new Vector3(body.AssemblyAngularVelocity.X, 0, body.AssemblyAngularVelocity.Z));
			task.wait(0.1);
		}
	});
	vehicles.set(player, model);
	return model;
}

// ---------------------------------------------------------------- racing loop
interface Progress {
	next: number;
	lap: number;
	lapStart: number;
}
const progress = new Map<Player, Progress>();
let gates: ZoneInfo[] = [];

function hookGate(zone: ZoneInfo, index: number): void {
	const pad = new Instance("Part");
	pad.Size = new Vector3(28, 14, 6);
	pad.CFrame = new CFrame(zone.position.add(new Vector3(0, 5, 0)));
	pad.Anchored = true;
	pad.CanCollide = false;
	pad.Transparency = 1;
	pad.Parent = zone.part;
	pad.Touched.Connect((hit) => {
		const model = hit.FindFirstAncestorOfClass("Model");
		const player = model ? (Players.GetPlayerFromCharacter(model) ?? [...vehicles].find(([, m]) => m === model)?.[0]) : undefined;
		if (!player) return;
		const pr = progress.get(player) ?? { next: 0, lap: 0, lapStart: os.clock() };
		progress.set(player, pr);
		if (index !== pr.next) return;
		if (index === 0 && pr.lap > 0) {
			// lap complete
			const t = os.clock() - pr.lapStart;
			const best = PlayerData.getStat(player, "best_lap");
			if (best === 0 || t < best) PlayerData.setStat(player, "best_lap", math.floor(t * 100) / 100);
			PlayerData.addCoins(player, cfg.lapReward);
			Progression.grantXp(player, GameConfig.progression.xpPerAction * 3);
			notify.FireClient(player, `Lap ${pr.lap} — ${string.format("%.2f", t)}s`);
			if (pr.lap >= cfg.laps) {
				PlayerData.addStat(player, "Wins", 1);
				notify.FireClient(player, "Race complete!");
				pr.lap = 0;
			}
			pr.lapStart = os.clock();
		}
		if (index === 0) pr.lap += 1;
		else PlayerData.addCoins(player, cfg.checkpointReward);
		pr.next = (index + 1) % gates.size();
		hudValue.FireClient(player, "race", "Lap", `${math.max(1, pr.lap)} / ${cfg.laps}  ·  CP ${pr.next} / ${gates.size()}`);
	});
}

export function start(): void {
	const racing = GameConfig.systems.includes("racing");
	const vehiclesOn = GameConfig.systems.includes("vehicles") || racing;
	if (!vehiclesOn) return;
	task.spawn(() => {
		while (Workspace.GetAttribute("WorldReady") !== true) task.wait(1);
		if (racing) {
			const start = findZone("race_start");
			gates = [...(start ? [start] : []), ...sortedZones("race_cp_", "index")];
			gates.forEach((g, i) => hookGate(g, i));
			print(`[WorldForge] race track with ${gates.size()} gates`);
		}
	});
	action.OnServerEvent.Connect((player, name) => {
		if (name !== "spawn_vehicle") return;
		const root = player.Character?.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
		if (!root) return;
		const start = findZone("race_start");
		const at = racing && start ? new CFrame(start.position.add(new Vector3(0, 2, 8))) : root.CFrame.mul(new CFrame(0, 0, -12));
		const car = spawnVehicle(player, at);
		const seat = car.FindFirstChildOfClass("VehicleSeat");
		const hum = player.Character?.FindFirstChildOfClass("Humanoid");
		if (seat && hum) task.delay(0.3, () => seat.Sit(hum));
	});
	const setup = (player: Player) => {
		task.delay(1.5, () => hudValue.FireClient(player, "vehicle", "Vehicle", "press V to spawn a car"));
	};
	Players.PlayerAdded.Connect(setup);
	for (const p of Players.GetPlayers()) setup(p);
	Players.PlayerRemoving.Connect((p) => {
		vehicles.get(p)?.Destroy();
		vehicles.delete(p);
		progress.delete(p);
	});
}
