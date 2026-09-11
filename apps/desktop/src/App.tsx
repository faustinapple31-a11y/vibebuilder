import { useEffect } from "react";
import { TooltipProvider } from "@/components/ui";
import { useSettings } from "@/stores/settingsStore";
import { useProjects } from "@/stores/projectStore";
import { useWorld } from "@/stores/worldStore";
import { useAgents } from "@/stores/agentStore";
import { useRoblox } from "@/stores/robloxStore";
import { HomeScreen } from "@/features/home/HomeScreen";
import { Workspace } from "@/app/Workspace";

export default function App() {
  const ready = useSettings((s) => s.ready);
  const init = useSettings((s) => s.init);
  const current = useProjects((s) => s.current);
  const refresh = useProjects((s) => s.refresh);

  useEffect(() => {
    void init()
      .then(() => refresh())
      .then(() => useProjects.getState().reopenLast());
  }, [init, refresh]);

  // load world + roblox state whenever the current project changes
  useEffect(() => {
    if (!current) return;
    useAgents.getState().resetForProject();
    void useWorld.getState().loadForProject();
    void useRoblox.getState().refreshStudio();
    void useRoblox.getState().refreshCloud();
    useRoblox.setState((s) => ({ build: { ...s.build, step: "idle", log: [], diagnostics: [], rbxlPath: null }, publish: { ...s.publish, status: "idle", checks: [], message: null } }));
  }, [current?.row.id]);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <span className="dot dot-busy mr-2" /> Starting WorldForge AI…
      </div>
    );
  }
  return <TooltipProvider>{current ? <Workspace /> : <HomeScreen />}</TooltipProvider>;
}
