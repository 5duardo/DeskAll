import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "./icons";

const win = () => getCurrentWindow();

/** Custom title-bar controls (frameless window). */
export function WindowControls() {
  return (
    <div className="flex shrink-0 items-center">
      <CtrlBtn
        title="Minimizar"
        onClick={() => void win().minimize()}
      >
        <Minus className="size-3.5" strokeWidth={2} />
      </CtrlBtn>
      <CtrlBtn
        title="Maximizar"
        onClick={() =>
          void (async () => {
            const w = win();
            if (await w.isMaximized()) await w.unmaximize();
            else await w.maximize();
          })()
        }
      >
        <Square className="size-3" strokeWidth={2} />
      </CtrlBtn>
      <CtrlBtn
        title="Cerrar"
        danger
        onClick={() => void win().close()}
      >
        <X className="size-3.5" strokeWidth={2} />
      </CtrlBtn>
    </div>
  );
}

function CtrlBtn({
  title,
  onClick,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={[
        "grid h-9 w-11 cursor-pointer place-items-center border-0 bg-transparent transition",
        danger
          ? "text-ink-soft hover:bg-danger hover:text-white"
          : "text-ink-soft hover:bg-accent-soft hover:text-ink",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
