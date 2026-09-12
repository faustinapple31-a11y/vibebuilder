import { KeyframeSequenceProvider } from "@rbxts/services";
import type { AnimSpec } from "shared/animations";

/**
 * Procedural animations: an AnimSpec (joint Euler rotations per keyframe) becomes a KeyframeSequence
 * registered at runtime, playable through Animator:LoadAnimation like any catalog animation.
 * R15 joint names map to the Motor6D names of the rig; poses are hierarchical (HumanoidRootPart root).
 */
const R15_PARENT: Record<string, string> = {
	LowerTorso: "HumanoidRootPart",
	UpperTorso: "LowerTorso",
	Head: "UpperTorso",
	LeftUpperArm: "UpperTorso",
	LeftLowerArm: "LeftUpperArm",
	LeftHand: "LeftLowerArm",
	RightUpperArm: "UpperTorso",
	RightLowerArm: "RightUpperArm",
	RightHand: "RightLowerArm",
	LeftUpperLeg: "LowerTorso",
	LeftLowerLeg: "LeftUpperLeg",
	LeftFoot: "LeftLowerLeg",
	RightUpperLeg: "LowerTorso",
	RightLowerLeg: "RightUpperLeg",
	RightFoot: "RightLowerLeg",
};

/** Friendly joint names used by the spec → the R15 part that the Motor6D drives. */
const JOINT_PART: Record<string, string> = {
	Root: "LowerTorso",
	Waist: "UpperTorso",
	Neck: "Head",
	LeftShoulder: "LeftUpperArm",
	LeftElbow: "LeftLowerArm",
	LeftWrist: "LeftHand",
	RightShoulder: "RightUpperArm",
	RightElbow: "RightLowerArm",
	RightWrist: "RightHand",
	LeftHip: "LeftUpperLeg",
	LeftKnee: "LeftLowerLeg",
	LeftAnkle: "LeftFoot",
	RightHip: "RightUpperLeg",
	RightKnee: "RightLowerLeg",
	RightAnkle: "RightFoot",
};

const registered = new Map<string, string>();

function buildPoseTree(rotations: Map<string, CFrame>): Pose {
	const poses = new Map<string, Pose>();
	const make = (part: string): Pose => {
		let p = poses.get(part);
		if (p) return p;
		p = new Instance("Pose");
		p.Name = part;
		p.CFrame = rotations.get(part) ?? new CFrame();
		p.EasingStyle = Enum.PoseEasingStyle.Cubic;
		p.EasingDirection = Enum.PoseEasingDirection.InOut;
		poses.set(part, p);
		const parentName = R15_PARENT[part];
		if (parentName !== undefined) {
			const parent = make(parentName);
			p.Parent = parent;
		}
		return p;
	};
	const root = make("HumanoidRootPart");
	// every rig part gets a pose so the sequence is complete
	for (const [part] of pairs(R15_PARENT)) make(part as string);
	return root;
}

/** Builds (and caches) a KeyframeSequence for the spec; returns an animation id usable by Animator:LoadAnimation. */
export function registerAnimSpec(spec: AnimSpec): string {
	const cached = registered.get(spec.id);
	if (cached !== undefined) return cached;
	const seq = new Instance("KeyframeSequence");
	seq.Name = spec.name;
	seq.Loop = spec.loop;
	seq.Priority = spec.priority === "Idle" ? Enum.AnimationPriority.Idle : spec.priority === "Movement" ? Enum.AnimationPriority.Movement : Enum.AnimationPriority.Action;
	for (const kf of spec.keyframes) {
		const frame = new Instance("Keyframe");
		frame.Time = kf.t * spec.durationSeconds;
		const rotations = new Map<string, CFrame>();
		for (const [joint, deg] of pairs(kf.joints)) {
			const part = JOINT_PART[joint as string] ?? (joint as string);
			const [rx, ry, rz] = deg as [number, number, number];
			rotations.set(part, CFrame.fromEulerAnglesXYZ(math.rad(rx), math.rad(ry), math.rad(rz)));
		}
		buildPoseTree(rotations).Parent = frame;
		frame.Parent = seq;
	}
	const id = KeyframeSequenceProvider.RegisterKeyframeSequence(seq);
	registered.set(spec.id, id);
	return id;
}

/** Loads a catalog animation or a custom spec onto a humanoid's Animator. */
export function loadAnimation(humanoid: Humanoid, idOrSpec: string | AnimSpec): AnimationTrack {
	const animator = (humanoid.FindFirstChildOfClass("Animator") as Animator | undefined) ?? new Instance("Animator", humanoid);
	const anim = new Instance("Animation");
	anim.AnimationId = typeIs(idOrSpec, "string") ? idOrSpec : registerAnimSpec(idOrSpec);
	return animator.LoadAnimation(anim);
}
