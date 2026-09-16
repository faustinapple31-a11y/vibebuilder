import { Workspace } from "@rbxts/services";
import { meshDataFolder, meshDataFromValue, meshTemplate } from "shared/world/meshFactory";

/**
 * Client side of the procedural meshes: server-built EditableMeshes do not render on clients, so every
 * MeshPart tagged `WfMesh` gets the same mesh rebuilt locally (from the data the server published under
 * ReplicatedStorage.WorldAssets.Meshes) and applied with `ApplyMesh`. Works with streaming (parts that
 * arrive later are handled by DescendantAdded).
 */
const pending = new Map<string, MeshPart[]>();

function apply(part: MeshPart, key: string): boolean {
	const folder = meshDataFolder(false);
	const sv = folder?.FindFirstChild(key) as StringValue | undefined;
	if (!sv) return false;
	const template = meshTemplate(key, meshDataFromValue(sv));
	if (!template) return false;
	const [ok, err] = pcall(() => part.ApplyMesh(template));
	if (!ok) warn(`WorldForge: ApplyMesh failed for ${key}: ${err}`);
	return ok;
}

function handle(inst: Instance): void {
	if (!inst.IsA("MeshPart")) return;
	const key = inst.GetAttribute("WfMesh");
	if (!typeIs(key, "string")) return;
	if (!apply(inst, key)) {
		const list = pending.get(key) ?? [];
		list.push(inst);
		pending.set(key, list);
	}
}

export function startMeshRender(): void {
	task.spawn(() => {
		const world = Workspace.WaitForChild("World", 120) as Folder | undefined;
		if (!world) return;
		for (const d of world.GetDescendants()) handle(d);
		world.DescendantAdded.Connect(handle);
		// mesh data published after the part (or the folder) arrived: retry those parts
		const folder = meshDataFolder(false);
		const retry = (sv: Instance) => {
			const list = pending.get(sv.Name);
			if (!list) return;
			pending.delete(sv.Name);
			for (const p of list) if (p.Parent) apply(p, sv.Name);
		};
		if (folder) folder.ChildAdded.Connect(retry);
		else {
			const assets = game.GetService("ReplicatedStorage").WaitForChild("WorldAssets", 60);
			assets?.ChildAdded.Connect((c) => {
				if (c.Name === "Meshes") {
					for (const sv of c.GetChildren()) retry(sv);
					c.ChildAdded.Connect(retry);
				}
			});
		}
	});
}
