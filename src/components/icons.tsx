/**
 * DeskAll UI icons — Font Awesome 6 solid (filled by default).
 * Names keep the old Lucide/Phosphor aliases so call sites stay stable.
 */
import type { SVGProps } from "react";
import type { IconType } from "react-icons";
import {
  FaArrowRotateRight,
  FaArrowUpRightFromSquare,
  FaChevronLeft,
  FaCircleCheck,
  FaCircleNotch,
  FaCircleUp,
  FaClipboard,
  FaClock,
  FaCopy,
  FaDesktop,
  FaDownload,
  FaFileLines,
  FaFolder,
  FaFolderOpen,
  FaFolderPlus,
  FaFont,
  FaGamepad,
  FaGear,
  FaGlobe,
  FaHardDrive,
  FaImage,
  FaLink,
  FaMagnifyingGlass,
  FaMemory,
  FaMicrochip,
  FaMinus,
  FaMoon,
  FaPencil,
  FaPlus,
  FaServer,
  FaSquare,
  FaSun,
  FaTableCellsLarge,
  FaThumbtack,
  FaThumbtackSlash,
  FaTrash,
  FaUpload,
  FaWindowMaximize,
  FaXmark,
} from "react-icons/fa6";

export type SolidIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  /** Ignored — compatibility with older Lucide call sites */
  strokeWidth?: number | string;
  title?: string;
};

function solid(Icon: IconType) {
  return function SolidIcon({
    strokeWidth: _sw,
    size,
    className,
    title,
    ...rest
  }: SolidIconProps) {
    return (
      <Icon
        size={size ?? "1em"}
        className={className}
        title={title}
        aria-hidden={title ? undefined : true}
        {...rest}
      />
    );
  };
}

export const LayoutGrid = solid(FaTableCellsLarge);
export const Clipboard = solid(FaClipboard);
export const Settings = solid(FaGear);
export const Cpu = solid(FaMicrochip);
export const AppWindow = solid(FaWindowMaximize);
export const ChevronLeft = solid(FaChevronLeft);
export const Clock3 = solid(FaClock);
export const ExternalLink = solid(FaArrowUpRightFromSquare);
export const FolderPlus = solid(FaFolderPlus);
export const FolderOpen = solid(FaFolderOpen);
export const Gamepad2 = solid(FaGamepad);
export const Link2 = solid(FaLink);
export const Pencil = solid(FaPencil);
export const Plus = solid(FaPlus);
export const Search = solid(FaMagnifyingGlass);
export const Upload = solid(FaUpload);
export const X = solid(FaXmark);
export const FileText = solid(FaFileLines);
export const Folder = solid(FaFolder);
export const Globe = solid(FaGlobe);
export const ArrowUpCircle = solid(FaCircleUp);
export const CheckCircle2 = solid(FaCircleCheck);
export const Download = solid(FaDownload);
export const HardDriveDownload = solid(FaDownload);
export const LoaderCircle = solid(FaCircleNotch);
export const Monitor = solid(FaDesktop);
export const Moon = solid(FaMoon);
export const RefreshCw = solid(FaArrowRotateRight);
export const Sun = solid(FaSun);
export const HardDrive = solid(FaHardDrive);
export const MemoryStick = solid(FaMemory);
export const Server = solid(FaServer);
export const Minus = solid(FaMinus);
export const Square = solid(FaSquare);
export const Image = solid(FaImage);
export const Pin = solid(FaThumbtack);
export const PinOff = solid(FaThumbtackSlash);
export const Type = solid(FaFont);
export const Trash2 = solid(FaTrash);
export const Copy = solid(FaCopy);
