import { Remotes, waitRemoteEvent, type ProfileStateMsg } from "shared/net";
import { RecipeConfig, type RecipeDef } from "shared/recipes";
import { acquirePop, body, button, card, darken, emptyIllustration, lighten, panel, playEventSound, prettyName, refuse, resourceIcon, stroke, text, theme, Window } from "./kit";
import { L } from "./strings.generated";

/**
 * Crafting screen: one card per recipe of shared/recipes.ts — output tile with the produced count, the
 * inputs with "have / need" (green when covered, red when missing) and a Craft button that fires the
 * server action. The server (Economy.startCrafting) re-checks the inventory, so the button is only a
 * hint: it greys out when an input is missing.
 */
export class Crafting {
	private win: Window;
	private action = waitRemoteEvent(Remotes.Action);
	private profile: ProfileStateMsg = { coins: 0, inventory: {}, owned: [], stats: {}, quests: {} };

	constructor() {
		this.win = new Window("Crafting", L.crafting, { width: 620, height: 580, displayOrder: 6 });
		this.win.onOpen = () => this.render();
	}

	isOpen(): boolean {
		return this.win.open;
	}

	toggle(): void {
		this.win.toggle();
	}

	setProfile(state: ProfileStateMsg): void {
		this.profile = state;
		this.win.setCoins(state.coins);
		if (this.win.open) this.render();
	}

	private have(item: string): number {
		return this.profile.inventory[item] ?? 0;
	}

	private canCraft(recipe: RecipeDef): boolean {
		for (const [item, need] of pairs(recipe.inputs)) if (this.have(item as string) < (need as number)) return false;
		return true;
	}

	private render(): void {
		this.win.clearBody();
		this.win.setCoins(this.profile.coins);
		let order = 0;
		if (RecipeConfig.recipes.size() === 0) {
			const empty = card(108, order++, this.win.body);
			const crate = emptyIllustration(64, empty);
			crate.Position = new UDim2(0.5, -32, 0, 6);
			body(L.noRecipe, new UDim2(1, -24, 0, 32), new UDim2(0, 12, 1, -36), empty, { size: 15, align: Enum.TextXAlignment.Center, zIndex: 5 });
			return;
		}
		for (const recipe of RecipeConfig.recipes) {
			const ok = this.canCraft(recipe);
			const row = card(104, order++, this.win.body);
			// output tile
			const tile = new Instance("Frame");
			tile.Size = new UDim2(0, 74, 0, 74);
			tile.Position = new UDim2(0, 14, 0, 15);
			tile.BackgroundColor3 = theme.tile;
			tile.BorderSizePixel = 0;
			tile.ZIndex = 6;
			const c = new Instance("UICorner");
			c.CornerRadius = new UDim(0, 14);
			c.Parent = tile;
			stroke(tile, theme.tileStroke, 3);
			tile.Parent = row;
			const icon = resourceIcon(recipe.output, 44, tile);
			icon.Position = new UDim2(0.5, -22, 0, 8);
			icon.ZIndex = 7;
			text(`x${recipe.count}`, new UDim2(1, 0, 0, 20), new UDim2(0, 0, 1, -22), tile, { size: 15, align: Enum.TextXAlignment.Center, zIndex: 8, outline: 1.5 });

			text(recipe.name, new UDim2(1, -280, 0, 28), new UDim2(0, 100, 0, 12), row, { size: 23, color: theme.textDark, outline: 0, zIndex: 6 });

			// inputs: small tiles with have / need
			let x = 100;
			for (const [item, need] of pairs(recipe.inputs)) {
				const id = item as string;
				const count = need as number;
				const enough = this.have(id) >= count;
				const chip = panel(new UDim2(0, 104, 0, 34), new UDim2(0, x, 0, 52), row, { color: enough ? theme.pill : darken(theme.bad, 0.55), strokeColor: enough ? theme.pillStroke : theme.bad, radius: math.min(10, theme.radius), shadow: false, zIndex: 6 });
				const ic = resourceIcon(id, 24, chip);
				ic.Position = new UDim2(0, 6, 0.5, -12);
				ic.ZIndex = 8;
				text(`${this.have(id)}/${count}`, new UDim2(1, -38, 1, 0), new UDim2(0, 34, 0, 0), chip, { size: 15, zIndex: 8, outline: 1.5 });
				body(prettyName(id), new UDim2(0, 104, 0, 16), new UDim2(0, x, 0, 88), row, { size: 11, align: Enum.TextXAlignment.Center, zIndex: 6 });
				x += 112;
			}

			const craft = button(L.craft, new UDim2(0, 128, 0, 48), new UDim2(1, -144, 0.5, -24), row, { colors: ok ? theme.primary : [lighten(theme.inkSoft, 0.15), darken(theme.inkSoft, 0.25)], size: 22, radius: math.min(12, theme.radius), zIndex: 7 });
			craft.MouseButton1Click.Connect(() => {
				if (!this.canCraft(recipe)) {
					refuse(craft);
					return;
				}
				this.action.FireServer("craft", recipe.id);
				playEventSound("success");
				acquirePop(tile);
			});
		}
	}
}
