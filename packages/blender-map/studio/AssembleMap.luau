--!strict
--[[
	Puts a Blender map together in Studio from its imported kit.

	kit       Folder with one Model per file of kit/ (castle_0_l0, castle_0_l1...), as the 3D importer names them
	manifest  the decoded manifest.json of the export
	textures  { ["textures/slate_color.png"] = "rbxassetid://..." } for the images, uploaded once

	Every MeshPart is set the way Roblox shows vertex colours: TextureID (a SurfaceAppearance would ignore them), white
	Color, a matte Material, and Transparency 0.02 on foliage so the alpha of the leaf atlas cuts it out.
]]
local AssembleMap = {}

-- matte materials under the texture: with SmoothPlastic, beams and tiles shine like toys
local MATTE = {
	Rubble = "Slate", Slate = "Slate", Rock = "Slate", Concrete = "Concrete", Wood = "Wood", WoodPlanks = "Wood", Roof = "Slate", Thatch = "Fabric", Brick = "Brick", Bark = "Wood", BirchBark = "Wood",
	Metal = "Metal", Fabric = "Fabric", Ground = "Ground", Grass = "Grass", Leaf = "Grass", Cobblestone = "Slate", SmoothPlastic = "Concrete", RealConcrete = "Concrete", Panel = "Metal", Gravel = "Slate", Asphalt = "Concrete", Sand = "Sand", Snow = "Concrete",
}

function AssembleMap.dress(part: MeshPart, material: string, info: any, textures: { [string]: string })
	part.Anchored = true
	part.Color = Color3.new(1, 1, 1)
	part.CastShadow = true
	part.DoubleSided = info ~= nil and info.doubleSided == true
	if material == "Glow" or material == "Neon" then
		part.Material = Enum.Material.Neon
		part.Color = Color3.fromRGB(150, 140, 150) -- full white neon burns the warm vertex colour out to yellow
		part.CastShadow = false
	elseif material == "Glass" or material == "Water" then
		part.Material = Enum.Material.Glass
		part.Transparency = if material == "Water" then 0.35 else 0.1
	else
		part.Material = (Enum.Material :: any)[MATTE[material] or "Concrete"]
		local id = info and info.maps and textures[info.maps.color]
		if id then
			part.TextureID = id
		end
	end
	if material == "Leaf" then
		part.Transparency = 0.02
		part.CanCollide = false
		part.CanTouch = false
		part.CanQuery = false
	end
end

--- Collisions: what can be walked on keeps its shape, the rest is a box or nothing.
local function collide(part: MeshPart, category: string, size: Vector3)
	if category == "vegetation" then
		part.CanCollide = part.Name:find("Bark") ~= nil and size.Y > 8
		part.CanQuery = part.CanCollide
	elseif category == "building" or category == "landmark" then
		part.CanCollide = part.Name:find("Glow") == nil and part.Name:find("Leaf") == nil
	else
		part.CanCollide = math.max(size.X, size.Z) > 1.5
	end
end

function AssembleMap.build(kit: Instance, manifest: any, textures: { [string]: string }, parent: Instance): { [string]: number }
	local stats = { placed = 0, missing = 0, tris = 0 }
	local templates: { [string]: Model } = {}
	local function template(piece: string, lod: number): Model?
		local entry = manifest.pieces[piece]
		if not entry then
			return nil
		end
		-- a far level that was not exported (too small to matter) falls back to the next closer one
		for l = lod, 0, -1 do
			local key = `{piece}_l{l}`
			if templates[key] then
				return templates[key]
			end
			local model = kit:FindFirstChild(key)
			if model and model:IsA("Model") and entry.lods[l + 1] then
				for _, d in model:GetDescendants() do
					if d:IsA("MeshPart") then
						local material = d.Name:match("__([%a]+)") or d.Name
						AssembleMap.dress(d, material, manifest.materials[material], textures)
					end
				end
				model.WorldPivot = CFrame.new()
				templates[key] = model
				return model
			end
		end
		return nil
	end
	-- one folder per 128-stud cell: streaming loads and unloads them as a block
	local cells: { [string]: Model } = {}
	for i, p in manifest.layout do
		local t = template(p.piece, p.lod or 0)
		if t then
			local key = `{p.position[1] // 128},{p.position[3] // 128}`
			local cell = cells[key]
			if not cell then
				cell = Instance.new("Model")
				cell.Name = `cell {key}`
				cell.ModelStreamingMode = Enum.ModelStreamingMode.Nonatomic
				cell.Parent = parent
				cells[key] = cell
			end
			local m = t:Clone()
			m.Name = p.id
			if p.scale ~= 1 then
				m:ScaleTo(p.scale)
			end
			local q = p.quaternion
			m:PivotTo(CFrame.new(p.position[1], p.position[2], p.position[3], q[1], q[2], q[3], q[4]))
			for _, d in m:GetDescendants() do
				if d:IsA("MeshPart") then
					collide(d, p.category, d.Size)
				end
			end
			m.Parent = cell
			stats.placed += 1
			local lod = manifest.pieces[p.piece].lods[(p.lod or 0) + 1]
			stats.tris += if lod then lod.tris else 0
		else
			stats.missing += 1
		end
		if i % 400 == 0 then
			task.wait()
		end
	end
	return stats
end

return AssembleMap
