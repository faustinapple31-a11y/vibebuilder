import { GameConfig } from "shared/config";
import type { ProfileStateMsg } from "shared/net";
import { QuestConfig } from "shared/quests";
import { body, card, coinIcon, panel, progressBar, resourceIcon, sectionHeader, text, textOn, theme, Window } from "./kit";

/**
 * Quests screen: one card per quest of shared/quests.ts with its objective, a progress bar fed by the
 * replicated quest counters (Progression.progressQuest → ProfileState) and the reward. Completed
 * quests move to their own section with a check mark.
 */
export class Quests {
	private win: Window;
	private profile: ProfileStateMsg = { coins: 0, inventory: {}, owned: [], stats: {}, quests: {} };

	constructor() {
		this.win = new Window("Quests", "Quests", { width: 600, height: 560, displayOrder: 6 });
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

	private objectiveText(objective: { type: string; target: string; count: number }): string {
		const target = objective.target === "any" ? "" : ` ${objective.target.gsub("_", " ")[0]}`;
		switch (objective.type) {
			case "collect":
				return `Collect ${objective.count}${target}`;
			case "reach":
				return `Reach${target === "" ? " the goal" : target}`;
			case "talk":
				return `Talk to${target === "" ? " an NPC" : target}`;
			case "defeat":
				return `Defeat ${objective.count}${target === "" ? " enemies" : target}`;
			case "survive":
				return `Survive ${objective.count} nights`;
			case "build":
				return `Build ${objective.count}${target}`;
			case "escape":
				return `Escape${target === "" ? "" : target}`;
			case "win_rounds":
				return `Win ${objective.count} rounds`;
			case "score":
				return `Score ${objective.count} points`;
			case "craft":
				return `Craft ${objective.count}${target}`;
			case "deliver":
				return `Deliver ${objective.count}${target}`;
			default:
				return `${objective.type} ${objective.count}${target}`;
		}
	}

	private render(): void {
		this.win.clearBody();
		this.win.setCoins(this.profile.coins);
		let order = 0;
		const active = QuestConfig.quests.filter((q) => this.profile.quests[q.id]?.done !== true);
		const done = QuestConfig.quests.filter((q) => this.profile.quests[q.id]?.done === true);

		if (QuestConfig.quests.size() === 0) {
			const empty = card(60, order++, this.win.body);
			body("No quest in this game yet — add them to design/game.spec.json.", new UDim2(1, -24, 1, 0), new UDim2(0, 12, 0, 0), empty, { size: 15, align: Enum.TextXAlignment.Center, zIndex: 5 });
			return;
		}

		if (active.size() > 0) sectionHeader("In progress", this.win.body, order++);
		for (const quest of active) {
			const progress = this.profile.quests[quest.id]?.progress ?? 0;
			const row = card(112, order++, this.win.body);
			text(quest.title, new UDim2(1, -150, 0, 30), new UDim2(0, 16, 0, 8), row, { size: 24, color: theme.textDark, outline: 0, zIndex: 6 });
			body(quest.description !== "" ? quest.description : this.objectiveText(quest.objective), new UDim2(1, -150, 0, 34), new UDim2(0, 16, 0, 36), row, { size: 14, valign: Enum.TextYAlignment.Top, zIndex: 6 });
			const bar = progressBar(new UDim2(1, -32, 0, 22), new UDim2(0, 16, 0, 78), row, theme.primary, 6);
			bar.set(progress / math.max(1, quest.objective.count));
			bar.label.Text = `${math.min(progress, quest.objective.count)} / ${quest.objective.count}`;
			// reward pill (coins or item)
			const reward = panel(new UDim2(0, 120, 0, 36), new UDim2(1, -136, 0, 12), row, { color: theme.pill, strokeColor: theme.pillStroke, radius: 10, shadow: false, zIndex: 6 });
			const isCurrency = quest.reward.currency === "" || quest.reward.currency === GameConfig.currency.id || quest.reward.currency === "coins";
			const icon = isCurrency ? coinIcon(24, reward) : resourceIcon(quest.reward.currency, 24, reward);
			icon.Position = new UDim2(0, 8, 0.5, -12);
			icon.ZIndex = 8;
			text(`+${quest.reward.amount}`, new UDim2(1, -42, 1, 0), new UDim2(0, 38, 0, 0), reward, { size: 18, zIndex: 8, outline: 1.5 });
		}

		if (done.size() > 0) {
			sectionHeader("Completed", this.win.body, order++);
			for (const quest of done) {
				const row = card(56, order++, this.win.body, theme.primary);
				text(quest.title, new UDim2(1, -120, 1, 0), new UDim2(0, 16, 0, 0), row, { size: 22, color: textOn(theme.primary[1]), zIndex: 6 });
				text("✓", new UDim2(0, 60, 1, 0), new UDim2(1, -70, 0, 0), row, { size: 30, align: Enum.TextXAlignment.Center, color: textOn(theme.primary[1]), zIndex: 6 });
				body(`+${quest.reward.amount} ${GameConfig.currency.name}`, new UDim2(0, 200, 0, 18), new UDim2(0, 16, 1, -22), row, { size: 12, color: textOn(theme.primary[1]), zIndex: 6 });
			}
		}
	}
}
